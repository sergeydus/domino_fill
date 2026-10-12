import type { Result, SizeResult } from '../challenge/attempt'
import { DIFFICULTY_NAME } from './difficultyName'

/**
 * The Daily Challenge's words (slice 3a, rules 10, 13, 15), in one place so the clock line
 * and the card can never describe the same result two ways.
 *
 * Principle 5: nothing here calls a time verified or official. A time measured in a
 * browser proves nothing about who solved the board or how.
 */

/** `m:ss` below an hour, `h:mm:ss` from one. Whole seconds, rounded down. */
export const formatTime = (ms: number): string => {
    const total = Math.floor(Math.max(0, ms) / 1000)
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    const seconds = String(total % 60).padStart(2, '0')
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/** How a result reads: "1:23 · no hints", or why there is no time. */
export const resultWords = (result: Result, assisted: boolean): string => {
    switch (result.kind) {
        case 'solved': return `${formatTime(result.ms)} · ${assisted ? 'hints used' : 'no hints'}`
        case 'untimed': return result.reason === 'clock-error'
            ? 'Time unavailable: the device clock changed'
            : 'Time unavailable: the finish wasn\'t saved in time'
        case 'given-up': return 'Given up: not solved in time'
    }
}

/** "Easy · 6×6 · puzzle 1 of 3": which of the nine a board is. */
export const boardName = (difficulty: keyof typeof DIFFICULTY_NAME, size: number, level: number): string =>
    `${DIFFICULTY_NAME[difficulty]} · ${size}×${size} · puzzle ${level} of 3`

/** A size's line, on the results screen and in Share alike (slice 3b, rules 6 and 11). */
export const sizeWords = (result: SizeResult): string =>
    result.kind === 'total'
        ? `${formatTime(result.ms)}${result.assisted ? ' · with hints' : ''}`
        : 'partial'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "12 Oct 2026", from a `YYYY-MM-DD` date: no time zone is involved, only the calendar. */
export const dayWords = (date: string): string => {
    const [year, month, day] = date.split('-').map(Number)
    return `${day} ${MONTHS[month - 1]} ${year}`
}
