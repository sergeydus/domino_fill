// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MUTE_KEY, SoundStore } from '@/app/stores/SoundStore'
import {
    SOUND_FILES, acceptedFeedback, feedbackFor, preloadSounds, resetSoundsForTest,
    unlockSounds, winFeedback,
} from '@/app/dominoFill/feedback'

/**
 * Sound, and the ability to turn it off (spec P2-4, row 20d).
 *
 * Three of these are about failures that are invisible from inside the app: a relative
 * source that 404s below the root, an element iOS refuses because it was never primed in a
 * gesture, and a preference that does not survive a reload. None of them throws, and the
 * game plays perfectly while every one of them is true.
 */

type FakeAudio = {
    src: string
    preload: string
    muted: boolean
    currentTime: number
    plays: number
    pauses: number
    play: () => Promise<void>
    pause: () => void
}

let built: FakeAudio[]
let originalAudio: typeof globalThis.Audio

beforeEach(() => {
    resetSoundsForTest()
    built = []
    localStorage.clear()
    originalAudio = globalThis.Audio
    globalThis.Audio = vi.fn().mockImplementation((src: string) => {
        const audio: FakeAudio = {
            src, preload: '', muted: false, currentTime: 0, plays: 0, pauses: 0,
            play() { this.plays++; return Promise.resolve() },
            pause() { this.pauses++ },
        }
        built.push(audio)
        return audio
    }) as unknown as typeof globalThis.Audio
})

afterEach(() => { globalThis.Audio = originalAudio })

describe('the audio pool', () => {
    it('addresses every file absolutely', () => {
        /*
         * `new Audio('snap.mp3')` resolves against the *document's* URL, so the sound is
         * only correct at the root and 404s on any deeper route. The repository shipped a
         * second route at `/dominoFill` until row 20a, where this was live and silent.
         */
        for (const [name, file] of Object.entries(SOUND_FILES)) {
            expect(file, `${name} must be rooted`).toMatch(/^\//)
        }
    })

    it('builds one element per sound, however many times it is asked', () => {
        // The original defect was one `Audio` per click; a game accumulated a decoded
        // media element per tap.
        preloadSounds()
        preloadSounds()
        acceptedFeedback()
        acceptedFeedback()

        expect(built).toHaveLength(Object.keys(SOUND_FILES).length)
        expect(built.map(a => a.src).sort()).toEqual(Object.values(SOUND_FILES).sort())
    })

    it('asks for the file before it is needed', () => {
        // The first snap is the one most likely to arrive late, and a late snap reads as a
        // missed tap rather than as slow audio.
        preloadSounds()
        expect(built.map(a => a.preload)).toEqual(built.map(() => 'auto'))
    })

    it('rewinds, so a fast second move is not silent', () => {
        acceptedFeedback()
        const snap = built.find(a => a.src === SOUND_FILES.snap)!
        snap.currentTime = 1.5
        acceptedFeedback()
        expect(snap.currentTime).toBe(0)
    })

    it('survives a media element that throws outright', () => {
        // Some embedded webviews throw from `play()` rather than returning a promise.
        globalThis.Audio = vi.fn().mockImplementation(() => ({
            play: () => { throw new Error('NotAllowedError') },
            pause: () => { },
        })) as unknown as typeof globalThis.Audio

        expect(() => acceptedFeedback()).not.toThrow()
    })

    it('handles the rejection the autoplay policy actually produces', async () => {
        /*
         * The important half, and the one the test above does *not* cover -- found by
         * mutation: deleting the `.catch` survived it, because a `play` that throws
         * synchronously is caught by the surrounding `try` and never reaches a promise.
         *
         * What browsers really do is return a promise and reject it, and an unhandled
         * rejection is a console error in the middle of a move. Asserted by listening for
         * the rejection rather than by checking that `.catch` was called, so it is about
         * the outcome rather than about the shape of the code.
         */
        globalThis.Audio = vi.fn().mockImplementation(() => ({
            preload: '',
            currentTime: 0,
            play: () => Promise.reject(new Error('NotAllowedError')),
            pause: () => { },
        })) as unknown as typeof globalThis.Audio

        const unhandled: unknown[] = []
        const onUnhandled = (reason: unknown) => unhandled.push(reason)
        process.on('unhandledRejection', onUnhandled)
        try {
            acceptedFeedback()
            winFeedback()
            // Node reports an unhandled rejection once the microtask queue has drained.
            await new Promise(resolve => setTimeout(resolve, 0))
        } finally {
            process.off('unhandledRejection', onUnhandled)
        }

        expect(unhandled).toEqual([])
    })
})

describe('priming the pool for iOS', () => {
    /*
     * iOS unlocks media elements **individually**, and only from inside a gesture. The win
     * sound is the case that suffers: it used to be constructed in a store constructor and
     * first played minutes later, when a board was finally solved, so it could be refused
     * while the snap -- played straight out of a tap -- worked perfectly.
     */
    it('plays and stops every element, not just the one that is used first', async () => {
        unlockSounds()
        await settled()

        expect(built).toHaveLength(Object.keys(SOUND_FILES).length)
        for (const audio of built) {
            expect(audio.plays, `${audio.src} was never primed`).toBe(1)
            expect(audio.pauses, `${audio.src} was left playing`).toBe(1)
        }
    })

    it('primes silently, and leaves the elements as it found them', async () => {
        unlockSounds()
        await settled()
        for (const audio of built) {
            expect(audio.muted, 'a primed element must not stay muted').toBe(false)
            expect(audio.currentTime).toBe(0)
        }
    })

    it('does nothing the second time', async () => {
        unlockSounds()
        unlockSounds()
        await settled()
        for (const audio of built) expect(audio.plays).toBe(1)
    })
})

/**
 * Let the priming `then` run.
 *
 * `unlockSounds` pauses and unmutes each element in a `.then` on the promise `play()`
 * returns, so everything after the play itself lands a microtask later. Two turns, because
 * the handler itself queues nothing but the assertion reads state it wrote.
 */
const settled = async () => { await Promise.resolve(); await Promise.resolve() }

describe('muting', () => {
    it('is off by default', () => {
        expect(new SoundStore().muted).toBe(false)
    })

    it('survives a reload', () => {
        // A setting that resets every morning is one the player has to find every morning.
        new SoundStore().setMuted(true)
        expect(new SoundStore().muted).toBe(true)

        new SoundStore().setMuted(false)
        expect(new SoundStore().muted).toBe(false)
    })

    it('silences the sounds and leaves the haptics', () => {
        /*
         * Deliberate: on iOS the hardware mute switch already kills the whole audio
         * channel, which is why P1-5 treats vibration as the real feel budget. Taking that
         * away too would leave a muted player with no answer at all to a refused move.
         */
        const vibrate = vi.fn()
        Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })

        feedbackFor('placed', true)
        winFeedback(true)

        expect(built).toHaveLength(0)
        expect(vibrate).toHaveBeenCalledTimes(2)

        feedbackFor('placed', false)
        expect(built.map(a => a.src)).toEqual([SOUND_FILES.snap])
    })

    it('tolerates storage that throws rather than returning null', () => {
        // Safari's private mode, and anywhere site data is blocked. The preference is then
        // honoured for the session and simply not remembered.
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => { throw new Error('QuotaExceededError') })
        const store = new SoundStore()

        expect(() => store.setMuted(true)).not.toThrow()
        expect(store.muted, 'the session still honours it').toBe(true)
        setItem.mockRestore()
    })

    it('writes one key, and a readable one', () => {
        new SoundStore().setMuted(true)
        expect(localStorage.getItem(MUTE_KEY)).toBe('true')
        expect(MUTE_KEY).toMatch(/^dominoFill\./)
    })
})
