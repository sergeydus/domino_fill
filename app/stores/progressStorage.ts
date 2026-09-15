import type { PuzzleDefinition } from "./PuzzleDefinition"

/**
 * Saved progress (spec P1-7).
 *
 * Everything here is pure except `readDocument`/`writeDocument`, which are the only two
 * functions that touch storage. That split is the point: the rules about what is valid,
 * what is stale and what survives a rollover are all testable without a browser, and the
 * part that can throw is three lines long.
 *
 * **One document, not one key per puzzle.** A day is nine puzzles, and a board is 64 cells
 * of `null` or a small integer, so the whole thing is a few kilobytes — small enough that
 * an atomic read-modify-write costs nothing and buys a great deal: migration and pruning
 * happen in one place, and there is no way to half-write a day. Keying *within* the
 * document by `puzzleId` is what P1-7 asks for; spreading those keys across the storage
 * namespace is not.
 *
 * **Storage is hostile.** It can be absent, blocked (Safari private mode, embedded
 * webviews, a `localStorage` that exists on Node >= 22 but whose `getItem` is not a
 * function), full, or hold whatever a previous version — or a curious player with a
 * devtools console — left behind. Every access is wrapped, and every value read back is
 * treated as untrusted input rather than as the type it claims to be.
 */

/** Bump only for a shape change; `migrate` decides what an old document becomes. */
export const SCHEMA_VERSION = 1

/** Versioned in the key as well as in the body, so a rollback cannot read forward data. */
export const STORAGE_KEY = `dominoFill.progress.v${SCHEMA_VERSION}`

/** How long an untouched puzzle's progress is kept. See `prune`. */
export const RETENTION_DAYS = 14

export type PuzzleProgress = {
    /**
     * The definition this board was played against. A puzzle whose content changed under a
     * reused id is a different puzzle, and its saved board would be nonsense against the
     * new one — so this is checked before any restore.
     */
    definitionHash: string
    board: (number | null)[][]
    completed: boolean
    /** Local day of the last write, `YYYY-MM-DD`. Drives retention, not identity. */
    savedOn: string
}

export type ProgressDocument = {
    version: number
    puzzles: Record<string, PuzzleProgress>
}

export const emptyDocument = (): ProgressDocument => ({ version: SCHEMA_VERSION, puzzles: {} })

/**
 * The local day, as `YYYY-MM-DD`.
 *
 * Local rather than UTC on purpose: `getCurrentActiveBoard` selects the day's puzzle from
 * local date parts, so "today" here has to mean the same thing it means there. A UTC day
 * would roll over mid-evening for a player west of Greenwich and hand them tomorrow's
 * puzzle while their own calendar still said today.
 */
export const dayKey = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Whole days from `from` to `to`, by local calendar date, ignoring clock time. */
export const daysBetween = (from: string, to: string): number => {
    const parse = (key: string) => {
        const parts = key.split('-').map(Number)
        if (parts.length !== 3 || parts.some(n => !Number.isInteger(n))) return NaN
        return Date.UTC(parts[0], parts[1] - 1, parts[2])
    }
    const [a, b] = [parse(from), parse(to)]
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY
    return Math.round((b - a) / 86_400_000)
}

const isBoard = (value: unknown): value is (number | null)[][] => {
    if (!Array.isArray(value) || value.length === 0) return false
    const width = Array.isArray(value[0]) ? (value[0] as unknown[]).length : -1
    return value.every(row =>
        Array.isArray(row)
        && row.length === width
        && row.every(cell => cell === null || (typeof cell === 'number' && Number.isInteger(cell))))
}

const isProgress = (value: unknown): value is PuzzleProgress => {
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    return typeof record.definitionHash === 'string'
        && typeof record.completed === 'boolean'
        && typeof record.savedOn === 'string'
        && isBoard(record.board)
}

/**
 * Bring an older document forward, or refuse it.
 *
 * There is exactly one version so far, so this is deliberately a stub with a shape rather
 * than a chain of transforms — but it is the named place a future version goes, and
 * "discard" is a real answer here, not a fallthrough: a document from a *newer* version was
 * written by code that knew something this build does not, and guessing at it is worse than
 * starting over.
 */
const migrate = (candidate: Record<string, unknown>): { puzzles: unknown } | null => {
    if (candidate.version === SCHEMA_VERSION) return { puzzles: candidate.puzzles }
    return null
}

/**
 * Parse whatever was in storage into a document, discarding anything that is not one.
 *
 * Entry by entry rather than all-or-nothing: one corrupt puzzle should cost that puzzle's
 * progress, not the other eight. Returning an empty document for unparseable input means a
 * player with damaged storage starts fresh instead of seeing an error they cannot act on.
 */
export const parseDocument = (raw: string | null): ProgressDocument => {
    if (raw === null) return emptyDocument()
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return emptyDocument()
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return emptyDocument()

    const migrated = migrate(parsed as Record<string, unknown>)
    if (!migrated) return emptyDocument()
    if (typeof migrated.puzzles !== 'object' || migrated.puzzles === null) return emptyDocument()

    const puzzles: Record<string, PuzzleProgress> = {}
    for (const [puzzleId, record] of Object.entries(migrated.puzzles as Record<string, unknown>)) {
        if (isProgress(record)) puzzles[puzzleId] = record
    }
    return { version: SCHEMA_VERSION, puzzles }
}

/**
 * The saved progress for a definition, if it is still the same puzzle.
 *
 * Returns null on a hash mismatch — that is the invalidation P1-7 asks for, and it happens
 * here rather than at the call site so there is no path that restores without checking.
 */
export const progressFor = (
    document: ProgressDocument,
    definition: PuzzleDefinition,
): PuzzleProgress | null => {
    const record = document.puzzles[definition.puzzleId]
    if (!record || record.definitionHash !== definition.definitionHash) return null
    // A board of the wrong size cannot belong to this definition whatever the hash says.
    if (record.board.length !== definition.size) return null
    if (record.board.some(row => row.length !== definition.size)) return null
    // Rocks are part of the definition, not of play: a saved board that disagrees about
    // where they are has been tampered with or was written against different content.
    const rocksAgree = definition.initialBoard.every((row, i) =>
        row.every((cell, j) => (cell === -1) === (record.board[i][j] === -1)))
    return rocksAgree ? record : null
}

/** Replace one puzzle's record, leaving the rest of the document alone. */
export const withProgress = (
    document: ProgressDocument,
    puzzleId: string,
    progress: PuzzleProgress,
): ProgressDocument => ({
    version: SCHEMA_VERSION,
    puzzles: { ...document.puzzles, [puzzleId]: progress },
})

/**
 * Drop progress nobody is coming back for (the retention half of day rollover).
 *
 * Deliberately *not* "delete everything that is not today's puzzle". The day's board is
 * chosen by cycling through the data file, so a puzzle reappears on a later date with the
 * same id and the same content — it is genuinely the same puzzle, and a player who half
 * solved it should find their work where they left it. What actually needs bounding is
 * unbounded growth, so the rule is age: a record untouched for `RETENTION_DAYS` goes.
 *
 * A record stamped in the future is dropped too. That is not paranoia about clocks for its
 * own sake — a device whose date was wrong and then corrected would otherwise carry a
 * record that can never age out.
 */
export const prune = (
    document: ProgressDocument,
    today: string,
    retentionDays = RETENTION_DAYS,
): ProgressDocument => {
    const puzzles: Record<string, PuzzleProgress> = {}
    for (const [puzzleId, record] of Object.entries(document.puzzles)) {
        const age = daysBetween(record.savedOn, today)
        if (age >= 0 && age <= retentionDays) puzzles[puzzleId] = record
    }
    return { version: SCHEMA_VERSION, puzzles }
}

/**
 * Read the document from storage.
 *
 * Never called during render. `localStorage` exists as a global on recent Node while its
 * methods do not, so the guard is a feature check on the call itself rather than on the
 * object — the same lesson `useLocalStorage` records.
 */
export const readDocument = (): ProgressDocument => {
    try {
        if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
            return emptyDocument()
        }
        return parseDocument(window.localStorage.getItem(STORAGE_KEY))
    } catch {
        return emptyDocument()
    }
}

/** Write the document back. Returns whether it was actually stored. */
export const writeDocument = (document: ProgressDocument): boolean => {
    try {
        if (typeof window === 'undefined' || typeof window.localStorage?.setItem !== 'function') {
            return false
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document))
        return true
    } catch {
        // Quota exceeded, or storage blocked. The game keeps its in-memory state; losing the
        // save is not a reason to lose the move.
        return false
    }
}
