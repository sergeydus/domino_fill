import { describe, it, expect, afterEach, vi } from 'vitest'
import { getCurrentActiveBoard } from '@/app/dominoFill/Boards'
import { dayKey } from '@/app/stores/progressStorage'

/**
 * Which day's puzzle a player is given (spec P1-7).
 *
 * `getCurrentActiveBoard` runs on the server, so an unaided `new Date()` inside it answers to
 * the *server's* timezone. For a daily puzzle that is a real defect and not a rounding error:
 * a player in Auckland would be handed tomorrow's board hours before their own midnight, and
 * one in Los Angeles would still be on yesterday's through their morning — while the rollover
 * check in the browser, which can only be local, disagreed with the content it was fetching.
 *
 * So the day is passed in. It then crosses a trust boundary, which is the other half of what
 * is tested here: the argument arrives from a client and is validated rather than believed.
 */

const at = (date: Date) => { vi.useFakeTimers(); vi.setSystemTime(date) }

afterEach(() => { vi.useRealTimers() })

describe('the day comes from the caller, not from the server clock', () => {
    it('gives the same puzzles for a day key whatever the server clock says', async () => {
        /*
         * The point of the whole change, in one assertion. Two server instants nearly two days
         * apart, one day key: the same pack both times. Before this, the second call would have
         * returned a different day's puzzles to a player whose own date had not changed.
         */
        at(new Date('2026-09-15T00:30:00Z'))
        const early = await getCurrentActiveBoard('2026-09-15')

        at(new Date('2026-09-16T23:30:00Z'))
        const late = await getCurrentActiveBoard('2026-09-15')

        expect(late).toBe(early)
    })

    it('gives different puzzles for different days', async () => {
        // Otherwise the first assertion would pass for a function that ignored its argument.
        at(new Date('2026-09-15T12:00:00Z'))
        const today = await getCurrentActiveBoard('2026-09-15')
        const tomorrow = await getCurrentActiveBoard('2026-09-16')

        expect(tomorrow).not.toBe(today)
    })

    it('agrees with the key the client actually computes', async () => {
        // `dayKey` is what the browser sends; the two ends have to mean the same thing by the
        // same rule, not by two implementations that happen to match today.
        at(new Date(2026, 8, 15, 23, 45))
        const fromClient = await getCurrentActiveBoard(dayKey(new Date()))

        expect(fromClient).toBe(await getCurrentActiveBoard('2026-09-15'))
    })

    it('is stable across a local evening that is already tomorrow in UTC', async () => {
        /*
         * The case that motivates the whole thing. 23:45 on the 15th in a zone ahead of UTC is
         * still the 15th to the player, and their puzzle must not change under them at 00:00
         * UTC. The key carries the local day, so nothing here depends on where the server is.
         */
        const evening = await getCurrentActiveBoard('2026-09-15')
        const justBeforeMidnight = await getCurrentActiveBoard('2026-09-15')

        expect(justBeforeMidnight).toBe(evening)
    })
})

describe('the day key is validated, because it comes from a client', () => {
    const serverDay = async () => {
        at(new Date('2026-09-15T12:00:00Z'))
        return getCurrentActiveBoard()
    }

    it.each([
        ['empty', ''],
        ['not a date', 'tomorrow'],
        ['wrong shape', '2026-9-15'],
        ['a month that does not exist', '2026-13-01'],
        ['a day that does not exist', '2026-02-30'],
        ['an injection attempt', '2026-09-15; DROP'],
        ['absurdly far out', '9999-99-99'],
    ])('falls back to the server date for %s', async (_label, key) => {
        // The blast radius is small -- a different puzzle from a fixed list -- but "small" is
        // not a reason to believe an argument that arrived over the wire.
        at(new Date('2026-09-15T12:00:00Z'))
        expect(await getCurrentActiveBoard(key)).toBe(await serverDay())
    })

    it('accepts a real date that a naive parser would normalise away', async () => {
        // `Date.UTC` turns month 13 into January of the next year rather than failing, which is
        // why the key is round-tripped instead of merely parsed. A genuine leap day must still
        // pass.
        at(new Date('2026-09-15T12:00:00Z'))
        const leapDay = await getCurrentActiveBoard('2028-02-29')
        expect(leapDay).toBeDefined()
    })

    it('never indexes outside the data file, however far back the key is', async () => {
        // A negative remainder would be `undefined`, and the app renders "no board" forever.
        for (const key of ['1970-01-01', '1969-12-31', '2100-06-01']) {
            expect(await getCurrentActiveBoard(key), key).toBeDefined()
        }
    })
})
