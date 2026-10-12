import { describe, expect, it } from 'vitest'
import { RULESET, type Attempt, type Result } from '@/app/challenge/attempt'
import { freezesBefore, milestoneOn, streakFrom } from '@/app/challenge/streak'
import { addDays } from '@/app/challenge/window'

/**
 * The streak and its freezes (slice 3b, rules 3 to 5; D9; the user's answers of
 * 2026-10-12). Every case is a list of board dates and what was done on them.
 */

let serial = 0
/** An attempt on `date`; `null` for one started and not finished. */
const on = (date: string, result: Result | null = { kind: 'solved', ms: 60_000 },
    over: Partial<Attempt> = {}): Attempt => ({
    puzzleId: `${date}|${serial++}`, definitionHash: 'h', date, ruleset: RULESET,
    startedAt: 0, assisted: false, clockError: false,
    ...(result ? { result } : {}), ...over,
})
/** One solved board on each of `count` consecutive dates from `from`. */
const run = (from: string, count: number) => Array.from({ length: count }, (_, n) => on(addDays(from, n)))

// Codex's example: Monday 2026-10-05, Tuesday, Thursday solved; Wednesday not.
const MON = '2026-10-05', TUE = '2026-10-06', WED = '2026-10-07', THU = '2026-10-08', FRI = '2026-10-09'

describe('played days', () => {
    it('are none, and nothing is shown, for a player who never played', () => {
        expect(streakFrom([], MON)).toMatchObject({ streak: 0, freezes: 0, playedEver: false })
        // Started but never solved: not a played day.
        expect(streakFrom([on(MON, null)], MON).playedEver).toBe(false)
    })

    it('count a hinted solve and a solve without a time, not a board given up', () => {
        expect(streakFrom([on(MON, { kind: 'solved', ms: 1 }, { assisted: true })], MON).streak).toBe(1)
        expect(streakFrom([on(MON, { kind: 'untimed', reason: 'clock-error' })], MON).streak).toBe(1)
        expect(streakFrom([on(MON, { kind: 'untimed', reason: 'finish-lost' })], MON).streak).toBe(1)
        expect(streakFrom([on(MON, { kind: 'given-up' })], MON)).toMatchObject({ streak: 0, playedEver: false })
    })

    it('count one day however many of its boards were solved', () => {
        expect(streakFrom([on(MON), on(MON), on(MON)], MON).streak).toBe(1)
    })

    it('are board dates: yesterday\'s board solved after midnight keeps yesterday', () => {
        // Monday's board solved at 00:30 on Tuesday: the attempt is Monday's.
        const late = on(MON, { kind: 'solved', ms: 60_000 }, { finishedAt: Date.UTC(2026, 9, 6, 0, 30) })
        expect(streakFrom([late], TUE).days.get(MON)?.played).toBe(true)
        expect(streakFrom([late], TUE).days.get(TUE)?.played).toBe(false)
        expect(streakFrom([late, on(TUE)], TUE).streak).toBe(2)
    })

    it('ignore a date after the device\'s until it arrives (user, 2026-10-12)', () => {
        expect(streakFrom([on(TUE)], MON)).toMatchObject({ streak: 0, playedEver: false })
        expect(streakFrom([on(MON), on(TUE)], MON).streak).toBe(1)
        expect(streakFrom([on(MON), on(TUE)], TUE).streak).toBe(2)
    })
})

describe('missed days', () => {
    it('are not missed while they can still be played: today and yesterday', () => {
        // Played Monday; on Wednesday, Tuesday is yesterday and still playable.
        expect(streakFrom([on(MON)], WED).streak).toBe(1)
        expect(streakFrom([on(MON)], TUE).streak).toBe(1)
    })

    it('break the streak the day they leave the window, two days on, not one', () => {
        // Tuesday unplayed leaves the window on Thursday.
        expect(streakFrom([on(MON)], WED).streak).toBe(1)
        expect(streakFrom([on(MON)], THU).streak).toBe(0)
    })

    it('leave the day after the gap alone when the streak breaks', () => {
        // Tue, a gap on Wed, then Thu: no freeze yet, so on Friday it is Thursday alone.
        expect(streakFrom([on(TUE), on(THU)], FRI).streak).toBe(1)
        // And with nothing played after the gap, it is 0.
        expect(streakFrom([on(TUE)], FRI).streak).toBe(0)
    })
})

describe('freezes (D9; user, 2026-10-12)', () => {
    it('codex\'s example: Thursday\'s freeze covers Wednesday once Wednesday leaves the window', () => {
        const history = [on(MON), on(TUE), on(THU)]
        expect(streakFrom(history, THU)).toMatchObject({ streak: 3, freezes: 1 })
        const friday = streakFrom(history, FRI)
        expect(friday).toMatchObject({ streak: 3, freezes: 0 })
        expect(friday.days.get(WED)).toEqual({ played: false, frozen: true, streak: 2 })
        // Had Thursday not been played, there is no freeze, and Friday reads a broken streak.
        expect(streakFrom([on(MON), on(TUE)], FRI)).toMatchObject({ streak: 0, freezes: 0 })
    })

    it('are earned on every third played day', () => {
        expect(streakFrom(run(MON, 2), TUE).freezes).toBe(0)
        expect(streakFrom(run(MON, 3), WED).freezes).toBe(1)
        expect(streakFrom(run(MON, 6), addDays(MON, 5)).freezes).toBe(2)
    })

    it('stop at 3, and counting starts again once one is used', () => {
        const day = (n: number) => addDays(MON, n)
        expect(streakFrom(run(MON, 9), day(8)).freezes).toBe(3)
        // Two more played days at the cap earn nothing.
        expect(streakFrom(run(MON, 11), day(10)).freezes).toBe(3)
        // 9 played (3 freezes), day 9 missed, then days 10 to 13. Day 9 is settled after day
        // 10 is counted, so day 10 is still at the cap and counts nothing; the freeze used on
        // day 9 is earned back on day 13, the third played day after it was used.
        const after = [...run(MON, 9), ...run(day(10), 4)]
        expect(streakFrom(after, day(12))).toMatchObject({ freezes: 2, streak: 12 })
        expect(streakFrom(after, day(13))).toMatchObject({ freezes: 3, streak: 13 })
    })

    it('a frozen day keeps the streak and adds nothing', () => {
        // 3 played (a freeze), 1 missed, 1 played: 4, not 5.
        const history = [...run(MON, 3), on(FRI)]
        expect(streakFrom(history, addDays(FRI, 1))).toMatchObject({ streak: 4, freezes: 0 })
    })

    it('a break starts freeze progress over', () => {
        // Mon, a gap on Tue with no freeze, then Wed and Thu: broken, and counting restarts
        // at Wednesday, so Thursday is only the second day toward a freeze.
        const history = [on(MON), on(WED), on(THU)]
        expect(streakFrom(history, FRI)).toMatchObject({ streak: 2, freezes: 0 })
        // Friday is the third since the break: a freeze.
        expect(streakFrom([...history, on(FRI)], FRI)).toMatchObject({ streak: 3, freezes: 1 })
    })
})

describe('the results screen\'s lines (rule 6)', () => {
    it('a milestone shows on the day that reached it, and on no other', () => {
        const seven = run(MON, 8)
        const read = streakFrom(seven, addDays(MON, 7))
        expect(milestoneOn(read, addDays(MON, 6))).toBe(7)
        expect(milestoneOn(read, addDays(MON, 5))).toBeNull()
        expect(milestoneOn(read, addDays(MON, 7))).toBeNull()
        expect(milestoneOn(streakFrom(run(MON, 30), addDays(MON, 29)), addDays(MON, 29))).toBe(30)
    })

    it('no milestone on an unplayed day, even at a milestone count', () => {
        // 7 played, then a frozen day: its streak is still 7, but it wasn't played.
        const read = streakFrom([...run(MON, 7), on(addDays(MON, 8))], addDays(MON, 9))
        expect(read.days.get(addDays(MON, 7))).toMatchObject({ played: false, frozen: true, streak: 7 })
        expect(milestoneOn(read, addDays(MON, 7))).toBeNull()
    })

    it('names the freezes used since the previous played day', () => {
        // 6 played (2 freezes), two missed, then played: both frozen days are named.
        const sixth = addDays(MON, 5)
        const back = addDays(MON, 8)
        const read = streakFrom([...run(MON, 6), on(back)], addDays(back, 1))
        expect(freezesBefore(read, back)).toEqual([addDays(MON, 6), addDays(MON, 7)])
        expect(freezesBefore(read, sixth)).toEqual([])
        // Only since the previous played day: an earlier frozen day isn't named again.
        const twice = [...run(MON, 6), on(addDays(MON, 7)), on(addDays(MON, 9))]
        const both = streakFrom(twice, addDays(MON, 10))
        expect(both.days.get(addDays(MON, 6))?.frozen).toBe(true)
        expect(freezesBefore(both, addDays(MON, 9))).toEqual([addDays(MON, 8)])
        // Codex's example: Thursday's results, read on Friday, name Wednesday.
        expect(freezesBefore(streakFrom([on(MON), on(TUE), on(THU)], FRI), THU)).toEqual([WED])
    })
})
