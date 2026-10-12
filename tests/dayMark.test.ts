// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { markForDay } from '@/app/stores/dayMark'
import { definitionFrom, type StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import { RETENTION_DAYS, type PuzzleProgress } from '@/app/stores/progressStorage'
import { RULESET, type Attempt } from '@/app/challenge/attempt'

/**
 * What the archive is allowed to claim about a day (spec P1-6/P1-7, row 18d).
 *
 * The first version of this read `readAllProgress()` and looked at `record.completed`. That
 * is a different claim from the one the rest of the app makes: a record is *checked* before
 * it counts anywhere else — `progressFor` requires the `definitionHash`, the board size, the
 * rock positions, that every placed half is part of exactly one well-formed domino, and that
 * a `completed: true` record really is a full board matching its targets — and `pruneStorage`
 * is best-effort, so an expired record can still be present when a deletion was refused.
 *
 * The consequences were concrete: a day marked finished because a flag was edited in a
 * console, and a day marked played because a record that aged out three weeks ago could not
 * be deleted under quota pressure.
 */

const DAY_MS = 86_400_000
const NOW = Date.UTC(2026, 8, 20)

/** A 2x2 with its right column rocked out: one downward domino solves it. */
const solvable = (puzzleId: string): StoredPuzzle => {
    const board = Array.from({ length: 2 }, () => Array<number | null>(2).fill(null))
    board[0][1] = -1
    board[1][1] = -1
    return {
        puzzleId, board, boardHorizontalNumbers: '1,0', boardVerticalNumbers: '1,0',
    } as StoredPuzzle
}

const NINE = Array.from({ length: 9 }, (_, n) => solvable(`v1-2026-09-01-slot-${n}`))

const hashOf = (stored: StoredPuzzle) => definitionFrom(stored).definitionHash

/** The solved position for `solvable`: a vertical domino in the left column. */
const solvedBoard = (): (number | null)[][] => [[1, -1], [0, -1]]
/** A legal, unfinished position: nothing placed. */
const emptyBoard = (): (number | null)[][] => [[null, -1], [null, -1]]

const record = (
    stored: StoredPuzzle, over: Partial<PuzzleProgress> = {},
): PuzzleProgress => ({
    definitionHash: hashOf(stored),
    board: emptyBoard(),
    completed: false,
    savedAt: NOW - DAY_MS,
    ...over,
})

const progressOf = (entries: [StoredPuzzle, Partial<PuzzleProgress>][]) =>
    Object.fromEntries(entries.map(([stored, over]) =>
        [stored.puzzleId, record(stored, over)]))

describe('marking a day in the archive', () => {
    it('is blank when nothing has been played', () => {
        expect(markForDay(NINE, {}, NOW)).toBe('none')
    })

    it('is blank for a day with no puzzles at all', () => {
        // The chunk has not arrived yet. A mark would be a guess.
        expect(markForDay([], progressOf([[NINE[0], {}]]), NOW)).toBe('none')
    })

    it('is "started" when a board has been touched but none finished', () => {
        expect(markForDay(NINE, progressOf([[NINE[0], {}]]), NOW)).toBe('started')
    })

    it('is "partial" when some are finished', () => {
        const progress = progressOf([
            [NINE[0], { board: solvedBoard(), completed: true }],
            [NINE[1], {}],
        ])
        expect(markForDay(NINE, progress, NOW)).toBe('partial')
    })

    it('is "complete" only when every one of the nine is finished', () => {
        const all = progressOf(NINE.map(stored =>
            [stored, { board: solvedBoard(), completed: true }]))
        expect(markForDay(NINE, all, NOW)).toBe('complete')

        // Eight of nine is not a finished day, however it is counted.
        const eight = { ...all }
        delete eight[NINE[8].puzzleId]
        expect(markForDay(NINE, eight, NOW)).toBe('partial')
    })
})

describe('a record has to survive the same checks a restore does', () => {
    it('ignores a record that has aged out', () => {
        /*
         * `pruneStorage` deletes, and deleting is best-effort: storage refuses `removeItem`
         * in the same conditions it refuses `setItem`. Retention is a rule about which saves
         * count, so it is applied where the answer is used and not merely where files are
         * removed -- which is exactly what `live()` does for the boards on screen.
         */
        const stale = progressOf([[NINE[0], {
            savedAt: NOW - (RETENTION_DAYS + 1) * DAY_MS,
            board: solvedBoard(),
            completed: true,
        }]])
        expect(markForDay(NINE, stale, NOW)).toBe('none')
    })

    it('counts a record on the last day inside the window', () => {
        // Otherwise the test above would pass for an implementation that ignored everything.
        const fresh = progressOf([[NINE[0], { savedAt: NOW - RETENTION_DAYS * DAY_MS }]])
        expect(markForDay(NINE, fresh, NOW)).toBe('started')
    })

    it('ignores a record whose definitionHash does not match the puzzle', () => {
        // A regenerated puzzle under a reused id. Its saved board describes a different
        // board, and marking the day played would be a claim about a puzzle nobody saw.
        const wrong = progressOf([[NINE[0], { definitionHash: 'not-this-puzzle' }]])
        expect(markForDay(NINE, wrong, NOW)).toBe('none')
    })

    it('ignores a completed flag over a board that is not finished', () => {
        /*
         * The console-edit case. `progressFor` refuses a `completed: true` record whose
         * board is not actually full and matching -- otherwise the restore would produce an
         * inert puzzle that can be neither played nor finished, which is P1-3's soft-lock
         * arriving through storage. The archive must not disagree with that judgement.
         */
        const lying = progressOf([[NINE[0], { board: emptyBoard(), completed: true }]])
        expect(markForDay(NINE, lying, NOW)).toBe('none')
    })

    it('ignores a board the rules could not have produced', () => {
        // A planted value, which would otherwise be counted into a line sum on restore.
        const planted = progressOf([[NINE[0], { board: [[99, -1], [null, -1]] }]])
        expect(markForDay(NINE, planted, NOW)).toBe('none')
    })

    it('ignores a board whose rocks are in the wrong places', () => {
        const moved = progressOf([[NINE[0], { board: [[-1, null], [-1, null]] }]])
        expect(markForDay(NINE, moved, NOW)).toBe('none')
    })

    it('drops only the bad record, not the day', () => {
        // One corrupt puzzle costs that puzzle, the way it does everywhere else.
        const mixed = progressOf([
            [NINE[0], { definitionHash: 'not-this-puzzle' }],
            [NINE[1], { board: solvedBoard(), completed: true }],
        ])
        expect(markForDay(NINE, mixed, NOW)).toBe('partial')
    })
})

describe('a challenge day is judged by its attempts (slice 3a, rule 18)', () => {
    /** The chunk day these nine belong to, as the archive passes it in. */
    const DATE = '2026-09-01'
    const attempt = (stored: StoredPuzzle, over: Partial<Attempt> = {}): Attempt => ({
        puzzleId: stored.puzzleId, definitionHash: hashOf(stored), date: DATE, ruleset: RULESET,
        startedAt: NOW - DAY_MS, assisted: false, clockError: false, ...over,
    })
    const challengeOf = (entries: [StoredPuzzle, Partial<Attempt>][]) => ({
        date: DATE,
        attempts: new Map(entries.map(([stored, over]) => [stored.puzzleId, attempt(stored, over)])),
    })
    const SOLVED: Partial<Attempt> = { result: { kind: 'solved', ms: 83_000 }, finishedAt: NOW - DAY_MS + 83_000 }

    it('gives today\'s marks when there are no attempts', () => {
        const progress = progressOf([[NINE[0], { board: solvedBoard(), completed: true }], [NINE[1], {}]])
        expect(markForDay(NINE, progress, NOW, challengeOf([]))).toBe('partial')
        expect(markForDay(NINE, progressOf([[NINE[0], {}]]), NOW, challengeOf([]))).toBe('started')
    })

    it('keeps a day complete after Practice clears every board', () => {
        // Practice resets the board the result was won on: progress says nothing is solved.
        const cleared = progressOf(NINE.map(stored => [stored, {}]))
        expect(markForDay(NINE, cleared, NOW)).toBe('started')
        expect(markForDay(NINE, cleared, NOW, challengeOf(NINE.map(stored => [stored, SOLVED])))).toBe('complete')
    })

    it('counts a solve without a time as done', () => {
        const untimed = challengeOf(NINE.map((stored, n) => [stored, {
            result: { kind: 'untimed', reason: n % 2 ? 'clock-error' : 'finish-lost' },
        }]))
        expect(markForDay(NINE, {}, NOW, untimed)).toBe('complete')
    })

    it('counts given up as played, not done, whatever progress says', () => {
        const solvedLater = progressOf([[NINE[0], { board: solvedBoard(), completed: true }]])
        const gaveUp = challengeOf([[NINE[0], { result: { kind: 'given-up' } }]])
        expect(markForDay(NINE, solvedLater, NOW, gaveUp)).toBe('started')
    })

    it('counts an attempt still in play as played, not done', () => {
        expect(markForDay(NINE, {}, NOW, challengeOf([[NINE[0], {}]]))).toBe('started')
    })

    it('keeps a challenge day\'s mark after its progress ages out', () => {
        const stale = progressOf([[NINE[0], {
            savedAt: NOW - (RETENTION_DAYS + 1) * DAY_MS, board: solvedBoard(), completed: true,
        }]])
        expect(markForDay(NINE, stale, NOW)).toBe('none')
        expect(markForDay(NINE, stale, NOW, challengeOf([[NINE[0], SOLVED]]))).toBe('partial')
    })

    it('ignores an attempt that isn\'t this board\'s, and judges the board from progress', () => {
        // Each identity check alone: a solved attempt under this board's key that names
        // another puzzle, another definition or another day counts for nothing here, and
        // the board's own progress ("started") is what the day shows.
        const progress = progressOf([[NINE[0], {}]])
        for (const [why, over] of [
            ['puzzle ID', { puzzleId: 'v1-2026-09-01-slot-other' }],
            ['definition hash', { definitionHash: 'not-this-puzzle' }],
            ['date', { date: '2026-09-02' }],
        ] as const) {
            expect(markForDay(NINE, progress, NOW, challengeOf([[NINE[0], { ...SOLVED, ...over }]])), why)
                .toBe('started')
            expect(markForDay(NINE, {}, NOW, challengeOf([[NINE[0], { ...SOLVED, ...over }]])), why)
                .toBe('none')
        }
    })
})
