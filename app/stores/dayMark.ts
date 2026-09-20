import { definitionFrom, type StoredPuzzle } from "./PuzzleDefinition"
import { isExpired, progressFor, type PuzzleProgress } from "./progressStorage"

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
 * Judge one day from its own puzzles and the records on hand.
 *
 * `puzzles` are the day's nine, straight from the chunk — so the ids are the real ones and
 * nothing is derived by parsing a `puzzleId` for the date it contains.
 *
 * `definitionFrom` hashes a board, so it is only ever reached for a puzzle that actually has
 * a record. A month of thirty untouched days therefore costs thirty lookups and no hashing.
 */
export const markForDay = (
    puzzles: readonly StoredPuzzle[],
    progress: Record<string, PuzzleProgress>,
    now: number,
): DayMark => {
    let played = 0
    let done = 0
    for (const stored of puzzles) {
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
