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
    LOCK_FILE,
} from '@/scripts/corpus-io'
import { randomUUID } from 'node:crypto'

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
    /** Throw to fail a write, or return a promise to hold it open. */
    onWrite: null as null | ((path: string) => void | Promise<void>),
    /** Return a string to substitute for a read, or throw to fail it. */
    onRead: null as null | ((path: string) => string | void),
    /** Throw to fail a rename, or return a promise to hold it open. */
    onRename: null as null | ((from: string) => void | Promise<void>),
    /** Observe a removal; called with the path before it happens. */
    onRemove: null as null | ((path: string) => void),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
    const real = await importOriginal<typeof import('node:fs/promises')>()
    return {
        ...real,
        default: real,
        writeFile: async (path: never, ...rest: never[]) => {
            await hooks.onWrite?.(String(path))
            return real.writeFile(path, ...(rest as [never]))
        },
        readFile: async (path: never, ...rest: never[]) => {
            const substitute = hooks.onRead?.(String(path))
            if (typeof substitute === 'string') return substitute
            return real.readFile(path, ...(rest as [never]))
        },
        rename: async (from: never, to: never) => {
            await hooks.onRename?.(String(from))
            return real.rename(from, to)
        },
        rm: async (path: never, ...rest: never[]) => {
            hooks.onRemove?.(String(path))
            return real.rm(path, ...(rest as [never]))
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
    hooks.onRemove = null
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
        expect((await readdir(dir)).filter(name => name.startsWith('.tmp.'))).toEqual([])
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
            if (path.endsWith(MANIFEST_FILE) || path.includes(`.${MANIFEST_FILE}`)) {
                throw new Error('no space for the manifest')
            }
        }
        await expect(writeCorpus(replacement, dir)).rejects.toThrow('no space for the manifest')
        clearHooks()
        await stillIntact()
    })

    it('survives the commit rename failing', async () => {
        // The moment of truth. Before the rename, the old manifest is still the live one.
        hooks.onRename = from => {
            if (!from.includes(`.${MANIFEST_FILE}`)) return
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
        hooks.onRead = path => (path.includes(`.${MANIFEST_FILE}`) ? '{"truncated":' : undefined)

        await expect(writeCorpus(replacement, dir)).rejects.toThrow(/did not survive being written/)
        clearHooks()
        await stillIntact()
    })

    it('cleans up its temporary manifest when it fails', async () => {
        hooks.onRename = from => {
            if (from.includes(`.${MANIFEST_FILE}`)) throw new Error('rename refused')
        }
        await expect(writeCorpus(replacement, dir)).rejects.toThrow()
        clearHooks()

        expect((await readdir(dir)).filter(name => name.startsWith('.tmp.'))).toEqual([])
    })

    it('leaves the new chunk unreferenced rather than half-committed', async () => {
        // The cost of a failed build is some files nothing points at -- reported by
        // `orphanFiles`, removed by the next build that succeeds. Not a broken corpus.
        hooks.onRename = from => {
            if (from.includes(`.${MANIFEST_FILE}`)) throw new Error('rename refused')
        }
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

        hooks.onRename = from => {
            if (from.includes(`.${MANIFEST_FILE}`)) throw new Error('rename refused')
        }
        await expect(writeCorpus(shrunk, dir)).rejects.toThrow('rename refused')
        clearHooks()

        // The two-month corpus must still be entirely readable, October included -- which
        // requires October's chunk to still be on disk.
        const read = await readCorpus(dir)
        expect(read).not.toBeNull()
        expect(read!.chunks).toHaveLength(2)
        expect(read!.manifest.lastDate).toBe('2026-10-31')
    })

    it('writes every file through a unique temporary name', async () => {
        const names: string[] = []
        hooks.onWrite = path => { if (path.includes('.tmp.')) names.push(path) }

        await writeCorpus(replacement, dir)
        await writeCorpus(corpusOf(['2026-09', '2026-10', '2026-11']), dir)
        expect(names.length).toBeGreaterThan(1)
        expect(new Set(names).size).toBe(names.length)
    })
})


describe('an existing chunk is verified, never trusted by name', () => {
    /*
     * A chunk's filename carries the first 16 hex of its content hash, and it is tempting to
     * treat that as proof. It is not: a name is not evidence about bytes, and 64 bits is not
     * a lot of them either.
     *
     * The concrete failure is a process killed mid-write, which leaves a truncated file
     * under its final name. Measured before this fix: the next build skipped it on sight of
     * the filename, committed a manifest pointing at the wreckage, and **reported success**.
     * The corruption then surfaced at read time, later, somewhere else entirely.
     */

    it('rewrites a truncated chunk left in a corpus by an interrupted build', async () => {
        // The realistic case: a corpus already exists and one of its chunks was clobbered.
        await writeCorpus(corpusOf(['2026-09']), dir)
        const next = corpusOf(['2026-09', '2026-10'])
        await writeFile(join(dir, next.manifest.chunks[1].file), '{"truncat', 'utf8')

        await writeCorpus(next, dir)

        // Readable, which it can only be if the truncated file was rewritten rather than
        // skipped on the strength of its name.
        const read = await readCorpus(dir)
        expect(read).not.toBeNull()
        expect(read!.chunks).toHaveLength(2)
    })

    it('never commits a manifest that points at bytes it did not verify', async () => {
        const corpus = corpusOf(['2026-09', '2026-10'])
        // An interrupted first build: one chunk written correctly, the next half-written.
        await writeFile(join(dir, corpus.manifest.chunks[0].file),
            encodeChunk(corpus.chunks[0]), 'utf8')
        await writeFile(join(dir, corpus.manifest.chunks[1].file), 'rubbish', 'utf8')

        await writeCorpus(corpus, dir)
        await expect(readCorpus(dir)).resolves.not.toBeNull()
    })

    it('refuses a corrupt chunk sitting alone, with nothing to vouch for the directory', async () => {
        /*
         * The other side of the same judgement. Alongside a manifest or a verified chunk, a
         * badly-hashing file is this pipeline's own wreckage and may be overwritten. Alone,
         * it is indistinguishable from a stranger's file that happens to be named like a
         * chunk, and nothing here is entitled to delete it.
         */
        const corpus = corpusOf(['2026-09'])
        await writeFile(join(dir, corpus.manifest.chunks[0].file), '{"truncat', 'utf8')
        await expect(writeCorpus(corpus, dir)).rejects.toThrow(/do not match their own content hashes/)
        expect(await readFile(join(dir, corpus.manifest.chunks[0].file), 'utf8')).toBe('{"truncat')
    })

    it('leaves a correct existing chunk alone, so extending stays cheap', async () => {
        // The verification must not turn every rebuild into a full rewrite. A chunk whose
        // bytes already hash correctly is skipped, and skipping is observable: no write.
        await writeCorpus(corpusOf(['2026-09']), dir)

        const written: string[] = []
        hooks.onWrite = path => { written.push(path) }
        await writeCorpus(corpusOf(['2026-09', '2026-10']), dir)
        clearHooks()

        expect(written.some(path => path.includes('2026-10'))).toBe(true)
        expect(written.some(path => path.includes('2026-09'))).toBe(false)
    })

    it('refuses a target holding a plausibly-named file that is not a chunk', async () => {
        /*
         * `assertSafeTarget` used to accept any filename shaped like a chunk. A directory
         * containing `2026-09.deadbeefdeadbeef.json` full of unrelated bytes was therefore
         * "a corpus directory", and the pipeline would happily delete its contents. The name
         * now has to be demonstrated: it must be the hash of what is in the file.
         */
        await writeFile(join(dir, '2026-09.deadbeefdeadbeef.json'), 'not a chunk at all', 'utf8')
        await expect(assertSafeTarget(dir))
            .rejects.toThrow(/do not match their own content hashes/)
    })
})

describe('recovering from an interrupted build', () => {
    /*
     * The claim was that a failed build costs nothing but unreferenced files, which the next
     * successful build removes. That was false: a temporary manifest left behind by a
     * process that died before renaming it was classified as an unrelated entry, so
     * `assertSafeTarget` refused, and **every subsequent build refused too** -- permanently,
     * until someone deleted the file by hand. The recovery story blocked recovery.
     */

    it('proceeds when an abandoned temporary file is present, and removes it', async () => {
        await writeCorpus(corpusOf(['2026-09']), dir)
        const abandoned = join(dir, `.tmp.${randomUUID()}.${MANIFEST_FILE}`)
        await writeFile(abandoned, '{"half":', 'utf8')

        await expect(assertSafeTarget(dir)).resolves.toBeUndefined()
        await writeCorpus(corpusOf(['2026-09', '2026-10']), dir)

        expect((await readdir(dir)).filter(name => name.startsWith('.tmp.'))).toEqual([])
        expect((await readCorpus(dir))!.chunks).toHaveLength(2)
    })

    it('proceeds when an abandoned chunk temporary is present', async () => {
        const abandoned = join(dir, `.tmp.${randomUUID()}.2026-09.0000000000000000.json`)
        await writeFile(abandoned, 'half a chunk', 'utf8')

        await expect(assertSafeTarget(dir)).resolves.toBeUndefined()
        await writeCorpus(corpusOf(['2026-09']), dir)
        expect((await readdir(dir)).filter(name => name.startsWith('.tmp.'))).toEqual([])
    })

    it('proceeds when a lock is left by a process that no longer exists', async () => {
        // A crash must not require a human before any build can run again.
        await writeFile(join(dir, LOCK_FILE), JSON.stringify({ pid: 0x7fffffff, at: 'then' }))
        await expect(writeCorpus(corpusOf(['2026-09']), dir)).resolves.toBeUndefined()
        expect((await readdir(dir)).includes(LOCK_FILE)).toBe(false)
    })

    it('recovers a first build that died before its manifest existed', async () => {
        // Chunks on disk, no manifest at all. Legitimate recovery state, not a stranger.
        const corpus = corpusOf(['2026-09'])
        await writeFile(join(dir, corpus.manifest.chunks[0].file),
            encodeChunk(corpus.chunks[0]), 'utf8')

        await expect(assertSafeTarget(dir)).resolves.toBeUndefined()
        await writeCorpus(corpus, dir)
        expect(await corpusIsReadable(dir)).toBe(true)
    })
})

describe('two builds at once', () => {
    /*
     * Unique temporary names stop two builds overwriting each other's *scratch* files. They
     * do nothing about the race that matters, which is two builds committing manifests: a
     * longer build can commit and then be replaced by a shorter one that started earlier and
     * finished later, and the corpus silently goes backwards. The previous test for this
     * called `writeCorpus` twice in sequence and compared two filenames, which is not a test
     * of concurrency at all.
     */

    it('refuses a second writer while the first holds the lock', async () => {
        let release = () => { }
        const gate = new Promise<void>(resolve => { release = resolve })
        let firstHasStarted = () => { }
        const started = new Promise<void>(resolve => { firstHasStarted = resolve })

        hooks.onWrite = async path => {
            if (!path.includes('2026-09')) return
            firstHasStarted()
            await gate
        }

        const first = writeCorpus(corpusOf(['2026-09', '2026-10']), dir)
        await started

        // Genuinely overlapping: the first writer is suspended mid-write.
        clearHooks()
        await expect(writeCorpus(corpusOf(['2026-09']), dir))
            .rejects.toThrow(/another build \(pid \d+\) is writing/)

        release()
        await first

        // And the corpus is the first writer's, not a mixture and not a regression.
        const read = await readCorpus(dir)
        expect(read!.chunks).toHaveLength(2)
        expect(read!.manifest.lastDate).toBe('2026-10-31')
    })

    it('cannot regress to a shorter corpus through an interleaved commit', async () => {
        /*
         * The lost update, stated directly. Without a lock the shorter build commits second
         * and wins; with one it never gets to run at all, so the longer corpus stands.
         */
        await writeCorpus(corpusOf(['2026-09']), dir)

        let release = () => { }
        const gate = new Promise<void>(resolve => { release = resolve })
        let reached = () => { }
        const arrived = new Promise<void>(resolve => { reached = resolve })

        hooks.onRename = async from => {
            if (!from.includes(`.${MANIFEST_FILE}`)) return
            reached()
            await gate
        }

        const longer = writeCorpus(corpusOf(['2026-09', '2026-10', '2026-11']), dir)
        await arrived
        clearHooks()

        await expect(writeCorpus(corpusOf(['2026-09']), dir)).rejects.toThrow(/another build/)
        release()
        await longer

        expect((await readCorpus(dir))!.chunks).toHaveLength(3)
    })

    it('holds the lock until the transaction is completely finished', async () => {
        /*
         * The cleanup pass deletes files by name and must skip the lock. Removing it there
         * would end the critical section early -- another writer could acquire the lock
         * while this one is still deleting -- and the end state would look identical, which
         * is why this watches the order of removals rather than what is left behind.
         *
         * Found by mutation-testing: dropping the `LOCK_FILE` exclusion broke nothing.
         */
        await writeCorpus(corpusOf(['2026-09', '2026-10']), dir)

        const removed: string[] = []
        hooks.onRemove = path => removed.push(path)
        await writeCorpus(corpusOf(['2026-09']), dir)   // drops a chunk, so cleanup runs
        clearHooks()

        const lockRemovals = removed
            .map((path, index) => (path.endsWith(LOCK_FILE) ? index : -1))
            .filter(index => index >= 0)
        // Exactly one, and it is the last thing that happens.
        expect(lockRemovals).toEqual([removed.length - 1])
    })

    it('releases the lock even when the write fails', async () => {
        hooks.onRename = from => {
            if (from.includes(`.${MANIFEST_FILE}`)) throw new Error('rename refused')
        }
        await expect(writeCorpus(corpusOf(['2026-09']), dir)).rejects.toThrow()
        clearHooks()

        expect((await readdir(dir)).includes(LOCK_FILE)).toBe(false)
        // And the next build works.
        await expect(writeCorpus(corpusOf(['2026-09']), dir)).resolves.toBeUndefined()
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

    /*
     * Against a fixture, never against `public/puzzles`. An earlier version of these tests
     * rewrote the committed manifest and restored it in a `finally`, which leaves the
     * repository corrupted if the worker is killed and lets any test running in parallel
     * observe the tampered file. The command takes `--dir` for exactly this.
     */
    const runHorizon = (today: string, at: string = dir) => {
        const result = spawnSync(
            process.execPath,
            [join('node_modules', 'tsx', 'dist', 'cli.mjs'), join('scripts', 'check-horizon.ts'),
                '--today', today, '--dir', at],
            { encoding: 'utf8' })
        return {
            code: result.status,
            output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
        }
    }

    beforeEach(async () => { await writeCorpus(corpusOf(['2026-09', '2026-10']), dir) })

    it('passes while the content still reaches far enough ahead', () => {
        const { code, output } = runHorizon('2025-01-01')
        expect(output).toContain('content reaches 2026-10-31')
        expect(code).toBe(0)
    })

    it('fails when the calendar has caught up with the content', () => {
        const { code, output } = runHorizon('2026-09-18')
        expect(output).toContain('fewer than')
        expect(code).toBe(1)
    })

    it('rejects a --today that is not a date, instead of reporting NaN months', () => {
        // It used to subtract its way to `NaN months left` and exit zero, which reads as a
        // pass to anything watching the exit code -- which is all CI does.
        for (const bad of ['tomorrow', '2026-13-45']) {
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
         * perfectly happy -- and the guard used to read that field and believe it.
         */
        const path = join(dir, MANIFEST_FILE)
        const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest
        writeFileSync(path, JSON.stringify({ ...manifest, lastDate: '2099-12-31' }, null, 2) + '\n')

        const { code, output } = runHorizon('2098-01-01')
        expect(output).toContain('does not validate')
        expect(output).toContain('manifest lastDate is 2099-12-31')
        expect(code).toBe(1)
    })

    it('reports a directory that holds no corpus', () => {
        const { code, output } = runHorizon('2026-01-01', join(dir, 'nothing'))
        expect(output).toContain('no corpus at')
        expect(code).toBe(1)
    })
})
