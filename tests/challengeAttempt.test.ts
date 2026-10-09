import { describe, it, expect } from 'vitest'
import { addDays, afterWindow, inWindow, lastDay } from '@/app/challenge/window'
import { CLOCK_TOLERANCE_MS, elapsed, wentBack } from '@/app/challenge/clock'
import {
    finish, isAttempt, markAssisted, markClockError, reconcile, recover, RULESET, settle, sizeResult, start,
    type Attempt, type Board,
} from '@/app/challenge/attempt'

/**
 * Challenge slice 1, the pure half (NEXT-STEPS, "Challenge slice 1"): the window, the
 * attempt and every change to it, the clock. The storage half is challengeStore.test.ts.
 */

const BOARD: Board = { puzzleId: '2026-10-09-hard-1', definitionHash: 'h', date: '2026-10-09' }
const T0 = Date.UTC(2026, 9, 9, 10)

const started = (over: Partial<Attempt> = {}): Attempt => ({ ...start(null, BOARD, T0, '2026-10-09').next!, ...over })

describe('the window (rule 1)', () => {
    it('moves by the calendar, across a month, a year and a leap day', () => {
        expect(addDays('2026-10-09', 1)).toBe('2026-10-10')
        expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
        expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
        expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
        expect(lastDay('2026-12-31')).toBe('2027-01-01')
    })

    it('is the board\'s date and the day after, nothing else', () => {
        expect(inWindow('2026-10-09', '2026-10-08')).toBe(false)
        expect(inWindow('2026-10-09', '2026-10-09')).toBe(true)
        expect(inWindow('2026-10-09', '2026-10-10')).toBe(true)
        expect(inWindow('2026-10-09', '2026-10-11')).toBe(false)
        expect(inWindow('2026-12-31', '2027-01-01')).toBe(true)
    })

    it('is left from the day after the day after; a future board is neither in nor after it', () => {
        expect(afterWindow('2026-10-09', '2026-10-10')).toBe(false)
        expect(afterWindow('2026-10-09', '2026-10-11')).toBe(true)
        expect(afterWindow('2026-10-09', '2026-10-08')).toBe(false)
        expect(afterWindow('2026-12-31', '2027-01-02')).toBe(true)
    })

    it('refuses what isn\'t a day', () => {
        expect(() => addDays('2026-10-9', 1)).toThrow()
    })
})

describe('start (rules 3 and 4)', () => {
    it('makes an attempt inside the window, with nothing marked', () => {
        const step = start(null, BOARD, T0, '2026-10-10')
        expect(step.changed).toBe(true)
        expect(step.next).toEqual({ ...BOARD, ruleset: RULESET, startedAt: T0, assisted: false, clockError: false })
    })

    it('has no attempt to start outside it', () => {
        expect(start(null, BOARD, T0, '2026-10-11')).toEqual({ next: null, changed: false })
        expect(start(null, BOARD, T0, '2026-10-08')).toEqual({ next: null, changed: false })
    })

    it('resumes an attempt that exists, never restarts it', () => {
        const a = started()
        const again = start(a, BOARD, T0 + 60_000, '2026-10-09')
        expect(again).toEqual({ next: a, changed: false })
    })
})

describe('the flags only move forward (rules 5 and 7)', () => {
    it('set once, then unchanged', () => {
        const hinted = markAssisted(started())
        expect(hinted.changed).toBe(true)
        expect(hinted.next?.assisted).toBe(true)
        expect(markAssisted(hinted.next).changed).toBe(false)

        const erred = markClockError(started())
        expect(erred.next?.clockError).toBe(true)
        expect(markClockError(erred.next).changed).toBe(false)
    })

    it('set nothing once a result is fixed, or with no attempt', () => {
        const done = finish(started(), T0 + 1000, '2026-10-09').next
        expect(markAssisted(done)).toEqual({ next: done, changed: false })
        expect(markClockError(done)).toEqual({ next: done, changed: false })
        expect(markAssisted(null)).toEqual({ next: null, changed: false })
    })
})

describe('the finish (rules 5 and 6)', () => {
    it('is the placement\'s instant minus the start', () => {
        const step = finish(started(), T0 + 83_250, '2026-10-10')
        expect(step.next?.result).toEqual({ kind: 'solved', ms: 83_250 })
        expect(step.next?.finishedAt).toBe(T0 + 83_250)
    })

    it('after a hint, is a solve with a hint, with no time', () => {
        expect(finish(started({ assisted: true }), T0 + 5000, '2026-10-09').next?.result).toEqual({ kind: 'hinted' })
        // A hint is the player's own act, and wins over a clock error.
        expect(finish(started({ assisted: true, clockError: true }), T0 + 5000, '2026-10-09').next?.result)
            .toEqual({ kind: 'hinted' })
    })

    it('after a flagged clock error, has no time', () => {
        expect(finish(started({ clockError: true }), T0 + 5000, '2026-10-09').next?.result)
            .toEqual({ kind: 'untimed', reason: 'clock-error' })
    })

    it('before the start is a clock error found by the finish itself, with no check run (codex)', () => {
        const step = finish(started(), T0 - 1, '2026-10-09')
        expect(step.next?.result).toEqual({ kind: 'untimed', reason: 'clock-error' })
        expect(step.next?.clockError).toBe(true)
    })

    it('never gives a negative time, whatever the instants', () => {
        for (const offset of [-86_400_000, -5000, -1, 0, 1, 5000, 86_400_000]) {
            const result = finish(started(), T0 + offset, '2026-10-09').next?.result
            if (result?.kind === 'solved') expect(result.ms).toBeGreaterThanOrEqual(0)
        }
    })

    it('is refused outside the window, and once a result is fixed', () => {
        const a = started()
        expect(finish(a, T0 + 1000, '2026-10-11')).toEqual({ next: a, changed: false })
        const done = finish(a, T0 + 1000, '2026-10-09').next
        expect(finish(done, T0 + 2000, '2026-10-09')).toEqual({ next: done, changed: false })
        expect(finish(null, T0, '2026-10-09')).toEqual({ next: null, changed: false })
    })
})

describe('giving up (rule 8)', () => {
    it('settles an unfinished attempt once its date has left the window', () => {
        expect(settle(started(), '2026-10-10').changed).toBe(false)
        expect(settle(started(), '2026-10-11').next?.result).toEqual({ kind: 'given-up' })
    })

    it('never replaces a result', () => {
        const done = finish(started(), T0 + 1000, '2026-10-09').next
        expect(settle(done, '2026-10-20')).toEqual({ next: done, changed: false })
    })
})

describe('a lost finish, recovered from its solve evidence (rule 14)', () => {
    it('solved inside the window: the solve counts, with no time, even after the window', () => {
        const step = recover(started(), { solvedAt: T0 + 9000, solvedOn: '2026-10-10' })
        expect(step.next?.result).toEqual({ kind: 'untimed', reason: 'finish-lost' })
        expect(step.next?.finishedAt).toBe(T0 + 9000)
        // Run after the window has closed, the solve still counts: reconcile recovers first.
        expect(reconcile(started(), { solvedAt: T0 + 9000, solvedOn: '2026-10-10' }, '2026-10-15').next?.result)
            .toEqual({ kind: 'untimed', reason: 'finish-lost' })
    })

    it('judged by the solve\'s local date, not the instant (codex\'s time-zone case)', () => {
        // 2026-10-10T23:30Z is inside an October 9 window in UTC, outside it in Jerusalem.
        // Only the local date saved with the solve can tell; this one was saved in Jerusalem.
        const instant = Date.UTC(2026, 9, 10, 23, 30)
        expect(recover(started(), { solvedAt: instant, solvedOn: '2026-10-11' }).next?.result)
            .toEqual({ kind: 'given-up' })
        expect(recover(started(), { solvedAt: instant, solvedOn: '2026-10-10' }).next?.result)
            .toEqual({ kind: 'untimed', reason: 'finish-lost' })
    })

    it('a hinted attempt recovers as a solve with a hint', () => {
        expect(recover(started({ assisted: true }), { solvedAt: T0, solvedOn: '2026-10-09' }).next?.result)
            .toEqual({ kind: 'hinted' })
    })

    it('no evidence: still running, and given up once the window closes', () => {
        expect(recover(started(), null).changed).toBe(false)
        expect(reconcile(started(), null, '2026-10-10').changed).toBe(false)
        expect(reconcile(started(), null, '2026-10-11').next?.result).toEqual({ kind: 'given-up' })
    })

    it('evidence from before the board\'s date decides nothing; a result is never replaced', () => {
        expect(recover(started(), { solvedAt: T0, solvedOn: '2026-10-08' }).changed).toBe(false)
        const done = finish(started(), T0 + 1000, '2026-10-09').next
        expect(recover(done, { solvedAt: T0, solvedOn: '2026-10-09' }).changed).toBe(false)
    })
})

describe('a size\'s result (rule 10)', () => {
    const solved = (ms: number) => finish(started(), T0 + ms, '2026-10-09').next
    it('totals three boards solved with a time', () => {
        expect(sizeResult([solved(1000), solved(2000), solved(3500)])).toEqual({ kind: 'total', ms: 6500 })
    })

    it('is partial with any board hinted, untimed, given up, unfinished or not started', () => {
        const hinted = finish(started({ assisted: true }), T0 + 1, '2026-10-09').next
        const untimed = finish(started({ clockError: true }), T0 + 1, '2026-10-09').next
        const givenUp = settle(started(), '2026-10-11').next
        for (const third of [hinted, untimed, givenUp, started(), null]) {
            expect(sizeResult([solved(1000), solved(2000), third])).toEqual({ kind: 'partial' })
        }
        expect(sizeResult([solved(1000), solved(2000)])).toEqual({ kind: 'partial' })
    })
})

describe('the clock (rule 5)', () => {
    const at = (wall: number, mono: number) => ({ wall, mono })

    it('flags the wall clock falling the tolerance or more behind the monotonic one', () => {
        expect(CLOCK_TOLERANCE_MS).toBe(5000)
        // One second passes on the monotonic clock; the wall clock moves back 3.999 s, 4 s.
        expect(wentBack(at(10_000, 0), at(10_000 + 1000 - 4999, 1000))).toBe(false)
        expect(wentBack(at(10_000, 0), at(10_000 + 1000 - 5000, 1000))).toBe(true)
    })

    it('never flags the wall clock running ahead, which is what sleep looks like', () => {
        expect(wentBack(at(0, 0), at(3_600_000, 1000))).toBe(false)
    })

    it('measures from the saved start', () => {
        expect(elapsed(T0, T0 + 1234)).toBe(1234)
    })
})

describe('a stored attempt is checked, never believed', () => {
    it('accepts a real one, and refuses the shapes storage can hold', () => {
        const a = finish(started(), T0 + 1000, '2026-10-09').next
        expect(isAttempt(a)).toBe(true)
        expect(isAttempt(JSON.parse(JSON.stringify(a)))).toBe(true)
        for (const bad of [
            null, 'x', {}, { ...a, ruleset: 2 }, { ...a, date: '9 Oct' }, { ...a, startedAt: 'now' },
            { ...a, assisted: 'yes' }, { ...a, result: { kind: 'won' } }, { ...a, result: { kind: 'solved', ms: -1 } },
            { ...a, result: { kind: 'untimed', reason: 'bored' } }, { ...a, finishedAt: Number.NaN },
        ]) expect(isAttempt(bad)).toBe(false)
    })
})
