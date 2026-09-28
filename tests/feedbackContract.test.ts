// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    feedbackFor, acceptedFeedback, rejectedFeedback, winFeedback, vibrate,
    ACCEPTED_MS, REJECTED_MS, WIN_MS,
} from '@/app/dominoFill/feedback'

/**
 * What each outcome is actually allowed to do (spec P1-5, D10-f).
 *
 * The defect was not that sound existed; it was that `snap.mp3` played on *every* square
 * click, refused ones included, so the noise meaning "that worked" also meant "that did
 * not". A player learns within a dozen taps to stop trusting it. So the contract worth
 * pinning is a negative one -- which outcomes must stay silent -- and it is exactly the part
 * that a test asserting "a sound played" would miss.
 *
 * The second defect was allocation: one `new Audio` per click, i.e. one decoded media
 * element per tap for the length of a game.
 */

let play: ReturnType<typeof vi.fn>
let buzz: ReturnType<typeof vi.fn>
let constructed: string[]

beforeEach(() => {
    play = vi.fn(() => Promise.resolve())
    buzz = vi.fn()
    constructed = []

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
    Object.defineProperty(navigator, 'vibrate', { value: buzz, configurable: true })

    // Count constructions without replacing the element: the cache must be observed, not
    // simulated.
    const Real = globalThis.Audio
    class Counted extends Real {
        constructor(src?: string) { super(src); constructed.push(src ?? '') }
    }
    vi.stubGlobal('Audio', Counted)
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete (navigator as Partial<Navigator>).vibrate
})

describe('sound follows the outcome, not the event', () => {
    it('a placement is the case snap.mp3 was always supposed to mean', () => {
        feedbackFor('placed')
        expect(play).toHaveBeenCalledTimes(1)
        expect(constructed.at(-1)).toContain('snap.mp3')
    })

    it.each(['none', 'candidates', 'cleared'] as const)('%s plays nothing', outcome => {
        feedbackFor(outcome)
        expect(play, `${outcome} must be silent`).not.toHaveBeenCalled()
    })

    it('a refusal is felt but not heard, so it cannot be mistaken for success', () => {
        feedbackFor('none')
        expect(play).not.toHaveBeenCalled()
        expect(buzz).toHaveBeenCalledWith(REJECTED_MS)
    })

    it('a removal sounds too, and that is a decision rather than an oversight', () => {
        /*
         * `feedbackFor('removed')` routes to the same acceptance feedback as a placement.
         * It is a real action that changed the board; answering it with silence would make
         * taking a piece back feel exactly like the missed tap this whole feature exists to
         * distinguish. Pinned here so the routing cannot be "tidied" into silence without
         * someone deciding to.
         */
        feedbackFor('removed')
        expect(play).toHaveBeenCalledTimes(1)
        expect(buzz).toHaveBeenCalledWith(ACCEPTED_MS)
    })
})

describe('one element per sound', () => {
    it('a hundred placements do not allocate a hundred audio elements', () => {
        // The old code did precisely this, one per click, for the length of a game.
        for (let n = 0; n < 100; n++) acceptedFeedback()

        expect(play).toHaveBeenCalledTimes(100)
        expect(constructed.filter(src => src.includes('snap.mp3')).length).toBeLessThanOrEqual(1)
    })
})

describe('haptics carry the difference', () => {
    it('a correction does not feel like a confirmation', () => {
        expect(REJECTED_MS).toBeGreaterThan(ACCEPTED_MS)
    })

    it('the documented durations are the ones used', () => {
        acceptedFeedback()
        expect(buzz).toHaveBeenLastCalledWith(ACCEPTED_MS)
        rejectedFeedback()
        expect(buzz).toHaveBeenLastCalledWith(REJECTED_MS)
        winFeedback()
        expect(buzz).toHaveBeenLastCalledWith(WIN_MS)
    })

    it('survives a device with no vibration motor, and one whose motor throws', () => {
        // Absent on every desktop browser; throws in some embedded webviews. Either would
        // otherwise take down the move that triggered it.
        delete (navigator as Partial<Navigator>).vibrate
        expect(() => vibrate(10)).not.toThrow()

        Object.defineProperty(navigator, 'vibrate', {
            value: () => { throw new Error('no motor') }, configurable: true,
        })
        expect(() => vibrate(10)).not.toThrow()
    })
})
