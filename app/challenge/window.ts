/**
 * The Daily Challenge's window (Ruleset v1, rule 1, in NEXT-STEPS).
 *
 * A date's nine boards are challenge boards while the device's date is that date or the day
 * after, and archive boards from then on. Both dates are `dayKey` strings (`YYYY-MM-DD`, the
 * device's local calendar), and the window is judged on them alone: no instants and no time
 * zone arithmetic. That is the point of keeping it on the calendar -- a player who changes
 * time zone changes what today is *called*, and the rule is about what it is called.
 *
 * Eligibility is always computed from the board's date and the device's date *now*, never
 * from which boards the app has fetched (codex): a refetch can fail offline, and a tab may
 * deliberately keep the board it is on.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `day` moved by `days` on the calendar.
 *
 * Done in UTC on purpose, and only for the arithmetic: a UTC date has no daylight-saving
 * gaps, so adding a day can never land on the same date or skip one. The result is a
 * calendar date again, not an instant.
 */
export const addDays = (day: string, days: number): string => {
    const match = DAY.exec(day)
    if (!match) throw new Error(`not a day: ${day}`)
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** The last device date on which a board of `boardDate` is still a challenge board. */
export const lastDay = (boardDate: string): string => addDays(boardDate, 1)

/** Whether a board of `boardDate` is a challenge board on `deviceDate`. */
export const inWindow = (boardDate: string, deviceDate: string): boolean =>
    deviceDate === boardDate || deviceDate === lastDay(boardDate)

/**
 * Whether `deviceDate` is past the window, so an unfinished attempt is given up (rule 8).
 *
 * `YYYY-MM-DD` strings order as their dates do, so this is a string comparison. A device
 * date *before* the board's is neither inside nor after: that board is in the future.
 */
export const afterWindow = (boardDate: string, deviceDate: string): boolean =>
    deviceDate > lastDay(boardDate)
