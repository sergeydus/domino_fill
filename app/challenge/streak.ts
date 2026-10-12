import type { Attempt } from './attempt'
import { addDays } from './window'

/**
 * The streak and its freezes, derived from the attempts (slice 3b, rules 3 to 5).
 *
 * Nothing about the streak is stored: every attempt this device has ever saved is kept
 * (`attemptStore.ts`), so the streak can be worked out again from them at any time, and a
 * stored counter could only ever disagree with them.
 *
 * Days are **board dates**, not the instants of the solves: yesterday's board solved just
 * after midnight keeps yesterday (D8, D9). A day is played when at least one of its boards
 * was solved, with or without a time and with or without hints (D9, 2026-10-09).
 */

export const MILESTONES: readonly number[] = [7, 30, 100, 365]
const MAX_FREEZES = 3
const DAYS_PER_FREEZE = 3

export type StreakDay = {
    readonly played: boolean
    /** Missed, and covered by a freeze. */
    readonly frozen: boolean
    /** The streak after this date's step of the walk. */
    readonly streak: number
}

export type Streak = {
    readonly streak: number
    readonly freezes: number
    /** Has the player ever played the challenge? The count beside Archive needs it (rule 13). */
    readonly playedEver: boolean
    /** Every date the walk visited, from the first played day to the device's date. */
    readonly days: ReadonlyMap<string, StreakDay>
}

const playedDays = (attempts: Iterable<Attempt>, deviceDate: string): Set<string> => {
    const days = new Set<string>()
    for (const attempt of attempts) {
        const kind = attempt.result?.kind
        // A date after the device's own counts nowhere until it arrives (user, 2026-10-12).
        if ((kind === 'solved' || kind === 'untimed') && attempt.date <= deviceDate) days.add(attempt.date)
    }
    return days
}

/**
 * The walk of rule 4. At each date `t`: first count `t`, then settle the day before it, if
 * that day wasn't played and can no longer be (the device's date is two days past it). So a
 * day is missed only once it can't be played any more, and a freeze earned in the meantime
 * covers it (user, 2026-10-12, on codex's Monday-Tuesday-Thursday example).
 */
export const streakFrom = (attempts: Iterable<Attempt>, deviceDate: string): Streak => {
    const played = playedDays(attempts, deviceDate)
    const days = new Map<string, StreakDay>()
    if (played.size === 0) return { streak: 0, freezes: 0, playedEver: false, days }
    const first = [...played].sort()[0]
    let streak = 0
    let freezes = 0
    let toward = 0
    for (let t = first; t <= deviceDate; t = addDays(t, 1)) {
        const isPlayed = played.has(t)
        if (isPlayed) {
            streak++
            // At the cap nothing counts toward the next (user, 2026-10-12).
            if (freezes < MAX_FREEZES && ++toward === DAYS_PER_FREEZE) {
                freezes++
                toward = 0
            }
        }
        const m = addDays(t, -1)
        if (m >= first && !played.has(m) && addDays(m, 2) <= deviceDate) {
            if (freezes > 0) {
                // A frozen day keeps the streak and adds nothing to it (user, 2026-10-12).
                freezes--
                days.set(m, { ...days.get(m)!, frozen: true })
            } else {
                // Broken: what's left after the gap is `t` alone (user, 2026-10-12).
                streak = isPlayed ? 1 : 0
                toward = isPlayed ? 1 : 0
            }
        }
        days.set(t, { played: isPlayed, frozen: false, streak })
    }
    return { streak, freezes, playedEver: true, days }
}

/** The milestone reached on `date`, if it was played and its step reached one (rule 6). */
export const milestoneOn = (streak: Streak, date: string): number | null => {
    const day = streak.days.get(date)
    return day?.played && MILESTONES.includes(day.streak) ? day.streak : null
}

/** The frozen dates between the last played day before `date` and `date` (rule 6). */
export const freezesBefore = (streak: Streak, date: string): string[] => {
    const frozen: string[] = []
    for (let d = addDays(date, -1); ; d = addDays(d, -1)) {
        const day = streak.days.get(d)
        if (!day || day.played) return frozen.reverse()
        if (day.frozen) frozen.push(d)
    }
}
