import { describe, it, expect, afterEach, vi } from 'vitest'
import { CorpusError, CorpusSource } from '@/app/stores/corpusSource'
import { dayKey } from '@/app/stores/progressStorage'
import { clampToCorpus, parseDate, type Chunk, type DayEntry, type Manifest } from '@/app/stores/corpus'
import { generateChunk, chunkRefFor, manifestFor } from '@/scripts/corpus'

/**
 * Which day's puzzle a player is given (spec P1-6/P1-7, row 18d).
 *
 * Two questions, and only the second one is new.
 *
 * **Whose day is it?** A daily puzzle picked from the *server's* clock is a real defect and
 * not a rounding error: a player in Auckland gets tomorrow's board hours before their own
 * midnight, and one in Los Angeles is still on yesterday's through their morning — while the
 * rollover check in the browser, which can only be local, disagrees with the content it is
 * fetching. The day is therefore a local calendar key, computed in the browser. That has not
 * changed; what has changed is that nothing crosses a trust boundary any more, because the
 * lookup happens in the browser too.
 *
 * **What does a day map to?** It used to be `data[daysSinceEpoch % 2]` over two bundled
 * day-entries — a *rotation*. It re-served the same content under endlessly many dates, so
 * "the puzzle for the 15th" named nothing permanent and an archive had nothing to point at.
 * Now the date indexes a published corpus: one answer per date, the same answer tomorrow,
 * and the same answer next year.
 */

const MONTHS = ['2026-09', '2026-10', '2026-11']
const CHUNKS: Chunk[] = MONTHS.map(month => generateChunk(month))
const MANIFEST: Manifest = manifestFor(CHUNKS, '2026-09-18T00:00:00.000Z')

/** A corpus served out of memory, counting what was actually asked for. */
const sourceOver = (chunks: Chunk[] = CHUNKS, manifest: Manifest = MANIFEST) => {
    const requests: string[] = []
    // Keyed by the *manifest's* filenames, not by each chunk's own hash, so a test can
    // serve deliberately wrong content under a name the manifest points at.
    const files = new Map(chunks.map((chunk, index) =>
        [manifest.chunks[index]?.file ?? chunkRefFor(chunk).file, chunk]))
    const source = new CorpusSource({
        base: '/puzzles',
        fetch: (async (input: RequestInfo | URL) => {
            const url = String(input)
            requests.push(url)
            const name = url.split('/').pop()!
            const body = name === 'index.json' ? manifest : files.get(name)
            if (!body) return { ok: false, status: 404, json: async () => null } as Response
            return { ok: true, status: 200, json: async () => body } as Response
        }) as typeof fetch,
    })
    return { source, requests }
}

const idsOf = (day: DayEntry) =>
    [...day.easyBoards, ...day.mediumBoards, ...day.hardBoards].map(puzzle => puzzle.puzzleId)

const at = (date: Date) => { vi.useFakeTimers(); vi.setSystemTime(date) }
afterEach(() => { vi.useRealTimers() })

describe('a date maps to one set of puzzles, permanently', () => {
    it('gives the same puzzles for a date however long ago it was asked', async () => {
        /*
         * The point of the whole change, in one assertion. Under the rotation this held only
         * by accident of the modulus: `daysSinceEpoch % 2` gives the same pack to every
         * other day forever, so "the same" and "indistinguishable from another day" were the
         * same observation. Here the ids themselves are the answer.
         */
        const { source } = sourceOver()
        at(new Date('2026-09-15T00:30:00Z'))
        const early = await source.loadDay('2026-09-15')

        at(new Date('2026-11-16T23:30:00Z'))
        const late = await source.loadDay('2026-09-15')

        expect(idsOf(late.day)).toEqual(idsOf(early.day))
        expect(late.day.date).toBe('2026-09-15')
    })

    it('gives different puzzles for different days', async () => {
        // Otherwise the assertion above would pass for a function that ignored its argument
        // -- which is precisely what the rotation did every second day.
        const { source } = sourceOver()
        const today = await source.loadDay('2026-09-15')
        const tomorrow = await source.loadDay('2026-09-16')

        expect(idsOf(tomorrow.day)).not.toEqual(idsOf(today.day))
    })

    it('never re-serves one day of content under another date', async () => {
        /*
         * The property the rotation could not have. Every date in a month, and no two of
         * them share a puzzle -- so an archive entry names something that belongs to it.
         */
        const { source } = sourceOver()
        const seen = new Set<string>()
        for (const date of CHUNKS[0].days.map(day => day.date)) {
            for (const id of idsOf((await source.loadDay(date)).day)) {
                expect(seen.has(id), `${id} appears on more than one date`).toBe(false)
                seen.add(id)
            }
        }
        expect(seen.size).toBe(30 * 9)
    })

    it('agrees with the key the browser actually computes', async () => {
        // `dayKey` is the local calendar day; the loader must mean the same thing by it.
        const { source } = sourceOver()
        at(new Date(2026, 8, 15, 23, 45))
        const fromClient = await source.loadDay(dayKey(new Date()))

        expect(fromClient.day.date).toBe('2026-09-15')
    })

    it('is stable across a local evening that is already tomorrow in UTC', async () => {
        /*
         * The case that motivates the local key. 23:45 on the 15th in a zone ahead of UTC is
         * still the 15th to the player, and their puzzle must not change under them at 00:00
         * UTC. Nothing here consults a clock, which is how that is guaranteed rather than
         * arranged.
         */
        const { source } = sourceOver()
        const evening = await source.loadDay('2026-09-15')
        const justBeforeMidnight = await source.loadDay('2026-09-15')

        expect(evening.day).toBe(justBeforeMidnight.day)
    })
})

describe('only the month that is needed is fetched', () => {
    it('fetches the index once and one chunk for one day', async () => {
        /*
         * The reason the corpus is chunked at all. Ten years is 10.8 MB minified; bundling
         * it to serve one day of it would put all of it in the JavaScript graph.
         */
        const { source, requests } = sourceOver()
        await source.loadDay('2026-09-15')

        expect(requests).toHaveLength(2)
        expect(requests[0]).toBe('/puzzles/index.json')
        expect(requests[1]).toContain('2026-09.')
        expect(requests.some(url => url.includes('2026-10'))).toBe(false)
    })

    it('does not refetch a month it already has', async () => {
        const { source, requests } = sourceOver()
        await source.loadDay('2026-09-01')
        await source.loadDay('2026-09-30')

        expect(requests.filter(url => url.includes('2026-09.'))).toHaveLength(1)
    })

    it('answers concurrent callers from one request', async () => {
        // Startup asks for the day and the archive asks for the month it is in. Caching the
        // promise rather than the result is what makes that one fetch instead of two.
        const { source, requests } = sourceOver()
        await Promise.all([
            source.loadDay('2026-09-01'), source.loadDay('2026-09-02'),
            source.loadChunk('2026-09'),
        ])

        expect(requests).toEqual(['/puzzles/index.json', expect.stringContaining('2026-09.')])
    })

    it('fetches a second month only when a date in it is wanted', async () => {
        const { source, requests } = sourceOver()
        await source.loadDay('2026-09-15')
        await source.loadDay('2026-10-15')

        expect(requests.filter(url => url.includes('2026-10.'))).toHaveLength(1)
    })
})

describe('a failed load is retried, not remembered', () => {
    it('retries the index after a failure', async () => {
        let attempts = 0
        const source = new CorpusSource({
            fetch: (async () => {
                attempts++
                if (attempts === 1) throw new Error('offline')
                return { ok: true, status: 200, json: async () => MANIFEST } as Response
            }) as typeof fetch,
        })

        await expect(source.loadManifest()).rejects.toThrow('offline')
        // Caching the rejection would make one bad moment at startup permanent for the tab,
        // and `useDayRollover`'s retry is built on the assumption that it is not.
        await expect(source.loadManifest()).resolves.toMatchObject({ firstDate: '2026-09-01' })
        expect(attempts).toBe(2)
    })

    it('retries a chunk after a failure', async () => {
        let chunkAttempts = 0
        const source = new CorpusSource({
            fetch: (async (input: RequestInfo | URL) => {
                if (String(input).endsWith('index.json')) {
                    return { ok: true, status: 200, json: async () => MANIFEST } as Response
                }
                chunkAttempts++
                if (chunkAttempts === 1) return { ok: false, status: 503, json: async () => null } as Response
                return { ok: true, status: 200, json: async () => CHUNKS[0] } as Response
            }) as typeof fetch,
        })

        await expect(source.loadChunk('2026-09')).rejects.toThrow(/503/)
        await expect(source.loadChunk('2026-09')).resolves.toMatchObject({ month: '2026-09' })
    })
})

describe('what the loader refuses', () => {
    it.each([
        ['empty', ''],
        ['not a date', 'tomorrow'],
        ['wrong shape', '2026-9-15'],
        ['a month that does not exist', '2026-13-01'],
        ['a day that does not exist', '2026-02-30'],
        ['an injection attempt', '2026-09-15; DROP'],
        ['absurdly far out', '9999-99-99'],
    ])('refuses %s rather than guessing', async (_label, date) => {
        const { source } = sourceOver()
        await expect(source.loadDay(date)).rejects.toThrow(CorpusError)
    })

    it('accepts a real date that a naive parser would normalise away', () => {
        // `Date.UTC` turns month 13 into January of the next year rather than failing, which
        // is why a date is round-tripped instead of merely parsed. A genuine leap day must
        // still pass.
        expect(parseDate('2028-02-29')).not.toBeNull()
    })

    it('refuses a document that is not a manifest', async () => {
        const source = new CorpusSource({
            fetch: (async () => ({
                ok: true, status: 200, json: async () => ({ hello: 'world' }),
            } as Response)) as typeof fetch,
        })
        // A proxy answering 200 with an error page is the realistic version of this, and it
        // must fail loudly rather than render nine undefined boards.
        await expect(source.loadManifest()).rejects.toThrow(/not a corpus manifest/)
    })

    it('refuses a chunk that is not the month it was asked for', async () => {
        const { source } = sourceOver([{ ...CHUNKS[0], month: '2026-10' }], MANIFEST)
        await expect(source.loadChunk('2026-09')).rejects.toThrow(/is not the chunk for 2026-09/)
    })

    it('refuses a month the corpus does not publish', async () => {
        const { source } = sourceOver()
        await expect(source.loadChunk('2025-01')).rejects.toThrow(/no content for 2025-01/)
    })
})

describe('a clock outside the corpus', () => {
    /*
     * A device clock is not a fact: it can be years out, and a player whose phone thinks it
     * is 2019 should get a playable board rather than an error page. But serving them some
     * other day's puzzle *silently* would break the one promise the date index makes, so the
     * clamp is reported and the banner says which day they are actually on.
     */
    it('clamps a date before the corpus to its first day, and says so', async () => {
        const { source } = sourceOver()
        const loaded = await source.loadDay('2019-04-01')

        expect(loaded.day.date).toBe('2026-09-01')
        expect(loaded.requested).toBe('2019-04-01')
        expect(loaded.clamped).toBe('before')
    })

    it('clamps a date past the corpus to its last day, and says so', async () => {
        const { source } = sourceOver()
        const loaded = await source.loadDay('2099-01-01')

        expect(loaded.day.date).toBe('2026-11-30')
        expect(loaded.clamped).toBe('after')
    })

    it('reports no clamp for a date the corpus holds', async () => {
        const { source } = sourceOver()
        expect((await source.loadDay('2026-10-05')).clamped).toBeNull()
    })

    it.each([
        ['2026-09-01', null],
        ['2026-11-30', null],
        ['2026-08-31', 'before'],
        ['2026-12-01', 'after'],
    ])('%s clamps as %s, so the boundaries are inclusive', (date, expected) => {
        expect(clampToCorpus(date, MANIFEST).clamped).toBe(expected)
    })
})
