import type { StoredPuzzle } from "./PuzzleDefinition"

/**
 * The shape of the published corpus, and the date arithmetic over it (spec P1-6, row 18d).
 *
 * This lives under `app/` rather than in `scripts/corpus.ts` because the **runtime** needs
 * it: the loader reads the manifest, picks a chunk and finds a day in it. `scripts/corpus.ts`
 * imports `node:crypto` and the generator, neither of which can be in a browser bundle, so
 * the pieces both sides need are here and the pipeline re-exports them. One definition, not
 * two that drift.
 *
 * Nothing here touches a filesystem, a network or a clock. Dates are plain strings with UTC
 * arithmetic over them; the *player's* day is a local calendar key computed in
 * `progressStorage.dayKey`, and it arrives here already decided.
 */

/** The nine puzzles of one day, exactly as a chunk stores them. */
export type DayEntry = {
    date: string
    easyBoards: StoredPuzzle[]
    mediumBoards: StoredPuzzle[]
    hardBoards: StoredPuzzle[]
}

/** One month of days. The unit that is fetched. */
export type Chunk = {
    /** `YYYY-MM`. */
    month: string
    version: number
    days: DayEntry[]
}

export type ChunkRef = {
    month: string
    /** The published filename, which carries a content hash so it can be cached forever. */
    file: string
    /** SHA-256 of the chunk's exact bytes, so a corrupted or swapped chunk is detectable. */
    sha256: string
    days: number
    firstDate: string
    lastDate: string
}

export type Manifest = {
    version: number
    seed: number
    /** When the corpus was built. Informational: it is not an input to any puzzle. */
    generatedAt: string
    firstDate: string
    lastDate: string
    days: number
    puzzles: number
    chunks: ChunkRef[]
}

// ---------------------------------------------------------------------------
// Dates. Plain UTC arithmetic on `YYYY-MM-DD`, with no `Date` in any seed.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` for a UTC timestamp. */
export const isoDate = (time: number): string => new Date(time).toISOString().slice(0, 10)

/**
 * Parse `YYYY-MM-DD` to a UTC timestamp, or null.
 *
 * Round-tripped rather than shape-checked, and that is stricter than it looks: `Date.UTC`
 * normalises `2026-02-31` into March and `2026-13-01` into the next January, so anything
 * that does not come back unchanged was never a real date. `tomorrow` parses to NaN.
 */
export const parseDate = (date: string): number | null => {
    const [year, month, day] = date.split('-').map(Number)
    const time = Date.UTC(year, month - 1, day)
    if (Number.isNaN(time)) return null
    return isoDate(time) === date ? time : null
}

/** `YYYY-MM` of a date. */
export const monthOf = (date: string): string => date.slice(0, 7)

/** The `YYYY-MM` that is `offset` months after `month`. */
export const addMonths = (month: string, offset: number): string => {
    const [year, index] = month.split('-').map(Number)
    const total = year * 12 + (index - 1) + offset
    return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** The `YYYY-MM-DD` that is `offset` days after `date`. Assumes a valid date. */
export const addDays = (date: string, offset: number): string =>
    isoDate((parseDate(date) ?? 0) + offset * DAY_MS)

/** Every `YYYY-MM-DD` in a month, in order. */
export const datesIn = (month: string): string[] => {
    const [year, index] = month.split('-').map(Number)
    const dates: string[] = []
    for (let time = Date.UTC(year, index - 1, 1); isoDate(time).startsWith(month); time += DAY_MS) {
        dates.push(isoDate(time))
    }
    return dates
}

/** Whole months between two `YYYY-MM`, positive when `to` is later. */
export const monthsBetween = (from: string, to: string): number => {
    const [fy, fm] = from.split('-').map(Number)
    const [ty, tm] = to.split('-').map(Number)
    return (ty * 12 + tm) - (fy * 12 + fm)
}

/**
 * Hold a date inside the corpus, and say so when it had to move.
 *
 * A device clock is not a fact. It can be years out, and a player whose phone thinks it is
 * 2019 should get a playable board rather than an error page. But serving them a *different*
 * day's puzzle silently would break the one promise the date index exists to make, so the
 * clamp is reported: `requested` and `date` differ, and the caller can say so on screen.
 */
export const clampToCorpus = (
    date: string, manifest: Pick<Manifest, 'firstDate' | 'lastDate'>,
): { date: string, requested: string, clamped: 'before' | 'after' | null } => {
    if (date < manifest.firstDate) {
        return { date: manifest.firstDate, requested: date, clamped: 'before' }
    }
    if (date > manifest.lastDate) {
        return { date: manifest.lastDate, requested: date, clamped: 'after' }
    }
    return { date, requested: date, clamped: null }
}
