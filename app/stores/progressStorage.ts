import type { PuzzleDefinition } from "./PuzzleDefinition"
import { CELL_VALUES, isBoardFull, targetsMatch, wellFormed } from "./boardRules"

/**
 * Saved progress (spec P1-7).
 *
 * Everything here is pure except the functions below the storage divider. That split is the
 * point: the rules about what is valid and what is stale are testable without a browser, and
 * the parts that can throw are a few lines each.
 *
 * **One key per puzzle, not one document.** This is a reversal of the first design, and the
 * reason is other tabs. A single document has to be read, modified and written back, and two
 * tabs can interleave those three steps: both read the same document, both write, and the
 * second erases the first's work — on a puzzle *neither of them was editing*. `setItem` is
 * atomic; the read-modify-write around it is not, and the HTML standard is explicit that
 * authors may not assume any locking between agent clusters. Giving each puzzle its own key
 * means writing one puzzle never rewrites another, so that whole class of loss stops existing
 * rather than merely being narrowed. Two tabs playing *the same* puzzle still resolve
 * last-write-wins, which no storage layout can decide.
 *
 * **Storage is hostile.** It can be absent, blocked (Safari private mode, embedded webviews,
 * a `localStorage` that exists on Node >= 22 but whose `getItem` is not a function), full, or
 * hold whatever a previous version — or a curious player with a devtools console — left
 * behind. Every access is wrapped, and every value read back is treated as untrusted input
 * rather than as the type it claims to be.
 */

/** Bump for any shape change; `migrateLegacy` brings the previous version forward. */
export const SCHEMA_VERSION = 2

/** Versioned in the key, so a rollback cannot read forward data. */
export const KEY_PREFIX = `dominoFill.progress.v${SCHEMA_VERSION}.`

/** The v1 single-document key, read once and retired. See `migrateLegacy`. */
export const LEGACY_KEY = 'dominoFill.progress.v1'

/** How long an untouched puzzle's progress is kept. See `isExpired`. */
export const RETENTION_DAYS = 14

const DAY_MS = 86_400_000

export type PuzzleProgress = {
    /**
     * The definition this board was played against. A puzzle whose content changed under a
     * reused id is a different puzzle, and its saved board would be nonsense against the new
     * one — so this is checked before any restore.
     */
    definitionHash: string
    board: (number | null)[][]
    completed: boolean
    /**
     * When this puzzle last moved, as epoch milliseconds.
     *
     * An absolute instant, deliberately, where v1 stored a local day string. Retention then
     * cannot be confused by the calendar: a player who flies west across the date line, or
     * who corrects their timezone, changes what today is *called* without changing how old
     * anything is. v1 compared day strings and dropped every record dated later than the new
     * local day, so travelling west deleted that day's progress outright — and the rollover
     * check exists precisely to notice a backward date change, so the two features combined
     * to destroy data.
     */
    savedAt: number
}

/**
 * The local day, as `YYYY-MM-DD`.
 *
 * Local rather than UTC on purpose: it is what the player's own calendar says, and it decides
 * which day's puzzle they are served. A UTC day would roll over mid-evening for a player west
 * of Greenwich and hand them tomorrow's puzzle while their own calendar still said today.
 *
 * Retention no longer uses this — see `savedAt` — but rollover detection and puzzle selection
 * both do, and they have to agree on the rule.
 */
export const dayKey = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const isBoard = (value: unknown): value is (number | null)[][] => {
    if (!Array.isArray(value) || value.length === 0) return false
    const width = Array.isArray(value[0]) ? (value[0] as unknown[]).length : -1
    return value.every(row =>
        Array.isArray(row)
        && row.length === width
        // Not merely "an integer": the only numbers a cell can hold are a rock and the three
        // domino-half pip values. A stored `99` would otherwise be restored and then counted
        // into a line sum, which is a board the rules cannot produce.
        && row.every(cell => cell === null || CELL_VALUES.includes(cell as number)))
}

const isProgress = (value: unknown): value is PuzzleProgress => {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    return typeof record.definitionHash === 'string'
        && typeof record.completed === 'boolean'
        && typeof record.savedAt === 'number'
        && Number.isFinite(record.savedAt)
        && isBoard(record.board)
}

/** Parse one stored record, or null for anything that is not one. */
export const parseRecord = (raw: string | null): PuzzleProgress | null => {
    if (raw === null) return null
    try {
        const parsed: unknown = JSON.parse(raw)
        return isProgress(parsed) ? parsed : null
    } catch {
        return null
    }
}

/**
 * Has this record aged out?
 *
 * Strictly one-directional: only a record genuinely *older* than the window goes. A stamp in
 * the future — a device whose clock is wrong, or a player who has just flown east — is kept.
 * That trades a few kilobytes sitting around longer than intended against deleting a board
 * somebody was in the middle of, and the board is worth more than the space.
 */
export const isExpired = (savedAt: number, now: number, retentionDays = RETENTION_DAYS) =>
    now - savedAt > retentionDays * DAY_MS

/**
 * The saved progress for a definition, if it is still the same puzzle *and* a board the rules
 * could have produced.
 *
 * Every refusal below is a state that would otherwise be restored and then reasoned about as
 * though it were legitimate.
 */
export const progressFor = (
    record: PuzzleProgress | null | undefined,
    definition: PuzzleDefinition,
): PuzzleProgress | null => {
    if (!record || record.definitionHash !== definition.definitionHash) return null
    // A board of the wrong size cannot belong to this definition whatever the hash says.
    if (record.board.length !== definition.size) return null
    if (record.board.some(row => row.length !== definition.size)) return null
    // Rocks are part of the definition, not of play: a saved board that disagrees about
    // where they are has been tampered with or was written against different content.
    const rocksAgree = definition.initialBoard.every((row, i) =>
        row.every((cell, j) => (cell === -1) === (record.board[i][j] === -1)))
    if (!rocksAgree) return null

    /*
     * Shape is not enough. A record can have the right size and the right rocks and still
     * describe a board no sequence of moves could reach: a `1` with nothing beneath it, or a
     * `0` claimed by two dominoes at once. Restoring one puts the game into a state its own
     * rules disagree with, and every later judgement — sums, completion, removal — is then
     * being made about a position that cannot exist.
     */
    if (!wellFormed(record.board, definition.size)) return null

    /*
     * And `completed` is checked rather than believed, because it is the one field that can
     * take the game away from the player. A completed board is made `inert`: no pointer, no
     * keyboard, no focus. A record claiming `completed: true` over an unfinished board would
     * restore a puzzle that cannot be played and cannot be finished — the soft-lock P1-3
     * exists to prevent, reintroduced through storage.
     */
    if (record.completed && !(isBoardFull(record.board, definition.size)
        && targetsMatch(record.board, definition))) {
        return null
    }
    return record
}

/* ----------------------------------------------------------------- storage */

/**
 * `localStorage`, or null when there is not a usable one.
 *
 * The check is on the *method*, not on the object: recent Node defines a `localStorage`
 * global whose members are all undefined, so `typeof localStorage !== 'undefined'` passes and
 * the first call throws. `app/hooks/useLocalStorage.ts` records the same lesson.
 */
const store = (): Storage | null => {
    try {
        if (typeof window === 'undefined') return null
        const candidate = window.localStorage
        return typeof candidate?.getItem === 'function' ? candidate : null
    } catch {
        return null
    }
}

const keyFor = (puzzleId: string) => `${KEY_PREFIX}${puzzleId}`

/** Every puzzle id currently held in storage. */
const savedIds = (storage: Storage): string[] => {
    const ids: string[] = []
    for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index)
        if (key?.startsWith(KEY_PREFIX)) ids.push(key.slice(KEY_PREFIX.length))
    }
    return ids
}

/** Read one puzzle's saved progress. */
export const readProgress = (puzzleId: string): PuzzleProgress | null => {
    const storage = store()
    if (!storage) return null
    try {
        return parseRecord(storage.getItem(keyFor(puzzleId)))
    } catch {
        return null
    }
}

/**
 * Write one puzzle's progress. Returns whether it was actually stored.
 *
 * One key, one `setItem`, and nothing else read or rewritten — which is exactly what makes a
 * concurrent write by another tab, to another puzzle, harmless.
 */
export const writeProgress = (puzzleId: string, progress: PuzzleProgress): boolean => {
    const storage = store()
    if (!storage) return false
    try {
        storage.setItem(keyFor(puzzleId), JSON.stringify(progress))
        return true
    } catch {
        // Quota exceeded, or storage blocked. The game keeps its in-memory state; losing the
        // save is not a reason to lose the move.
        return false
    }
}

/** Everything saved, by puzzle id, skipping anything unreadable. */
export const readAllProgress = (): Record<string, PuzzleProgress> => {
    const storage = store()
    if (!storage) return {}
    const all: Record<string, PuzzleProgress> = {}
    try {
        for (const puzzleId of savedIds(storage)) {
            const record = parseRecord(storage.getItem(keyFor(puzzleId)))
            // One corrupt puzzle costs that puzzle, not the other eight.
            if (record) all[puzzleId] = record
        }
    } catch {
        return all
    }
    return all
}

/** Drop what has aged out. Returns the ids removed, for tests and for logging. */
export const pruneStorage = (now: number, retentionDays = RETENTION_DAYS): string[] => {
    const storage = store()
    if (!storage) return []
    const removed: string[] = []
    try {
        for (const puzzleId of savedIds(storage)) {
            const record = parseRecord(storage.getItem(keyFor(puzzleId)))
            // Unreadable records go too: they are not progress and never will be.
            if (record && !isExpired(record.savedAt, now, retentionDays)) continue
            storage.removeItem(keyFor(puzzleId))
            removed.push(puzzleId)
        }
    } catch {
        return removed
    }
    return removed
}

/**
 * Bring a v1 document forward, and say what it held.
 *
 * v1 kept every puzzle in one document under `dominoFill.progress.v1`, stamped with a local
 * day string — the two things v2 replaces. Each entry is rewritten under its own key with an
 * absolute `savedAt` taken from the end of the stored day, so a migrated record is never
 * treated as older than it was. See `endOfDay`.
 *
 * The order here is the whole of it, and an earlier version had it backwards. It deleted the
 * legacy key immediately after reading the string, then parsed, then wrote — so a storage
 * that refused the second of several writes destroyed the only complete copy that existed.
 * Nothing could recover it: the document was gone and the records had never landed. So:
 *
 * 1. parse and validate everything *before* deleting anything;
 * 2. treat an existing v2 record as authoritative and never write over it, which is what
 *    makes a re-run after a partial failure safe rather than destructive;
 * 3. delete the legacy key only once every valid entry is represented in v2;
 * 4. keep the document for a later attempt if any write failed.
 *
 * Returns the valid legacy records *not* already superseded by v2, so the caller can restore
 * them in memory even when nothing could be written. Storage may be blocked for an entire
 * session; the player should still see their board rather than an empty one.
 */
export const migrateLegacy = (now: number = Date.now()): Record<string, PuzzleProgress> => {
    const storage = store()
    if (!storage) return {}
    try {
        const raw = storage.getItem(LEGACY_KEY)
        if (raw === null) return {}

        const entries = legacyEntries(raw)
        if (entries === null) {
            // Not a v1 document at all, so there is nothing to lose by retiring it — and
            // leaving it would mean re-examining the same damaged value on every load.
            storage.removeItem(LEGACY_KEY)
            return {}
        }

        const carried: Record<string, PuzzleProgress> = {}
        let allSafe = true
        for (const [puzzleId, record] of Object.entries(entries)) {
            /*
             * Already past the window, by the conservative bound above -- so it is expired
             * however generously it is read. Discarding it here is deliberate, and it must not
             * count against retiring the legacy key: otherwise a document of nothing but
             * expired boards could never be removed under quota pressure, and would sit there
             * consuming the very quota that was refusing the writes.
             */
            if (isExpired(record.savedAt, now)) continue
            // Anything already in v2 is newer by construction: it was either migrated on an
            // earlier attempt or written by play since.
            if (readProgress(puzzleId) !== null) continue
            carried[puzzleId] = record
            if (!writeProgress(puzzleId, record)) allSafe = false
        }

        if (allSafe) storage.removeItem(LEGACY_KEY)
        return carried
    } catch {
        return {}
    }
}

/** The largest offset behind UTC any zone uses (Baker Island, UTC−12). */
const LATEST_ZONE_OFFSET_MS = 12 * 60 * 60 * 1000

/**
 * The latest instant that a `YYYY-MM-DD` day could possibly have been, anywhere; null if it
 * is not a date.
 *
 * v1 recorded only which day a puzzle was saved on, so migrating has to choose an instant
 * within it. The end rather than the start, because a migrated record must never be treated
 * as *older* than it was: erring that way would bring its expiry forward on the strength of
 * information v1 never stored.
 *
 * And the end **in UTC−12**, not in whatever zone happens to be running the migration. This
 * is the part that is easy to get wrong, and the first version did: `savedOn` carries no
 * timezone, so reconstructing it locally reconstructs it in the *reader's* zone, which need
 * not be the writer's. Measured: `2026-09-15T23:59:59.999` is `2026-09-16T11:59:59.999Z` in
 * UTC−12 and `2026-09-15T09:59:59.999Z` in UTC+14 — twenty-six hours apart, and a player who
 * had flown between the two would have had their retention window silently shortened. UTC−12
 * is the last zone on earth to finish any given date, so it is the conservative bound, and it
 * is computed from `Date.UTC` alone so the answer does not depend on where it is run.
 *
 * The cost is at most about twenty-six hours of extra retention on a fourteen-day window,
 * which is the right side to be wrong on.
 *
 * `Date.UTC` normalises nonsense rather than refusing it — `2026-02-31` becomes the 3rd of
 * March — so the result is checked against the parts that went in. A date that does not
 * survive the round trip was never a date.
 */
const endOfDay = (savedOn: unknown): number | null => {
    if (typeof savedOn !== 'string') return null
    const parts = savedOn.split('-').map(Number)
    if (parts.length !== 3 || parts.some(n => !Number.isInteger(n))) return null
    const [year, month, day] = parts

    const utcEnd = Date.UTC(year, month - 1, day, 23, 59, 59, 999)
    if (Number.isNaN(utcEnd)) return null
    const round = new Date(utcEnd)
    const survived = round.getUTCFullYear() === year
        && round.getUTCMonth() === month - 1
        && round.getUTCDate() === day
    return survived ? utcEnd + LATEST_ZONE_OFFSET_MS : null
}

/**
 * The valid records inside a v1 document, or null if it is not one.
 *
 * Pure, and separate from the storage dance above so that "what the old format meant" can be
 * tested without a browser. An entry that does not survive validation is skipped rather than
 * failing the document: one unreadable puzzle should not cost the other eight.
 */
export const legacyEntries = (raw: string): Record<string, PuzzleProgress> | null => {
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return null
    }
    if (typeof parsed !== 'object' || parsed === null) return null
    const document = parsed as { version?: unknown, puzzles?: unknown }
    if (document.version !== 1) return null
    if (typeof document.puzzles !== 'object' || document.puzzles === null) return null

    const entries: Record<string, PuzzleProgress> = {}
    for (const [puzzleId, value] of Object.entries(document.puzzles as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null) continue
        const legacy = { ...value as Record<string, unknown> }
        const savedAt = endOfDay(legacy.savedOn)
        if (savedAt === null) continue
        delete legacy.savedOn
        const candidate = { ...legacy, savedAt }
        if (isProgress(candidate)) entries[puzzleId] = candidate
    }
    return entries
}
