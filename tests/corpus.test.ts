import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import dominoBoards from '@/app/mocks/dominoBoards.json'
import { definitionFrom, type StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import { solve, DEFAULT_NODE_BUDGET } from '@/app/stores/solver'
import {
    CORPUS_SEED, CORPUS_START_MONTH, CORPUS_VERSION, SLOTS, addMonths, generateDay, sha256,
    type Chunk, type Manifest,
} from '@/scripts/corpus'

/**
 * Every shipped puzzle, against the production solver (spec P1-6, row 18b).
 *
 * `DEFAULT_NODE_BUDGET` is documented as "comfortably above every shipped 8x8 board", and
 * until now that was an assertion in a comment. It is the sort of claim that rots quietly:
 * the day a puzzle is added that needs more, the solver starts answering `budget-exhausted`
 * for it, check and hint go vague, and nothing fails. This is also the only test that runs
 * the real solver over the real data -- `e2e/solve.ts` covers the shipped boards in the
 * browser, but that is a different solver with a different contract and proves nothing about
 * this one.
 *
 * Deliberately the *production* solver, and deliberately every puzzle rather than a sample.
 */

const puzzles: StoredPuzzle[] = (dominoBoards as unknown as Record<string, StoredPuzzle[]>[])
    .flatMap(day => Object.values(day).flat())

describe('the shipped puzzles', () => {
    it('are all present and identifiable', () => {
        // A guard on the fixture itself: a test that silently iterates nothing passes.
        expect(puzzles.length).toBeGreaterThan(0)
        expect(new Set(puzzles.map(p => p.puzzleId)).size).toBe(puzzles.length)
    })

    it.each(puzzles.map(p => [p.puzzleId, p] as const))(
        '%s has exactly one solution, within the default budget', (_id, stored) => {
            const definition = definitionFrom(stored)
            const result = solve(definition)

            // `solved`, not merely "not unsolvable". A shipped puzzle with two answers can
            // contradict a player's correct reasoning; one with none cannot be finished at
            // all; and `budget-exhausted` means nobody knows which of those it is.
            expect(result.kind).toBe('solved')
        })

    it('all solve well inside the default budget, not merely inside it', () => {
        /*
         * The margin is the point. A puzzle needing 199,000 of 200,000 nodes would pass the
         * test above while leaving the budget one harder board away from being wrong, so this
         * asserts an order of magnitude of headroom rather than a bare pass.
         *
         * Measured today: the most expensive shipped board costs about a thousand nodes.
         */
        const costs = puzzles.map(stored => {
            const result = solve(definitionFrom(stored))
            return { id: stored.puzzleId, nodes: result.kind === 'solved' ? result.nodes : Infinity }
        })

        const worst = costs.reduce((a, b) => (b.nodes > a.nodes ? b : a))
        expect(worst.nodes, `${worst.id} is the most expensive shipped puzzle`)
            .toBeLessThan(DEFAULT_NODE_BUDGET / 10)
    })

    it('are parsed into definitions whose rocks and targets line up', () => {
        // If `definitionFrom` and the data ever disagree about size, the solver would answer
        // `invalid` above rather than `solved`, and the failure would be confusing. Say it
        // plainly here instead.
        for (const stored of puzzles) {
            const definition = definitionFrom(stored)
            expect(definition.size, stored.puzzleId).toBe(stored.board.length)
            expect(definition.columnTargets.split(','), stored.puzzleId)
                .toHaveLength(definition.size)
            expect(definition.rowTargets.split(','), stored.puzzleId)
                .toHaveLength(definition.size)
        }
    })
})

describe('the committed corpus on disk', () => {
    /*
     * The pure rules are tested in `corpusPipeline.test.ts`; this reads what is actually
     * committed. The two catch different things -- a rule can be right while the bytes in
     * the repository are stale, hand-edited, or half-written -- and this is the cheap half:
     * the full solver sweep over all 32,877 puzzles lives in `npm run corpus:verify`.
     */
    const manifest = JSON.parse(
        readFileSync(join('public', 'puzzles', 'index.json'), 'utf8')) as Manifest

    const readChunk = (ref: Manifest['chunks'][number]) => {
        const text = readFileSync(join('public', 'puzzles', ref.file), 'utf8')
        return { text, chunk: JSON.parse(text) as Chunk }
    }

    it('declares the version and seed the generator is pinned to', () => {
        // If either drifts, every unpublished date changes; the append-only check protects
        // the published ones, but the mismatch itself should be loud.
        expect(manifest.version).toBe(CORPUS_VERSION)
        expect(manifest.seed).toBe(CORPUS_SEED)
        expect(manifest.firstDate.startsWith(CORPUS_START_MONTH)).toBe(true)
    })

    it('covers today, which is the only thing the app strictly needs', () => {
        /*
         * This test is *meant* to start failing when the corpus expires, and that is not a
         * flaw in it. A horizon that no longer reaches today is a broken game, and the
         * scheduled guard exists to raise it months earlier -- long before this does.
         */
        const today = new Date().toISOString().slice(0, 10)
        expect(manifest.firstDate <= today, `corpus starts at ${manifest.firstDate}`).toBe(true)
        expect(manifest.lastDate >= today, `corpus ends at ${manifest.lastDate}`).toBe(true)
    })

    it('has one chunk per month with no gaps, and totals that add up', () => {
        expect(manifest.chunks.length).toBeGreaterThan(0)
        manifest.chunks.forEach((ref, index) => {
            if (index === 0) return
            expect(ref.month, `after ${manifest.chunks[index - 1].month}`)
                .toBe(addMonths(manifest.chunks[index - 1].month, 1))
        })

        const days = manifest.chunks.reduce((total, ref) => total + ref.days, 0)
        expect(days).toBe(manifest.days)
        expect(manifest.puzzles).toBe(manifest.days * SLOTS.length)
        expect(manifest.chunks[manifest.chunks.length - 1].lastDate).toBe(manifest.lastDate)
    })

    it('names every chunk after its own content, and the bytes still match', () => {
        // A sample rather than all 120: this runs on every unit invocation, and
        // `corpus:verify` hashes the lot. First, last, and a few in between.
        const sample = [
            manifest.chunks[0],
            manifest.chunks[Math.floor(manifest.chunks.length / 3)],
            manifest.chunks[Math.floor(manifest.chunks.length / 2)],
            manifest.chunks[manifest.chunks.length - 1],
        ]
        for (const ref of sample) {
            const { text } = readChunk(ref)
            expect(sha256(text), `${ref.file} content`).toBe(ref.sha256)
            // The filename carries the hash, so the URL changes when the content does.
            expect(ref.file).toBe(`${ref.month}.${ref.sha256.slice(0, 16)}.json`)
        }
    })

    it('holds puzzles the production solver proves unique, reproducibly', () => {
        const ref = manifest.chunks[0]
        const { chunk } = readChunk(ref)
        const day = chunk.days[0]

        for (const slot of SLOTS) {
            const puzzle = day[slot.group][slot.level - 1]
            expect(solve(definitionFrom(puzzle)).kind, puzzle.puzzleId).toBe('solved')
        }

        // And the committed bytes are what the generator produces today: a regenerated day
        // must equal the one on disk, or the corpus and the generator have drifted apart.
        expect(JSON.stringify(generateDay(day.date))).toBe(JSON.stringify(day))
    })

    it('is not reachable from the JavaScript import graph', async () => {
        /*
         * The reason the corpus is in `public/` at all. Twelve megabytes of minified JSON
         * behind an `import` would be twelve megabytes the bundler has to carry into the
         * client; as static files a visitor fetches one month, a few kilobytes compressed.
         *
         * Checked by reading the source rather than by inspecting a build, because the thing
         * worth preventing is someone adding the import -- which is easy, looks harmless,
         * and would not fail any other test here.
         */
        const { readdir, readFile } = await import('node:fs/promises')
        const roots = ['app', 'scripts', 'e2e']
        const offenders: string[] = []

        const walk = async (dir: string): Promise<void> => {
            for (const entry of await readdir(dir, { withFileTypes: true })) {
                const path = join(dir, entry.name)
                if (entry.isDirectory()) { await walk(path); continue }
                if (!/\.(ts|tsx)$/.test(entry.name)) continue
                const source = await readFile(path, 'utf8')
                // `corpus-io.ts` reads the directory at build time by path, which is fine;
                // what must not exist is a static import of the JSON itself.
                if (/\bfrom\s+['"][^'"]*public\/puzzles[^'"]*\.json['"]/.test(source)
                    || /\bimport\s*\(\s*['"][^'"]*public\/puzzles[^'"]*\.json['"]/.test(source)) {
                    offenders.push(path)
                }
            }
        }
        for (const root of roots) await walk(root)

        expect(offenders).toEqual([])
    })
})
