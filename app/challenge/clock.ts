/**
 * The challenge clock (Ruleset v1, rules 4 and 5, in NEXT-STEPS).
 *
 * The attempt's start is a wall-clock instant (`Date.now()`), saved before the board is
 * revealed, so a reload resumes the clock rather than restarting it -- `performance.now()`
 * restarts with every page (D4). The clock never pauses.
 *
 * A wall clock can be moved. This module catches one of the two ways rule 5 detects that:
 * while a page is open, the wall clock advancing well *less* than the page's monotonic clock.
 * The other, a finish earlier than the start, is caught where the finish is decided
 * (`finish` in `attempt.ts`), so it needs no reading from here.
 */

/**
 * How far behind the monotonic clock the wall clock must fall, between two readings, to
 * count as moved backwards.
 *
 * A chosen tolerance, not a bound on how far a clock is legitimately adjusted: automatic and
 * manual adjustments both happen, and a backwards change smaller than this isn't caught.
 */
export const CLOCK_TOLERANCE_MS = 5000

/** One reading of both clocks, taken together. */
export type Reading = { readonly wall: number, readonly mono: number }

/** Both clocks now. The sources are arguments so the rule is testable without a browser. */
export const read = (
    wall: () => number = Date.now,
    mono: () => number = () => performance.now(),
): Reading => ({ wall: wall(), mono: mono() })

/**
 * Whether the wall clock went backwards between two readings.
 *
 * Only that direction. Sleep can stop the monotonic clock in some browsers while the wall
 * clock carries on, which makes the wall clock look *ahead*, never behind -- so a forwards
 * difference, however large, is never flagged.
 */
export const wentBack = (before: Reading, after: Reading): boolean =>
    (after.wall - before.wall) - (after.mono - before.mono) <= -CLOCK_TOLERANCE_MS

/** Milliseconds since the attempt started, by the wall clock. Negative if it went back. */
export const elapsed = (startedAt: number, now: number): number => now - startedAt
