"use client"
import {
    clampToCorpus, monthOf, parseDate,
    type Chunk, type DayEntry, type Manifest,
} from "./corpus"

/**
 * Fetching the day's puzzles from the published corpus (spec P1-6, row 18d).
 *
 * What this replaces: `data[daysSinceEpoch % data.length]` over two day-entries bundled into
 * the JavaScript. That is a *rotation*, not a mapping — it re-serves the same content under
 * endlessly many dates, so "the puzzle for 2026-09-20" was not a thing that existed, and an
 * archive of days with no stable content behind them is not an archive. Ten years of dates
 * now have one answer each, and it is the same answer tomorrow.
 *
 * **One chunk, fetched, not imported.** The corpus is 10.8 MB minified. Bundling it would
 * put all of it in the JavaScript graph to serve one day of it; instead the manifest (30 KB,
 * ~4 KB over the wire) says which file holds which month, and one month (~104 KB raw, ~6 KB
 * brotli) is fetched when a date in it is wanted. Chunk filenames carry a content hash, so
 * they are immutable and cache forever; only `index.json` is ever refetched.
 *
 * **Caching is per-promise, not per-result.** Two components asking for the same month
 * during startup must produce one request, and storing the promise rather than the value is
 * what makes concurrent callers share it. A rejected promise is evicted, so a failed load is
 * retried rather than remembered as broken for the life of the tab — which matters because
 * the retry path above this (`useDayRollover`) is built on exactly that assumption.
 */

/** Where the published assets are served from. Static files, not an API. */
export const CORPUS_URL = '/puzzles'
export const MANIFEST_URL = `${CORPUS_URL}/index.json`

/** What a day request answers with: the content, and the date it is actually for. */
export type LoadedDay = {
    day: DayEntry
    /** The date that was asked for. Differs from `day.date` only when the clock is outside. */
    requested: string
    clamped: 'before' | 'after' | null
}

export class CorpusError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'CorpusError'
    }
}

type Fetcher = typeof fetch

const readJson = async (fetcher: Fetcher, url: string): Promise<unknown> => {
    const response = await fetcher(url)
    if (!response.ok) {
        throw new CorpusError(`${url} responded ${response.status}`)
    }
    return response.json()
}

/**
 * Enough of a shape check to fail loudly instead of rendering nonsense.
 *
 * Not a hash check: over HTTPS the bytes are already protected in transit, and the thing
 * this actually guards against is a stale deploy, a rewritten `index.json`, or a 200 page of
 * HTML from a proxy that swallowed a 404 — none of which a digest would catch any better
 * than asking whether the document says what it should.
 */
const asManifest = (value: unknown): Manifest => {
    const manifest = value as Manifest | null
    if (!manifest || !Array.isArray(manifest.chunks) || manifest.chunks.length === 0
        || !parseDate(manifest.firstDate ?? '') || !parseDate(manifest.lastDate ?? '')) {
        throw new CorpusError(`${MANIFEST_URL} is not a corpus manifest`)
    }
    return manifest
}

const asChunk = (value: unknown, month: string, file: string): Chunk => {
    const chunk = value as Chunk | null
    if (!chunk || chunk.month !== month || !Array.isArray(chunk.days)) {
        throw new CorpusError(`${file} is not the chunk for ${month}`)
    }
    return chunk
}

/**
 * A view of the published corpus.
 *
 * A class with an injected `fetch` rather than module-level functions, because the cache has
 * to be resettable: a test that seeds one corpus and then another must not be answered from
 * the first, and a module-level Map would make that ordering-dependent.
 */
export class CorpusSource {
    private readonly fetcher: Fetcher
    private readonly base: string
    private manifest: Promise<Manifest> | null = null
    private readonly chunks = new Map<string, Promise<Chunk>>()

    constructor(options: { fetch?: Fetcher, base?: string } = {}) {
        this.fetcher = options.fetch ?? ((...args) => fetch(...args))
        this.base = options.base ?? CORPUS_URL
    }

    /** The index of every published month. Fetched once. */
    loadManifest(): Promise<Manifest> {
        if (!this.manifest) {
            this.manifest = readJson(this.fetcher, `${this.base}/index.json`)
                .then(asManifest)
                .catch(error => {
                    // Evicted, so the next attempt is a real attempt. Caching the rejection
                    // would make one bad moment at startup permanent for the tab.
                    this.manifest = null
                    throw error
                })
        }
        return this.manifest
    }

    /**
     * One month of days. Fetched at most once per month per source.
     *
     * Not an `async` method, and that is the whole of it: an `async` version awaited the
     * manifest before recording anything, so three callers arriving together all passed the
     * cache check before any of them filled it and the month was fetched three times. The
     * cache entry has to be installed in the same synchronous turn as the miss that found
     * it, which means building the promise rather than awaiting inside.
     */
    loadChunk(month: string): Promise<Chunk> {
        const cached = this.chunks.get(month)
        if (cached) return cached

        const fetchIt = async () => {
            const manifest = await this.loadManifest()
            const ref = manifest.chunks.find(candidate => candidate.month === month)
            if (!ref) throw new CorpusError(`the corpus has no content for ${month}`)
            return asChunk(await readJson(this.fetcher, `${this.base}/${ref.file}`), month, ref.file)
        }

        // The stored promise is the one carrying the `catch`, so the eviction runs and the
        // rejection is still delivered to every caller rather than going unhandled.
        const pending = fetchIt().catch(error => {
            this.chunks.delete(month)
            throw error
        })
        this.chunks.set(month, pending)
        return pending
    }

    /**
     * The nine puzzles for a date.
     *
     * A date outside the published range is clamped rather than refused, and the clamp is
     * reported: a device clock can be years wrong, and a playable board with an honest label
     * beats an error page. Inside the range, a date the corpus does not hold is a real
     * failure — the chunk is contiguous by construction and verified to be, so a gap means
     * the content is not what it claims.
     */
    async loadDay(date: string): Promise<LoadedDay> {
        if (!parseDate(date)) throw new CorpusError(`${JSON.stringify(date)} is not a date`)

        const manifest = await this.loadManifest()
        const { date: wanted, requested, clamped } = clampToCorpus(date, manifest)
        const chunk = await this.loadChunk(monthOf(wanted))
        const day = chunk.days.find(entry => entry.date === wanted)
        if (!day) throw new CorpusError(`the corpus has no content for ${wanted}`)
        return { day, requested, clamped }
    }
}
