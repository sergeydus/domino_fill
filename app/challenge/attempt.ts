import { afterWindow, inWindow } from './window'

/**
 * A challenge board's attempt, and every change to it (Ruleset v1, rules 3 to 10 and 14, in
 * NEXT-STEPS).
 *
 * Each change is a pure function from the record as it is to the record it becomes, and the
 * store (`attemptStore.ts`) runs it inside one transaction, so the check and the write
 * cannot be split by another tab. The record only moves forward (rule 15): a change that
 * would go backwards -- a second start, a flag cleared, a fixed result replaced -- returns
 * the record unchanged and says so, and the caller decides what the player sees.
 */

/** The ruleset every result here was produced under. Saved with each attempt. */
export const RULESET = 1

/**
 * How an attempt ended (rule 9). "Not started" is no record at all, and "in progress" is a
 * record without a result, so neither is a result.
 */
export type Result =
    | { readonly kind: 'solved', readonly ms: number }
    | { readonly kind: 'hinted' }
    | { readonly kind: 'untimed', readonly reason: 'clock-error' | 'finish-lost' }
    | { readonly kind: 'given-up' }

export type Attempt = {
    readonly puzzleId: string
    readonly definitionHash: string
    /** The board's date, `YYYY-MM-DD`: the date the window is measured from. */
    readonly date: string
    readonly ruleset: typeof RULESET
    /** The wall-clock instant Start was pressed, in epoch ms. */
    readonly startedAt: number
    /** Hint or Check was used during the attempt (rule 7). Never cleared. */
    readonly assisted: boolean
    /** The device clock was seen going backwards (rule 5). Never cleared. */
    readonly clockError: boolean
    readonly result?: Result
    /** When the result was fixed, if it came from a solve. */
    readonly finishedAt?: number
}

/** A change's outcome: the record afterwards, and whether this change made it so. */
export type Step = { readonly next: Attempt | null, readonly changed: boolean }

const same = (attempt: Attempt | null): Step => ({ next: attempt, changed: false })
const to = (attempt: Attempt): Step => ({ next: attempt, changed: true })

/** What a board's attempt is about. */
export type Board = { readonly puzzleId: string, readonly definitionHash: string, readonly date: string }

/**
 * Start (rules 3 and 4). An attempt that already exists is resumed, never restarted -- so a
 * second tab's Start, or a second press, changes nothing -- and a board outside its window
 * has no attempt to start.
 */
export const start = (current: Attempt | null, board: Board, now: number, deviceDate: string): Step => {
    if (current) return same(current)
    if (!inWindow(board.date, deviceDate)) return same(null)
    return to({
        puzzleId: board.puzzleId,
        definitionHash: board.definitionHash,
        date: board.date,
        ruleset: RULESET,
        startedAt: now,
        assisted: false,
        clockError: false,
    })
}

/**
 * Hint or Check was used (rule 7). Only during an attempt: once a result is fixed, a hint
 * from another tab finds it, sets nothing, and the store reports that, so no hint is shown
 * against a result it can no longer change.
 */
export const markAssisted = (current: Attempt | null): Step =>
    !current || current.result || current.assisted ? same(current) : to({ ...current, assisted: true })

/** The device clock was seen going backwards (rule 5). Only during an attempt. */
export const markClockError = (current: Attempt | null): Step =>
    !current || current.result || current.clockError ? same(current) : to({ ...current, clockError: true })

/**
 * The result an attempt ends with when it's solved at `now`.
 *
 * An assisted attempt is a solve with a hint whatever else happened: the hint is the
 * player's own act, and neither result has a time. Otherwise a clock error -- flagged
 * earlier, or found here as a finish before the start -- leaves the solve without a time, so
 * a negative or shortened time can never become a result.
 */
const solvedResult = (attempt: Attempt, now: number): Result => {
    if (attempt.assisted) return { kind: 'hinted' }
    if (attempt.clockError || now < attempt.startedAt) return { kind: 'untimed', reason: 'clock-error' }
    return { kind: 'solved', ms: now - attempt.startedAt }
}

/**
 * The winning placement (rule 6). Accepted only while the board's date is inside the window
 * and the attempt has no result yet; once fixed, a result never changes, so a second
 * finish -- another tab's, or a late one -- changes nothing.
 */
export const finish = (current: Attempt | null, now: number, deviceDate: string): Step => {
    if (!current || current.result) return same(current)
    if (!inWindow(current.date, deviceDate)) return same(current)
    const result = solvedResult(current, now)
    const clockError = current.clockError || now < current.startedAt
    return to({ ...current, clockError, result, finishedAt: now })
}

/** Unfinished when its date has left the window: given up, with no time (rule 8). */
export const settle = (current: Attempt | null, deviceDate: string): Step =>
    !current || current.result || !afterWindow(current.date, deviceDate)
        ? same(current)
        : to({ ...current, result: { kind: 'given-up' } })

/**
 * What was saved with the board at its winning placement (rule 14): the instant, and the
 * device's local date then. The local date decides, because an instant alone can't say which
 * calendar day a solve fell on once the player has changed time zone.
 */
export type SolveEvidence = { readonly solvedAt: number, readonly solvedOn: string }

/**
 * A finish whose save was lost (rule 14), decided from the solve evidence that survived.
 * Runs before `settle`, so a solve made in time is never settled as given up.
 *
 * Solved inside the window: the solve counts, with no time, even when this runs after the
 * window has closed. Solved after it: given up. No evidence, or evidence from before the
 * board's date, which no attempt can have: nothing to decide, so the attempt is left as it
 * is, still running, and `settle` gives it up once the window closes.
 */
export const recover = (current: Attempt | null, evidence: SolveEvidence | null): Step => {
    if (!current || current.result || !evidence) return same(current)
    if (inWindow(current.date, evidence.solvedOn)) {
        const result: Result = current.assisted ? { kind: 'hinted' } : { kind: 'untimed', reason: 'finish-lost' }
        return to({ ...current, result, finishedAt: evidence.solvedAt })
    }
    if (afterWindow(current.date, evidence.solvedOn)) return to({ ...current, result: { kind: 'given-up' } })
    return same(current)
}

/** On every open and every finish: recover a lost finish first, then settle (rules 8, 14). */
export const reconcile = (current: Attempt | null, evidence: SolveEvidence | null, deviceDate: string): Step => {
    const recovered = recover(current, evidence)
    const settled = settle(recovered.next, deviceDate)
    return { next: settled.next, changed: recovered.changed || settled.changed }
}

/**
 * A size's result from its three boards' attempts (rule 10): a total when all three were
 * solved with a time, otherwise partial.
 */
export type SizeResult = { readonly kind: 'total', readonly ms: number } | { readonly kind: 'partial' }

export const sizeResult = (attempts: readonly (Attempt | null)[]): SizeResult => {
    const times = attempts.map(a => (a?.result?.kind === 'solved' ? a.result.ms : null))
    return attempts.length === 3 && times.every(t => t !== null)
        ? { kind: 'total', ms: times.reduce<number>((sum, t) => sum + (t as number), 0) }
        : { kind: 'partial' }
}

/* ------------------------------------------------------------- validation */

const isResult = (value: unknown): value is Result => {
    if (typeof value !== 'object' || value === null) return false
    const r = value as Record<string, unknown>
    switch (r.kind) {
        case 'solved': return typeof r.ms === 'number' && Number.isFinite(r.ms) && r.ms >= 0
        case 'hinted':
        case 'given-up': return true
        case 'untimed': return r.reason === 'clock-error' || r.reason === 'finish-lost'
        default: return false
    }
}

/**
 * Whether a stored value is an attempt. Storage is hostile -- an older version, another tab
 * mid-write, a devtools console -- so nothing is believed until it's checked. A value that
 * fails reads as no attempt.
 */
export const isAttempt = (value: unknown): value is Attempt => {
    if (typeof value !== 'object' || value === null) return false
    const a = value as Record<string, unknown>
    const instant = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
    return typeof a.puzzleId === 'string'
        && typeof a.definitionHash === 'string'
        && typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date)
        && a.ruleset === RULESET
        && instant(a.startedAt)
        && typeof a.assisted === 'boolean'
        && typeof a.clockError === 'boolean'
        && (a.result === undefined || isResult(a.result))
        && (a.finishedAt === undefined || instant(a.finishedAt))
}
