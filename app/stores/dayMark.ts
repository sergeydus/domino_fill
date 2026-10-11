import { definitionFrom, type StoredPuzzle } from "./PuzzleDefinition"
import { isExpired, progressFor, type PuzzleProgress } from "./progressStorage"
import type { Attempt } from "../challenge/attempt"

/**
 * How a day looks in the archive (spec P1-6/P1-7, row 18d).
 *
 * A separate module because the first version of this lived in the component and asked the
 * wrong question. It read `readAllProgress()` and looked at `record.completed`, which is to
 * say it believed storage. Everywhere else in the app a saved record is *checked* before it
 * counts — `progressFor` requires the `definitionHash`, the size, the rock positions, that
 * every placed half belongs to exactly one well-formed domino, and that a `completed: true`
 * record really is a full board matching its targets — and `pruneStorage` is best-effort, so
 * an expired record can still be sitting there when deletion was refused.
 *
 * A mark that skips those checks is not a smaller version of the truth, it is a different
 * claim: a day the player never finished shows as finished because someone edited a flag in
 * a console, or a day whose record aged out three weeks ago still shows as played because
 * the browser refused a `removeItem` under quota pressure. The archive is a record of what
 * you did; it has to be as hard to fool as the restore is.
 */

export type DayMark = 'none' | 'started' | 'partial' | 'complete'

/**
 * A challenge day's attempts (slice 3a, rule 18): the coordinator's `history`, and the date
 * of the chunk day they are judged against, passed in from the chunk rather than parsed out
 * of an id.
 */
export type DayAttempts = {
    readonly date: string
    readonly attempts: ReadonlyMap<string, Attempt>
}

/**
 * Judge one day from its own puzzles and the records on hand.
 *
 * `puzzles` are the day's nine, straight from the chunk — so the ids are the real ones and
 * nothing is derived by parsing a `puzzleId` for the date it contains.
 *
 * `definitionFrom` hashes a board, so it is only ever reached for a puzzle that actually has
 * a record. A month of thirty untouched days therefore costs thirty lookups and no hashing.
 *
 * **A board with a challenge attempt is judged by the attempt** (slice 3a, rule 18): played,
 * and done when its result is a solve, timed or not; given up is played, not done. Progress
 * can't answer for it: Practice clears the board the result was won on, and progress ages
 * out after `RETENTION_DAYS`, while the result is permanent. An attempt counts only if it is
 * this published board's: its puzzle ID, definition hash and date must all match (codex),
 * since `isAttempt` checks a record's shape, not whose it is. Otherwise the board is judged
 * from progress, as before.
 */
export const markForDay = (
    puzzles: readonly StoredPuzzle[],
    progress: Record<string, PuzzleProgress>,
    now: number,
    challenge?: DayAttempts,
): DayMark => {
    let played = 0
    let done = 0
    for (const stored of puzzles) {
        const attempt = challenge?.attempts.get(stored.puzzleId)
        if (attempt && attempt.puzzleId === stored.puzzleId && attempt.date === challenge!.date
            && attempt.definitionHash === definitionFrom(stored).definitionHash) {
            played++
            if (attempt.result && attempt.result.kind !== 'given-up') done++
            continue
        }
        const record = progress[stored.puzzleId]
        if (!record || isExpired(record.savedAt, now)) continue
        const valid = progressFor(record, definitionFrom(stored))
        if (!valid) continue
        played++
        if (valid.completed) done++
    }

    // Also the answer for a day whose chunk has not arrived: the loop runs zero times, so
    // `played` is zero. An explicit empty-array guard above this was mutation-tested and
    // deleted -- it could not change any outcome.
    if (played === 0) return 'none'
    if (done === puzzles.length) return 'complete'
    return done > 0 ? 'partial' : 'started'
}
