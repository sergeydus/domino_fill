import { describe, it, expect } from 'vitest'
import {
    KEY_PREFIX, SCHEMA_VERSION, RETENTION_DAYS,
    dayKey, isExpired, legacyEntries, parseRecord, progressFor,
    type PuzzleProgress,
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

const AT = Date.UTC(2026, 8, 15, 12)

const record = (over: Partial<PuzzleProgress> = {}): PuzzleProgress => ({
    definitionHash: definition('p').definitionHash,
    board: playedBoard(),
    completed: false,
    savedAt: AT,
    ...over,
})

const days = (n: number) => n * 86_400_000

describe('the storage keys', () => {
    it('carry the schema version, so a rollback cannot read forward data', () => {
        expect(KEY_PREFIX).toContain(`v${SCHEMA_VERSION}`)
    })

    it('are one per puzzle, which is what makes a write touch nothing else', () => {
        // The reason for the shape: with a shared document, two tabs read it, each change
        // their own puzzle, and the second write erases the first -- on a puzzle neither was
        // editing. A per-puzzle key has no cross-puzzle read-modify-write to interleave.
        expect(KEY_PREFIX.endsWith('.')).toBe(true)
    })
})

describe('the local day, which selection and rollover both use', () => {
    it('formats the local day, not the UTC one', () => {
        // 23:30 local on the 15th is the 15th, whatever UTC says about it. The day's puzzle
        // is chosen from this, so it has to mean the player's calendar.
        expect(dayKey(new Date(2026, 8, 15, 23, 30))).toBe('2026-09-15')
        expect(dayKey(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
    })
})

describe('retention measures age, not the calendar', () => {
    /*
     * v1 compared local day strings and dropped anything dated *later* than today. Combined
     * with rollover -- which deliberately notices a backward date change -- that destroyed
     * progress: fly west across the date line, the local date goes back a day, and the board
     * saved "tomorrow" was deleted. An absolute instant has no such failure mode, because
     * renaming today does not change how old anything is.
     */
    const now = AT

    it('keeps a record saved moments ago', () => {
        expect(isExpired(now - 1_000, now)).toBe(false)
    })

    it('keeps a record at the last moment of the window, and drops it just past', () => {
        expect(isExpired(now - days(RETENTION_DAYS), now), 'exactly at the window').toBe(false)
        expect(isExpired(now - days(RETENTION_DAYS) - 1, now), 'a millisecond past').toBe(true)
    })

    it('keeps a record stamped in the future, rather than deleting a live board', () => {
        // A clock that is wrong, or a player who has flown east. The cost of keeping it is a
        // few kilobytes; the cost of dropping it is somebody's half-finished puzzle.
        expect(isExpired(now + days(1), now)).toBe(false)
        expect(isExpired(now + days(400), now)).toBe(false)
    })

    it('survives travelling west across the date line', () => {
        // Saved at midday on the 16th; the traveller's clock is now midday on the 15th.
        const savedAt = Date.UTC(2026, 8, 16, 12)
        const afterFlying = Date.UTC(2026, 8, 15, 12)
        expect(isExpired(savedAt, afterFlying)).toBe(false)
    })
})

describe('parsing refuses anything that is not a record', () => {
    it.each([
        ['nothing stored', null],
        ['not JSON', '{oh no'],
        ['a bare string', '"hello"'],
        ['a number', '42'],
        ['null', 'null'],
        ['an array', '[]'],
        ['a record with no timestamp', JSON.stringify({ definitionHash: 'x', board: [[null]], completed: false })],
        ['a timestamp that is not a number', JSON.stringify({ definitionHash: 'x', board: [[null]], completed: false, savedAt: 'today' })],
        ['a timestamp that is not finite', JSON.stringify({ definitionHash: 'x', board: [[null]], completed: false, savedAt: null })],
    ])('%s yields nothing', (_label, raw) => {
        expect(parseRecord(raw as string | null)).toBeNull()
    })

    it('refuses a ragged board', () => {
        expect(parseRecord(JSON.stringify(record({ board: [[null, null], [null]] as (number | null)[][] })))).toBeNull()
    })

    it('round-trips a record it wrote itself', () => {
        const before = record()
        expect(parseRecord(JSON.stringify(before))).toEqual(before)
    })
})

describe('progress is only restored to the puzzle it came from', () => {
    it('matching id and hash restores', () => {
        const d = definition('p')
        expect(progressFor(record(), d)).not.toBeNull()
    })

    it('a puzzle with no saved progress restores nothing', () => {
        expect(progressFor(null, definition('p'))).toBeNull()
    })

    it('content changed under a reused id is a different puzzle', () => {
        /*
         * The whole reason the hash is stored. If the data file is regenerated and a
         * `puzzleId` is reused for different content, the saved board is not a board of
         * that puzzle -- it could have dominoes sitting where rocks now are.
         */
        const changed = definition('p', [[3, 3]])
        expect(progressFor(record(), changed)).toBeNull()
    })

    it('a board of the wrong size is refused even if the hash somehow matches', () => {
        const d = definition('p')
        const wrongSize = record({
            definitionHash: d.definitionHash,
            board: Array.from({ length: 6 }, () => Array<number | null>(6).fill(null)),
        })
        expect(progressFor(wrongSize, d)).toBeNull()
    })

    it('a board that disagrees about where the rocks are is refused', () => {
        // Hand-edited storage is the realistic source of this, and restoring it would put
        // the board into a state the rules cannot produce.
        const d = definition('p')
        const moved = playedBoard()
        moved[0][0] = null
        moved[3][3] = -1
        expect(progressFor(record({ board: moved }), d)).toBeNull()
    })
})

describe('reading a v1 document', () => {
    /*
     * Pure, so what the old format meant can be checked without a browser. The storage dance
     * around it -- write first, delete only when everything is across -- is pinned in
     * tests/persistence.test.ts.
     */
    const legacy = (savedOn: string) => JSON.stringify({
        version: 1,
        puzzles: {
            p: {
                definitionHash: definition('p').definitionHash,
                board: playedBoard(),
                completed: false,
                savedOn,
            },
        },
    })

    /** The last instant of a date anywhere on earth: its end in UTC-12. */
    const latestAnywhere = (y: number, m: number, d: number) =>
        Date.UTC(y, m - 1, d, 23, 59, 59, 999) + 12 * 60 * 60 * 1000

    it('carries a record across, stamped at the latest instant that day could have been', () => {
        // The end, not the start: v1 stored only the day, and the save could have been at any
        // moment in it. Taking the end means the record is never treated as older than it was,
        // so migrating cannot bring forward the moment it ages out.
        const entries = legacyEntries(legacy('2026-09-15'))!
        expect(entries.p.savedAt).toBe(latestAnywhere(2026, 9, 15))
    })

    it('stamps the same instant whatever timezone reads the document', () => {
        /*
         * `savedOn` carries no timezone, so reconstructing it in the *reader's* zone
         * reconstructs somebody else's day. Measured across the extremes:
         * `2026-09-15T23:59:59.999` is `2026-09-16T11:59:59.999Z` in UTC-12 and
         * `2026-09-15T09:59:59.999Z` in UTC+14 -- twenty-six hours apart. A player who had
         * flown between the two would have had their retention window quietly shortened.
         *
         * The bound is UTC-12, the last zone to finish any date, computed from `Date.UTC`
         * alone. These run the parse under both extremes and require one answer.
         */
        /*
         * Restoring the timezone is fiddlier than it looks, and getting it wrong leaks into
         * every later test in the same worker. Probed on this machine, starting from an
         * unset `TZ` in Asia/Jerusalem, where local noon is 09:00Z:
         *
         *   process.env.TZ = original   // original is undefined
         *     -> the string "undefined", the key still present, and Node falls back to UTC
         *   delete process.env.TZ
         *     -> leaves the process in whatever zone was last set. It does not go back.
         *
         * Neither restores anything. What does is capturing the *resolved* zone name before
         * touching `TZ` and assigning that back -- verified to return local noon to 09:00Z.
         */
        const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone
        const localNoon = () => new Date(2026, 8, 15, 12).toISOString()
        const before = localNoon()

        const stampUnder = (timezone: string) => {
            process.env.TZ = timezone
            return legacyEntries(legacy('2026-09-15'))!.p.savedAt
        }

        try {
            const farWest = stampUnder('Etc/GMT+12')     // UTC-12
            const farEast = stampUnder('Pacific/Kiritimati')   // UTC+14
            const utc = stampUnder('UTC')

            expect(farWest).toBe(farEast)
            expect(utc).toBe(farWest)
            expect(farWest).toBe(latestAnywhere(2026, 9, 15))
        } finally {
            process.env.TZ = resolved
        }

        // Asserted, not assumed: a restore that quietly failed would hand every later test in
        // this worker a different calendar, which is exactly the kind of thing that hides a
        // date bug rather than causing an obvious failure.
        expect(localNoon(), 'the timezone was not restored').toBe(before)
    })

    it('is never earlier than the day could have ended in any zone', () => {
        // The contract in one line: the stamp is an upper bound, so no reader can decide the
        // record is older than it really was.
        const stamp = legacyEntries(legacy('2026-09-15'))!.p.savedAt
        for (const offsetHours of [-12, -5, 0, 5.5, 14]) {
            const endThere = Date.UTC(2026, 8, 15, 23, 59, 59, 999) - offsetHours * 3_600_000
            expect(stamp, `UTC${offsetHours >= 0 ? '+' : ''}${offsetHours}`)
                .toBeGreaterThanOrEqual(endThere)
        }
    })

    it.each([
        ['not JSON', '{oh no'],
        ['not an object', '42'],
        ['a version this never was', JSON.stringify({ version: 7, puzzles: {} })],
        ['no puzzles at all', JSON.stringify({ version: 1 })],
    ])('refuses %s', (_label, raw) => {
        expect(legacyEntries(raw)).toBeNull()
    })

    it('skips an entry it cannot read, and keeps the rest', () => {
        const mixed = JSON.stringify({
            version: 1,
            puzzles: {
                good: JSON.parse(legacy('2026-09-15')).puzzles.p,
                noDay: { definitionHash: 'x', board: playedBoard(), completed: false },
                badBoard: { definitionHash: 'x', board: 'nope', completed: false, savedOn: '2026-09-15' },
            },
        })
        expect(Object.keys(legacyEntries(mixed)!)).toEqual(['good'])
    })

    it('refuses a date that only exists after normalising', () => {
        // `new Date(2026, 1, 31)` is the 3rd of March, not a failure. A stored day that does
        // not survive the round trip was never a day.
        expect(legacyEntries(legacy('2026-02-31'))).toEqual({})
        expect(legacyEntries(legacy('2026-13-01'))).toEqual({})
        expect(legacyEntries(legacy('2026-00-10'))).toEqual({})
    })

    it('accepts a real leap day', () => {
        // The check has to reject impossible dates without rejecting awkward real ones.
        expect(legacyEntries(legacy('2028-02-29'))!.p).toBeDefined()
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
        expect(progressFor(legal, definition('p'))).not.toBeNull()
    })

    it('refuses a value this game does not have', () => {
        // `99` would be restored and then counted into a line sum.
        const raw = JSON.stringify(withBoard([[2, 2, 99]]))
        expect(parseRecord(raw), 'a 99 is not a piece').toBeNull()
    })

    it('refuses a half with no partner', () => {
        // A `1` with nothing beneath it: half a domino, which no placement can leave behind.
        expect(progressFor(withBoard([[0, 1, 1]]), definition('p'))).toBeNull()
        // And a lone `0`, owned by nobody.
        expect(progressFor(withBoard([[2, 2, 0]]), definition('p'))).toBeNull()
    })

    it('refuses a square claimed by two dominoes at once', () => {
        /*
         * The ambiguous case, and the one a dimensions-only check cannot see: a `0` with a `1`
         * directly above it *and* a `2` directly to its right is the lower half of one domino
         * and the left half of another. Every cell is legal on its own.
         */
        const ambiguous = withBoard([[1, 1, 1], [2, 1, 0], [2, 2, 2]])
        expect(progressFor(ambiguous, definition('p'))).toBeNull()
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
        expect(progressFor(lying, definition('p'))).toBeNull()
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
            savedAt: AT,
        }
        expect(progressFor(finished, solved)).not.toBeNull()
    })
})
