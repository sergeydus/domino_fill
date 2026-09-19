import { randomUUID } from "node:crypto"
import { readdir, readFile, mkdir, writeFile, rm, rename } from "node:fs/promises"
import { join, resolve } from "node:path"
import {
    encodeChunk, sha256, type Chunk, type Manifest,
} from "./corpus"

/**
 * Reading and writing the corpus on disk (spec P1-6, row 18c).
 *
 * Kept apart from `corpus.ts` so the rules are testable without a filesystem, and so the one
 * genuinely delicate operation — replacing committed assets — sits in a single place.
 */

/**
 * Where the generated assets live.
 *
 * `public/` and not anywhere under `app/`, because the corpus must stay **out of the
 * JavaScript import graph**. Twelve megabytes of minified JSON reachable from an `import`
 * would be twelve megabytes the bundler has to carry; served as static files, a client
 * fetches one ~6 KB month when it needs it. This is the whole reason the content is chunked.
 */
export const CORPUS_DIR = join('public', 'puzzles')
export const MANIFEST_FILE = 'index.json'

/** A published chunk: a month, the first 16 hex of its content hash, `.json`. */
const CHUNK_FILE = /^(\d{4}-\d{2})\.([0-9a-f]{16})\.json$/
/** A half-written file from a build that did not finish. Owned by this module. */
const TEMP_FILE = /^\.tmp\.[0-9a-f-]{36}\.[^/\\]+$/
/** Held for the duration of a write, so two builds cannot race their commits. */
export const LOCK_FILE = '.corpus-lock'

const tempNameFor = (finalName: string) => `.tmp.${randomUUID()}.${finalName}`

export type Corpus = { manifest: Manifest, chunks: Chunk[] }

/**
 * Refuse to treat a directory as a corpus unless everything in it belongs to this pipeline.
 *
 * The write path creates and deletes files here, so pointing it at `public`, or at the
 * repository root, must fail *before* anything is generated rather than after. The check is
 * on content rather than on the path, because a path rule would still let `--out ./src`
 * through.
 *
 * "Belongs to this pipeline" is proved, not assumed. A chunk's name contains the first 16
 * hex of its own content hash, so a file claiming to be a chunk can be made to demonstrate
 * it — and a directory holding `2026-09.deadbeefdeadbeef.json` full of unrelated bytes was
 * previously accepted on the strength of its filename alone.
 */
export const assertSafeTarget = async (dir: string): Promise<void> => {
    let entries: string[]
    try {
        entries = await readdir(dir)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return   // will be created
        if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') {
            throw new Error(`${resolve(dir)} is a file, not a corpus directory`)
        }
        throw error
    }
    if (entries.length === 0) return

    const strangers: string[] = []
    /** Chunk-named, but the bytes do not hash to the name. Corrupt — but whose? */
    const unverifiable: string[] = []
    /** Anything that could only have been produced by this pipeline. */
    let evidenceOfOwnership = false

    for (const name of entries) {
        // The manifest, a lock, and this module's own temporary files are all recovery
        // state from an interrupted run. Refusing to proceed because one is present would
        // make a crash permanently unrecoverable, which is what used to happen.
        if (name === MANIFEST_FILE || name === LOCK_FILE || TEMP_FILE.test(name)) {
            evidenceOfOwnership = true
            continue
        }

        const match = CHUNK_FILE.exec(name)
        if (!match) { strangers.push(name); continue }

        const content = await readFile(join(dir, name), 'utf8').catch(() => null)
        if (content !== null && sha256(content).startsWith(match[2])) evidenceOfOwnership = true
        else unverifiable.push(name)
    }

    const refuse = (which: string[], why: string) => {
        throw new Error(
            `${resolve(dir)} is not a corpus directory: it holds ${which.length} entr`
            + `${which.length === 1 ? 'y' : 'ies'} ${why} `
            + `(${which.slice(0, 3).join(', ')}${which.length > 3 ? ', …' : ''}). `
            + 'Refusing to write a corpus into it.')
    }

    if (strangers.length > 0) refuse(strangers, 'this pipeline did not write')

    /*
     * A chunk-named file whose bytes do not hash to its name is corrupt either way; the
     * question is whether it is *our* corruption. Alongside a manifest, a verified chunk, or
     * a temporary of ours, it is the wreckage of an interrupted build and the next build
     * should overwrite it — refusing there would be the recovery-blocking mistake again.
     * Alone in a directory, it is indistinguishable from a stranger's file that happens to
     * be named like a chunk, and nothing here may delete it.
     */
    if (unverifiable.length > 0 && !evidenceOfOwnership) {
        refuse(unverifiable, 'look like chunks but do not match their own content hashes, in a '
            + 'directory with nothing else identifying it as a corpus —')
    }
}

/**
 * Read the committed corpus, or null when there is not one yet.
 *
 * Only a missing manifest means "no corpus". Every other failure propagates: a permissions
 * error or a busy handle read as absence would make the build think nothing is published,
 * and the append-only check — the thing standing between a rebuild and ten years of
 * overwritten content — would have nothing to compare against and wave it through.
 */
export const readCorpus = async (dir: string = CORPUS_DIR): Promise<Corpus | null> => {
    let raw: string
    try {
        raw = await readFile(join(dir, MANIFEST_FILE), 'utf8')
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
    }

    const manifest = JSON.parse(raw) as Manifest
    const chunks: Chunk[] = []
    for (const ref of manifest.chunks) {
        const text = await readFile(join(dir, ref.file), 'utf8')
        if (sha256(text) !== ref.sha256) {
            throw new Error(
                `${ref.file} does not match the hash in ${MANIFEST_FILE}. Either the file was `
                + 'edited, or something rewrote its bytes — check that .gitattributes still '
                + 'marks public/puzzles/** as -text.')
        }
        chunks.push(JSON.parse(text) as Chunk)
    }
    return { manifest, chunks }
}

/** Is a process still running? `kill(pid, 0)` signals nothing; it only asks. */
const processIsAlive = (pid: number): boolean => {
    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        // EPERM means it exists and belongs to someone else, which still counts as alive.
        return (error as NodeJS.ErrnoException).code === 'EPERM'
    }
}

/**
 * Run `body` holding an exclusive lock on the corpus directory.
 *
 * Unique temporary filenames stop two builds overwriting each other's *scratch* files; they
 * do nothing about the actual race, which is two builds committing manifests. A 122-month
 * build can commit and then be replaced by a 121-month one that started earlier and
 * finished later, and the corpus silently goes backwards. Unique names cannot prevent a
 * lost update.
 *
 * `wx` fails if the file exists, atomically, which is the whole mechanism. A lock left by a
 * process that is no longer running is broken automatically — otherwise a crash would need
 * a human before any build could run again — and one held by a live process is reported
 * rather than stolen.
 */
const withLock = async <T>(dir: string, body: () => Promise<T>): Promise<T> => {
    const lock = join(dir, LOCK_FILE)
    const mine = JSON.stringify({ pid: process.pid, at: new Date().toISOString() })

    try {
        await writeFile(lock, mine, { flag: 'wx' })
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error

        const held = await readFile(lock, 'utf8').catch(() => '')
        const pid = Number(JSON.parse(held || '{}')?.pid)
        if (Number.isInteger(pid) && processIsAlive(pid)) {
            throw new Error(
                `another build (pid ${pid}) is writing ${resolve(dir)}. `
                + 'Wait for it to finish, or remove ' + LOCK_FILE + ' if you are sure it is not.')
        }
        // Stale: the holder is gone. Take it over.
        await rm(lock, { force: true })
        await writeFile(lock, mine, { flag: 'wx' })
    }

    try {
        return await body()
    } finally {
        await rm(lock, { force: true })
    }
}

/** Write to a unique temporary name, prove the bytes landed, then rename into place. */
const writeVerified = async (dir: string, name: string, text: string): Promise<void> => {
    const pending = join(dir, tempNameFor(name))
    try {
        await writeFile(pending, text, 'utf8')
        // A short write or a full disk is precisely the failure a rename would otherwise
        // seal in under a name that asserts the content is correct.
        if (await readFile(pending, 'utf8') !== text) {
            throw new Error(`${name} did not survive being written; refusing to commit it`)
        }
        await rename(pending, join(dir, name))
    } catch (error) {
        await rm(pending, { force: true })
        throw error
    }
}

/**
 * Write a corpus, committing it in a single atomic step.
 *
 * The first version did `rm(dir, { recursive: true }); rename(staging, dir)`, which is wrong
 * twice. Between those calls there is no corpus at all, so an interruption — or a rename
 * that fails — leaves nothing readable. And it cannot be fixed by reordering: renaming a
 * directory over a non-empty one fails with `EPERM` on Windows (measured), which is
 * presumably why the delete was there.
 *
 * The content-addressed design has its own transaction, and it is better than a directory
 * swap. A chunk's filename contains the hash of its bytes, so **a new chunk can never
 * collide with a live one** — differing content means a differing name. New chunks are
 * therefore written alongside the old, harming nothing; the manifest is what decides which
 * files constitute the corpus, and replacing one *file* by rename is atomic even on Windows.
 *
 * Every file goes through a unique temporary name and is read back before being renamed to
 * its final one, so a name that asserts a content hash is never created for bytes that do
 * not hash to it. An existing chunk is **re-hashed rather than trusted**: a process killed
 * mid-write used to leave a truncated file under its final name, and the next build skipped
 * it on sight of the filename and committed a manifest pointing at the wreckage — reporting
 * success, with the corruption surfacing only at read time, later, somewhere else.
 *
 * Interrupted at any point before the manifest rename, the old manifest and every chunk it
 * names are still present and still readable. The cost of failing is some unreferenced
 * files, which `orphanFiles` reports and the next successful build removes.
 */
export const writeCorpus = async (corpus: Corpus, dir: string = CORPUS_DIR): Promise<void> => {
    await assertSafeTarget(dir)
    await mkdir(dir, { recursive: true })

    await withLock(dir, async () => {
        const before = await readdir(dir)
        const present = new Set(before)
        const wanted = new Set(corpus.manifest.chunks.map(ref => ref.file))

        for (let i = 0; i < corpus.chunks.length; i++) {
            const ref = corpus.manifest.chunks[i]
            const encoded = encodeChunk(corpus.chunks[i])

            if (present.has(ref.file)) {
                // Verified, not assumed. The filename carries 16 hex of the digest and a
                // name is not evidence about content in any case.
                const existing = await readFile(join(dir, ref.file), 'utf8').catch(() => null)
                if (existing !== null && sha256(existing) === ref.sha256) continue
            }
            await writeVerified(dir, ref.file, encoded)
        }

        await writeVerified(dir, MANIFEST_FILE, `${JSON.stringify(corpus.manifest, null, 2)}\n`)

        /*
         * Committed. Anything the new manifest does not name is now dead, and only now is it
         * safe to remove: until the rename above, those files were the live corpus. This
         * also collects scratch files from a run that died before committing -- they are
         * unreferenced by definition, so they need no separate pass. There used to be one
         * ahead of the writes; mutation-testing showed it could be deleted without changing
         * any outcome, so it was.
         *
         * The lock is excluded: it must outlive the whole critical section, or another
         * writer could acquire it while this one is still finishing.
         */
        for (const name of before) {
            if (name === MANIFEST_FILE || name === LOCK_FILE || wanted.has(name)) continue
            await rm(join(dir, name), { force: true })
        }
    })
}

/**
 * Files in the corpus directory that the manifest does not mention.
 *
 * Worth reporting because a stale chunk is invisible to every other check — nothing reads
 * it, so nothing notices it — and because a leftover temporary is the fingerprint of a build
 * that died before committing.
 */
export const orphanFiles = async (corpus: Corpus, dir: string = CORPUS_DIR): Promise<string[]> => {
    const expected = new Set([MANIFEST_FILE, LOCK_FILE, ...corpus.manifest.chunks.map(ref => ref.file)])
    const present = await readdir(dir)
    return present.filter(name => !expected.has(name))
}

/** Is there a readable corpus here? Used by the failure-injection tests. */
export const corpusIsReadable = async (dir: string = CORPUS_DIR): Promise<boolean> => {
    try {
        return (await readCorpus(dir)) !== null
    } catch {
        return false
    }
}
