import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    CORPUS_VERSION, chunkRefFor, datesIn, encodeChunk, generateDay, manifestFor,
    puzzleIdFor, SLOTS, type Chunk, type DayEntry, type Manifest,
} from '@/scripts/corpus'
import {
    assertSafeTarget, corpusIsReadable, orphanFiles, readCorpus, writeCorpus, MANIFEST_FILE,
} from '@/scripts/corpus-io'

/**
 * Replacing the committed corpus (spec P1-6, row 18c).
 *
 * This is the one operation in the pipeline that can destroy something. The first version
 * did `rm(dir, { recursive: true }); rename(staging, dir)`, which is wrong twice: between
 * those calls there is no corpus at all, and it could not be fixed by swapping the order
 * because renaming a directory over a non-empty one fails with `EPERM` on Windows
 * (measured). It could also be pointed at `public` or at the repository root and would
 * recursively delete either.
 *
 * What replaced it uses the transaction the content-addressed design already provides: a
 * chunk's filename contains the hash of its bytes, so a new chunk can never collide with a
 * live one, and the manifest -- a single file, replaceable by an atomic rename even on
 * Windows -- is what decides which files are the corpus.
 *
 * The tests below inject failures at each step and require the same thing every time: the
 * corpus that was readable before is still readable after.
 */

/**
 * Hooks for injecting filesystem failures.
 *
 * `vi.spyOn(fsp, 'writeFile')` cannot work here -- an ESM module namespace is not
 * configurable, so the property cannot be redefined. The module is mocked instead, with a
 * thin wrapper that delegates to the real implementation unless a hook says otherwise, so
 * every test that is *not* injecting a failure still touches a real filesystem.
 */
const hooks = vi.hoisted(() => ({
    /** Throw to fail a write; called with the path. */
    onWrite: null as null | ((path: string) => void),
    /** Return a string to substitute for a read, or throw to fail it. */
    onRead: null as null | ((path: string) => string | void),
    /** Throw to fail a rename. */
    onRename: null as null | ((from: string) => void),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
    const real = await importOriginal<typeof import('node:fs/promises')>()
    return {
        ...real,
        default: real,
        writeFile: async (path: never, ...rest: never[]) => {
            hooks.onWrite?.(String(path))
            return real.writeFile(path, ...(rest as [never]))
        },
        readFile: async (path: never, ...rest: never[]) => {
            const substitute = hooks.onRead?.(String(path))
            if (typeof substitute === 'string') return substitute
            return real.readFile(path, ...(rest as [never]))
        },
        rename: async (from: never, to: never) => {
            hooks.onRename?.(String(from))
            return real.rename(from, to)
        },
    }
})

let dir = ''

/** One real day, re-dated, so fixtures are cheap. */
const TEMPLATE = generateDay('2026-09-01')
const dayLike = (date: string): DayEntry => {
    const copy: DayEntry = JSON.parse(JSON.stringify(TEMPLATE))
    copy.date = date
    for (const slot of SLOTS) {
        copy[slot.group][slot.level - 1].puzzleId = puzzleIdFor(date, slot.group, slot.level)
    }
    return copy
}

const corpusOf = (months: string[]) => {
    const chunks: Chunk[] = months.map(month => ({
        month, version: CORPUS_VERSION, days: datesIn(month).map(dayLike),
    }))
    return { manifest: manifestFor(chunks, '2026-09-18T00:00:00.000Z'), chunks }
}

const clearHooks = () => {
    hooks.onWrite = null
    hooks.onRead = null
    hooks.onRename = null
}

beforeEach(async () => {
    clearHooks()
    dir = await mkdtemp(join(tmpdir(), 'corpus-io-'))
})
afterEach(async () => {
    clearHooks()
    await rm(dir, { recursive: true, force: true })
})

describe('refusing an unsafe target', () => {
    /*
     * The write path creates and deletes files in whatever directory it is handed, so
     * `--out public` or `--out .` must fail *before* anything is generated. The rule is
     * about content rather than about paths -- a path rule would still let `--out ./src`
     * through -- so a directory qualifies only if it is absent, empty, or holds nothing but
     * a manifest and correctly-named chunks.
     */

    it('accepts a directory that does not exist yet', async () => {
        await expect(assertSafeTarget(join(dir, 'fresh'))).resolves.toBeUndefined()
    })

    it('accepts an empty directory', async () => {
        await expect(assertSafeTarget(dir)).resolves.toBeUndefined()
    })

    it('accepts a directory that is already a corpus', async () => {
        await writeCorpus(corpusOf(['2026-09']), dir)
        await expect(assertSafeTarget(dir)).resolves.toBeUndefined()
    })

    it('refuses a directory holding anything else', async () => {
        await writeFile(join(dir, 'index.tsx'), 'export default null')
        await expect(assertSafeTarget(dir)).rejects.toThrow(/not a corpus directory/)
    })

    it('refuses a directory of unrelated subdirectories, as `--out public` would be', async () => {
        await mkdir(join(dir, 'images'))
        await writeFile(join(dir, 'favicon.ico'), '')
        await expect(assertSafeTarget(dir)).rejects.toThrow(/not a corpus directory/)
    })

    it('refuses a file', async () => {
        const path = join(dir, 'notadir')
        await writeFile(path, 'x')
        await expect(assertSafeTarget(path)).rejects.toThrow(/is a file, not a corpus directory/)
    })

    it('refuses before writing anything, not after', async () => {
        await writeFile(join(dir, 'precious.txt'), 'do not delete me')
        await expect(writeCorpus(corpusOf(['2026-09']), dir)).rejects.toThrow(/not a corpus directory/)
        // Still there, and no corpus was written around it.
        expect(await readFile(join(dir, 'precious.txt'), 'utf8')).toBe('do not delete me')
        expect(await readdir(dir)).toEqual(['precious.txt'])
    })
})

describe('writing a corpus', () => {
    it('writes chunks and a manifest that read back', async () => {
        const corpus = corpusOf(['2026-09', '2026-10'])
        await writeCorpus(corpus, dir)

        const read = await readCorpus(dir)
        expect(read).not.toBeNull()
        expect(read!.manifest.lastDate).toBe('2026-10-31')
        expect(read!.chunks).toHaveLength(2)
    })

    it('keeps chunks it has already written, so extending is cheap', async () => {
        await writeCorpus(corpusOf(['2026-09']), dir)
        const first = await readFile(join(dir, chunkRefFor(corpusOf(['2026-09']).chunks[0]).file), 'utf8')

        await writeCorpus(corpusOf(['2026-09', '2026-10']), dir)
        const again = await readFile(join(dir, chunkRefFor(corpusOf(['2026-09']).chunks[0]).file), 'utf8')
        expect(again).toBe(first)
    })

    it('removes chunks the new manifest no longer names', async () => {
        await writeCorpus(corpusOf(['2026-09', '2026-10']), dir)
        // A corpus the build would normally refuse to shrink to; here it only exercises the
        // cleanup, which must not leave the dropped chunk behind to confuse later reads.
        await writeCorpus(corpusOf(['2026-09']), dir)

        const left = await readdir(dir)
        expect(left).toHaveLength(2)   // one chunk plus the manifest
        expect(await orphanFiles((await readCorpus(dir))!, dir)).toEqual([])
    })

    it('leaves no temporary files behind', async () => {
        await writeCorpus(corpusOf(['2026-09']), dir)
        expect((await readdir(dir)).filter(name => name.includes('.tmp'))).toEqual([])
    })
})

describe('a build that fails part-way', () => {
    /*
     * Every one of these asserts the same property: whatever was readable before is still
     * readable afterwards. That is the guarantee the old delete-then-rename could not make.
     */

    const existing = corpusOf(['2026-09'])
    const replacement = corpusOf(['2026-09', '2026-10'])

    beforeEach(async () => { await writeCorpus(existing, dir) })

    const stillIntact = async () => {
        expect(await corpusIsReadable(dir)).toBe(true)
        const read = await readCorpus(dir)
        expect(read!.manifest.lastDate).toBe('2026-09-30')
        expect(read!.chunks).toHaveLength(1)
    }

    it('survives a chunk write that throws', async () => {
        hooks.onWrite = path => {
            if (path.includes('2026-10')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
        }
        await expect(writeCorpus(replacement, dir)).rejects.toThrow('disk full')
        clearHooks()
        await stillIntact()
    })

    it('survives a manifest write that throws', async () => {
        hooks.onWrite = path => {
            if (path.includes(MANIFEST_FILE)) throw new Error('no space for the manifest')
        }
        await expect(writeCorpus(replacement, dir)).rejects.toThrow('no space for the manifest')
        clearHooks()
        await stillIntact()
    })

    it('survives the commit rename failing', async () => {
        // The moment of truth. Before the rename, the old manifest is still the live one.
        hooks.onRename = () => {
            throw Object.assign(new Error('rename refused'), { code: 'EPERM' })
        }
        await expect(writeCorpus(replacement, dir)).rejects.toThrow('rename refused')
        clearHooks()
        await stillIntact()
    })

    it('refuses to commit a manifest that did not land intact', async () => {
        /*
         * A short write is exactly the failure a rename would otherwise seal in, so the
         * temporary manifest is read back before it is promoted. Here the read-back returns
         * something else, standing in for a truncated write.
         */
        hooks.onRead = path => (path.includes('.tmp') ? '{"truncated":' : undefined)

        await expect(writeCorpus(replacement, dir)).rejects.toThrow(/did not survive being written/)
        clearHooks()
        await stillIntact()
    })

    it('cleans up its temporary manifest when it fails', async () => {
        hooks.onRename = () => { throw new Error('rename refused') }
        await expect(writeCorpus(replacement, dir)).rejects.toThrow()
        clearHooks()

        expect((await readdir(dir)).filter(name => name.includes('.tmp'))).toEqual([])
    })

    it('leaves the new chunk unreferenced rather than half-committed', async () => {
        // The cost of a failed build is some files nothing points at -- reported by
        // `orphanFiles`, removed by the next build that succeeds. Not a broken corpus.
        hooks.onRename = () => { throw new Error('rename refused') }
        await expect(writeCorpus(replacement, dir)).rejects.toThrow()
        clearHooks()

        await stillIntact()
        const orphans = await orphanFiles((await readCorpus(dir))!, dir)
        expect(orphans.length).toBeGreaterThan(0)

        // And a later successful build tidies them away.
        await writeCorpus(replacement, dir)
        expect(await orphanFiles((await readCorpus(dir))!, dir)).toEqual([])
    })

    it('does not delete a dropped chunk until the new manifest is committed', async () => {
        /*
         * The ordering the transaction turns on, and the one case the other failure tests
         * miss: they all replace a corpus with a superset of itself, so the cleanup loop has
         * nothing to delete and running it early looks harmless. Found by mutation-testing,
         * which moved the loop above the rename and broke nothing.
         *
         * Drop a chunk *and* fail the commit, and the difference is total. Cleaning up first
         * deletes a chunk the still-live manifest names, so the previous corpus stops being
         * readable at all -- which is exactly the failure the whole design is meant to make
         * impossible.
         */
        // The surrounding `beforeEach` publishes one month; this needs two, so that the
        // attempted write actually drops one.
        await writeCorpus(replacement, dir)
        const shrunk = corpusOf(['2026-09'])   // 2026-10 would be dropped

        hooks.onRename = () => { throw new Error('rename refused') }
        await expect(writeCorpus(shrunk, dir)).rejects.toThrow('rename refused')
        clearHooks()

        // The two-month corpus must still be entirely readable, October included -- which
        // requires October's chunk to still be on disk.
        const read = await readCorpus(dir)
        expect(read).not.toBeNull()
        expect(read!.chunks).toHaveLength(2)
        expect(read!.manifest.lastDate).toBe('2026-10-31')
    })

    it('uses a unique temporary name, so concurrent builds cannot cross', async () => {
        const names: string[] = []
        hooks.onWrite = path => { if (path.includes('.tmp')) names.push(path) }

        await writeCorpus(replacement, dir)
        await writeCorpus(replacement, dir)
        expect(names).toHaveLength(2)
        expect(names[0]).not.toBe(names[1])
    })
})

describe('reading a corpus', () => {
    it('returns null only when the manifest is absent', async () => {
        expect(await readCorpus(join(dir, 'nothing-here'))).toBeNull()
    })

    it('propagates any other read failure instead of reporting no corpus', async () => {
        /*
         * This one matters more than it looks. `readCorpus` used to catch everything and
         * return null, so a permissions error or a busy handle read as "nothing is
         * published" -- and the append-only check, the only thing standing between a rebuild
         * and ten years of overwritten content, would have had nothing to compare against
         * and waved it through.
         */
        await writeCorpus(corpusOf(['2026-09']), dir)
        hooks.onRead = path => {
            if (path.endsWith(MANIFEST_FILE)) {
                throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
            }
        }
        await expect(readCorpus(dir)).rejects.toThrow('permission denied')
    })

    it('refuses a chunk whose bytes do not match the manifest', async () => {
        const corpus = corpusOf(['2026-09'])
        await writeCorpus(corpus, dir)

        const ref = corpus.manifest.chunks[0]
        await writeFile(join(dir, ref.file), encodeChunk({ ...corpus.chunks[0], month: '2027-01' }), 'utf8')

        await expect(readCorpus(dir)).rejects.toThrow(/does not match the hash/)
    })
})


describe('the horizon guard cannot be talked out of it', () => {
    /*
     * End-to-end, through the real CLI, because this is a property of the command rather
     * than of a function: it used to read `manifest.lastDate` straight out of `index.json`.
     * `readCorpus` verifies every chunk's hash, but nothing tied that field to the chunks,
     * so editing one line of the manifest would have kept the scheduled guard green for
     * years with no additional puzzle content behind it.
     *
     * A guard that can be silenced by editing the thing it guards is not a guard.
     */

    const runHorizon = (today: string) => {
        const result = spawnSync(
            process.execPath,
            [join('node_modules', 'tsx', 'dist', 'cli.mjs'), join('scripts', 'check-horizon.ts'),
                '--today', today],
            { encoding: 'utf8' })
        return {
            code: result.status,
            output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
        }
    }

    it('passes on the committed corpus', () => {
        const { code, output } = runHorizon('2026-09-18')
        expect(output).toMatch(/content reaches \d{4}-\d{2}-\d{2}/)
        expect(code).toBe(0)
    })

    it('fails when the calendar has caught up with the content', () => {
        const manifest = JSON.parse(
            readFileSync(join('public', 'puzzles', MANIFEST_FILE), 'utf8')) as Manifest
        // Eleven months before the end: one month inside the twelve-month warning.
        const [year, month] = manifest.lastDate.split('-').map(Number)
        const eleven = new Date(Date.UTC(year, month - 1 - 11, 18)).toISOString().slice(0, 10)

        const { code, output } = runHorizon(eleven)
        expect(output).toContain('fewer than')
        expect(code).toBe(1)
    })

    it('rejects a --today that is not a date, instead of reporting NaN months', () => {
        // It used to subtract its way to `NaN months left` and exit zero, which reads as a
        // pass to anything watching the exit code -- which is all CI does.
        for (const bad of ['tomorrow', '2026-13-45', '']) {
            const { code, output } = runHorizon(bad)
            expect(output, bad).toContain('must be a real YYYY-MM-DD date')
            expect(output, bad).not.toContain('NaN')
            expect(code, bad).toBe(1)
        }
    })

    it('refuses a manifest that claims more content than the chunks hold', () => {
        /*
         * The attack the old guard fell to, performed exactly: change nothing but
         * `lastDate`. No chunk is touched, so every hash still matches and `readCorpus` is
         * perfectly happy.
         */
        const path = join('public', 'puzzles', MANIFEST_FILE)
        const original = readFileSync(path, 'utf8')
        try {
            const manifest = JSON.parse(original) as Manifest
            writeFileSync(path, JSON.stringify({ ...manifest, lastDate: '2099-12-31' }, null, 2) + '\n')

            const { code, output } = runHorizon('2098-01-01')
            expect(output).toContain('does not validate')
            expect(output).toContain('manifest lastDate is 2099-12-31')
            expect(code).toBe(1)
        } finally {
            writeFileSync(path, original)
        }
    })
})
