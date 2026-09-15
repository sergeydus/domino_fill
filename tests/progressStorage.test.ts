import { describe, it, expect } from 'vitest'
import {
    SCHEMA_VERSION, STORAGE_KEY, RETENTION_DAYS,
    emptyDocument, dayKey, daysBetween, parseDocument, progressFor, withProgress, prune,
    type ProgressDocument, type PuzzleProgress,
} from '@/app/stores/progressStorage'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'

/**
 * The rules about saved progress (spec P1-7), all of them pure.
 *
 * Storage is the one place in this app where the input is genuinely untrusted: it survives
 * upgrades, it is editable from a devtools console, and it can come back from a browser
 * that truncated it. So most of what follows is about *refusing* data rather than reading
 * it, and the cases are the ones that would otherwise restore a board that cannot exist.
 */

const definition = (puzzleId: string, rocks: [number, number][] = [[0, 0]]) => {
    const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return definitionFrom({
        puzzleId,
        board,
        boardHorizontalNumbers: '1,1,1,1',
        boardVerticalNumbers: '1,1,1,1',
    })
}

/** A board matching `definition`'s rocks, with one domino laid down the second column. */
const playedBoard = (): (number | null)[][] => {
    const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
    board[0][0] = -1
    board[0][1] = 1
    board[1][1] = 0
    return board
}

const record = (over: Partial<PuzzleProgress> = {}): PuzzleProgress => ({
    definitionHash: definition('p').definitionHash,
    board: playedBoard(),
    completed: false,
    savedOn: '2026-09-15',
    ...over,
})

const document = (puzzles: Record<string, PuzzleProgress>): ProgressDocument =>
    ({ version: SCHEMA_VERSION, puzzles })

describe('the storage key', () => {
    it('carries the schema version, so a rollback cannot read forward data', () => {
        // Both halves matter: the key stops an older build from *finding* the document, and
        // the version inside stops a newer one being misread if it does.
        expect(STORAGE_KEY).toContain(`v${SCHEMA_VERSION}`)
        expect(emptyDocument().version).toBe(SCHEMA_VERSION)
    })
})

describe('days are local, and counted by calendar date', () => {
    it('formats the local day, not the UTC one', () => {
        // 23:30 local on the 15th is the 15th, whatever UTC says about it. The day's puzzle
        // is chosen from local date parts, so this has to agree with that.
        expect(dayKey(new Date(2026, 8, 15, 23, 30))).toBe('2026-09-15')
        expect(dayKey(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
    })

    it('counts whole days regardless of the time of day', () => {
        expect(daysBetween('2026-09-15', '2026-09-16')).toBe(1)
        expect(daysBetween('2026-09-15', '2026-09-15')).toBe(0)
        expect(daysBetween('2026-09-16', '2026-09-15')).toBe(-1)
    })

    it('crosses a month and a year boundary without arithmetic of its own', () => {
        expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
        expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
        // A leap day is the case a naive month-length table gets wrong.
        expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    })

    it('treats an unreadable stamp as infinitely old rather than as today', () => {
        // Failing the other way would keep a corrupt record forever.
        expect(daysBetween('not-a-day', '2026-09-15')).toBe(Number.POSITIVE_INFINITY)
        expect(daysBetween('2026-09', '2026-09-15')).toBe(Number.POSITIVE_INFINITY)
    })
})

describe('parsing refuses anything that is not a document', () => {
    it.each([
        ['nothing stored', null],
        ['not JSON', '{oh no'],
        ['a bare string', '"hello"'],
        ['a number', '42'],
        ['null', 'null'],
        ['an array', '[]'],
    ])('%s yields an empty document', (_label, raw) => {
        expect(parseDocument(raw as string | null).puzzles).toEqual({})
    })

    it('discards a document from a newer version instead of guessing at it', () => {
        // It was written by code that knew something this build does not.
        const forward = JSON.stringify({ version: SCHEMA_VERSION + 1, puzzles: { p: record() } })
        expect(parseDocument(forward).puzzles).toEqual({})
    })

    it('discards a document from an older version', () => {
        const old = JSON.stringify({ version: 0, puzzles: { p: record() } })
        expect(parseDocument(old).puzzles).toEqual({})
    })

    it('drops only the corrupt entries, not the whole day', () => {
        // One bad puzzle should cost that puzzle, not the other eight.
        const raw = JSON.stringify({
            version: SCHEMA_VERSION,
            puzzles: {
                good: record(),
                ragged: record({ board: [[null, null], [null]] as (number | null)[][] }),
                notABoard: { ...record(), board: 'nope' },
                missingFlag: { definitionHash: 'x', board: playedBoard(), savedOn: '2026-09-15' },
                cellsNotNumbers: record({ board: [['a']] as unknown as (number | null)[][] }),
            },
        })
        expect(Object.keys(parseDocument(raw).puzzles)).toEqual(['good'])
    })

    it('round-trips a document it wrote itself', () => {
        const before = document({ p: record() })
        expect(parseDocument(JSON.stringify(before))).toEqual(before)
    })
})

describe('progress is only restored to the puzzle it came from', () => {
    it('matching id and hash restores', () => {
        const d = definition('p')
        expect(progressFor(document({ p: record() }), d)).not.toBeNull()
    })

    it('a puzzle with no saved progress restores nothing', () => {
        expect(progressFor(document({}), definition('p'))).toBeNull()
    })

    it('content changed under a reused id is a different puzzle', () => {
        /*
         * The whole reason the hash is stored. If the data file is regenerated and a
         * `puzzleId` is reused for different content, the saved board is not a board of
         * that puzzle -- it could have dominoes sitting where rocks now are.
         */
        const changed = definition('p', [[3, 3]])
        expect(progressFor(document({ p: record() }), changed)).toBeNull()
    })

    it('a board of the wrong size is refused even if the hash somehow matches', () => {
        const d = definition('p')
        const wrongSize = record({
            definitionHash: d.definitionHash,
            board: Array.from({ length: 6 }, () => Array<number | null>(6).fill(null)),
        })
        expect(progressFor(document({ p: wrongSize }), d)).toBeNull()
    })

    it('a board that disagrees about where the rocks are is refused', () => {
        // Hand-edited storage is the realistic source of this, and restoring it would put
        // the board into a state the rules cannot produce.
        const d = definition('p')
        const moved = playedBoard()
        moved[0][0] = null
        moved[3][3] = -1
        expect(progressFor(document({ p: record({ board: moved }) }), d)).toBeNull()
    })
})

describe('a restored board must be one the rules could have produced', () => {
    /*
     * Shape is not enough. Storage survives upgrades and is editable from a console, so a
     * record can have the right size, the right hash and the right rocks and still describe a
     * position no sequence of moves could reach. Restoring one leaves every later judgement --
     * sums, completion, removal -- being made about a board that cannot exist.
     *
     * A vertical domino is `1` on top and `0` below; a horizontal is `0` on the left and `2`
     * on the right. So each `0` must be claimed by exactly one partner.
     */
    const withBoard = (cells: Array<[number, number, number | null]>) => {
        const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
        board[0][0] = -1
        for (const [i, j, value] of cells) board[i][j] = value
        return record({ board })
    }

    it('accepts a board that is genuinely reachable', () => {
        const legal = withBoard([[0, 1, 1], [1, 1, 0], [2, 2, 0], [2, 3, 2]])
        expect(progressFor(document({ p: legal }), definition('p'))).not.toBeNull()
    })

    it('refuses a value this game does not have', () => {
        // `99` would be restored and then counted into a line sum.
        const raw = JSON.stringify({
            version: SCHEMA_VERSION,
            puzzles: { p: withBoard([[2, 2, 99]]) },
        })
        expect(parseDocument(raw).puzzles.p, 'a 99 is not a piece').toBeUndefined()
    })

    it('refuses a half with no partner', () => {
        // A `1` with nothing beneath it: half a domino, which no placement can leave behind.
        expect(progressFor(document({ p: withBoard([[0, 1, 1]]) }), definition('p'))).toBeNull()
        // And a lone `0`, owned by nobody.
        expect(progressFor(document({ p: withBoard([[2, 2, 0]]) }), definition('p'))).toBeNull()
    })

    it('refuses a square claimed by two dominoes at once', () => {
        /*
         * The ambiguous case, and the one a dimensions-only check cannot see: a `0` with a `1`
         * directly above it *and* a `2` directly to its right is the lower half of one domino
         * and the left half of another. Every cell is legal on its own.
         */
        const ambiguous = withBoard([[1, 1, 1], [2, 1, 0], [2, 2, 2]])
        expect(progressFor(document({ p: ambiguous }), definition('p'))).toBeNull()
    })

    it('refuses a completed flag over a board that is not finished', () => {
        /*
         * The one field that can take the game away. A completed board is made `inert` -- no
         * pointer, no keyboard, no focus -- so `completed: true` over an unfinished board
         * restores a puzzle that can neither be played nor finished: the soft-lock P1-3 exists
         * to prevent, coming back in through storage.
         */
        const lying = withBoard([[0, 1, 1], [1, 1, 0]])
        lying.completed = true
        expect(progressFor(document({ p: lying }), definition('p'))).toBeNull()
    })

    it('accepts a completed flag over a board that really is finished', () => {
        // A 2x2 with its right column rocked out, solved by one downward domino.
        const board: (number | null)[][] = [[1, -1], [0, -1]]
        const solved = definitionFrom({
            puzzleId: 'tiny',
            board: [[null, -1], [null, -1]],
            boardHorizontalNumbers: '1,0',
            boardVerticalNumbers: '1,0',
        })
        const finished = {
            definitionHash: solved.definitionHash,
            board,
            completed: true,
            savedOn: '2026-09-15',
        }
        expect(progressFor(document({ tiny: finished }), solved)).not.toBeNull()
    })
})

describe('writing one puzzle leaves the others alone', () => {
    it('replaces its own entry and keeps the rest', () => {
        const before = document({ a: record(), b: record({ completed: true }) })
        const after = withProgress(before, 'a', record({ completed: true }))

        expect(after.puzzles.a.completed).toBe(true)
        expect(after.puzzles.b).toEqual(before.puzzles.b)
    })

    it('does not mutate the document it was given', () => {
        // The store hands this the value it is holding; mutating in place would make a
        // failed write indistinguishable from a successful one.
        const before = document({ a: record() })
        withProgress(before, 'a', record({ completed: true }))
        expect(before.puzzles.a.completed).toBe(false)
    })
})

describe('pruning bounds growth without throwing away live puzzles', () => {
    it('keeps today', () => {
        const after = prune(document({ p: record({ savedOn: '2026-09-15' }) }), '2026-09-15')
        expect(after.puzzles.p).toBeDefined()
    })

    it('keeps a puzzle from a previous appearance in the cycle', () => {
        /*
         * The data file cycles, so a puzzle returns on a later date with the same id and the
         * same content -- it really is the same puzzle, and half-finished work on it should
         * still be there. "Delete everything that is not today's" would throw that away, so
         * the rule is age rather than identity.
         */
        const after = prune(document({ p: record({ savedOn: '2026-09-13' }) }), '2026-09-15')
        expect(after.puzzles.p).toBeDefined()
    })

    it('drops a puzzle untouched for longer than the retention window', () => {
        const stale = record({ savedOn: '2026-08-01' })
        const after = prune(document({ p: stale }), '2026-09-15')
        expect(after.puzzles.p).toBeUndefined()
    })

    it('keeps the last day of the window and drops the first day past it', () => {
        const at = (age: number) => {
            const day = new Date(2026, 8, 15)
            day.setDate(day.getDate() - age)
            return dayKey(day)
        }
        const kept = prune(document({ p: record({ savedOn: at(RETENTION_DAYS) }) }), '2026-09-15')
        const dropped = prune(document({ p: record({ savedOn: at(RETENTION_DAYS + 1) }) }), '2026-09-15')

        expect(kept.puzzles.p, `${RETENTION_DAYS} days old`).toBeDefined()
        expect(dropped.puzzles.p, `${RETENTION_DAYS + 1} days old`).toBeUndefined()
    })

    it('drops a record stamped in the future', () => {
        // A device with a wrong date, later corrected, would otherwise leave a record that
        // can never age out.
        const after = prune(document({ p: record({ savedOn: '2027-01-01' }) }), '2026-09-15')
        expect(after.puzzles.p).toBeUndefined()
    })

    it('drops a record with an unreadable stamp', () => {
        const after = prune(document({ p: record({ savedOn: 'whenever' }) }), '2026-09-15')
        expect(after.puzzles.p).toBeUndefined()
    })

    it('prunes each entry on its own merits', () => {
        const mixed = document({
            fresh: record({ savedOn: '2026-09-15' }),
            stale: record({ savedOn: '2026-01-01' }),
        })
        expect(Object.keys(prune(mixed, '2026-09-15').puzzles)).toEqual(['fresh'])
    })
})
