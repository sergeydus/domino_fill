import { randomUUID } from "node:crypto"
import { readdir, readFile, mkdir, stat, writeFile, rm, rename } from "node:fs/promises"
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
/**
 * Held for the duration of a write, so two builds cannot race their commits.
 *
 * A **directory**, not a file, because `mkdir` is the only creation primitive that both
 * fails when the thing exists and leaves nothing observable half-made. See `acquire`.
 */
export const LOCK_FILE = '.corpus-lock'
/** Who holds the lock. Published inside the lock directory once it is completely written. */
export const LOCK_OWNER = 'owner.json'
/**
 * How long a lock carrying no readable owner record is presumed to be mid-acquisition.
 *
 * The gap between creating the directory and publishing the record is one write, one read
 * and one rename, so this is several orders of magnitude more than it needs to be. It is
 * the delay a build pays after a crash in that window, and paying ten seconds occasionally
 * is much cheaper than evicting a live writer.
 */
const LOCK_INIT_GRACE_MS = 10_000

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

/** Who is holding the lock. `token` is unguessable, so ownership can be proved. */
type LockOwner = { pid: number, at: string, token: string }

/**
 * The lock's owner record, or null when there is not a complete and well-formed one.
 *
 * Absent and malformed deliberately collapse to the same answer: both mean "this lock does
 * not say who holds it", and the caller decides what to do about that from its age. The
 * previous version did `JSON.parse(held || '{}')` with no guard, so a half-written record
 * threw out of the acquisition path — a lock nobody held, that nobody could ever break.
 */
const readOwner = async (lock: string): Promise<LockOwner | null> => {
    const raw = await readFile(join(lock, LOCK_OWNER), 'utf8').catch(() => null)
    if (raw === null) return null

    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return null
    }
    const owner = parsed as Partial<LockOwner> | null
    if (!owner || !Number.isInteger(owner.pid) || typeof owner.token !== 'string' || !owner.token) {
        return null
    }
    return owner as LockOwner
}

/**
 * Refuse, or clear a lock whose holder is demonstrably gone.
 *
 * Throws when the lock is live — or too young to judge. Returns only after removing it, or
 * after finding it already released.
 */
const breakIfStale = async (lock: string, dir: string): Promise<void> => {
    const owner = await readOwner(lock)

    if (owner) {
        if (processIsAlive(owner.pid)) {
            throw new Error(
                `another build (pid ${owner.pid}) is writing ${resolve(dir)}. `
                + `Wait for it to finish, or remove ${LOCK_FILE} if you are sure it is not.`)
        }
    } else {
        /*
         * No owner record. Either the holder created the directory microseconds ago and has
         * not published yet, or it died inside that window, or something outside this
         * pipeline made the lock. Nothing in the file distinguishes them; only age does.
         *
         * Assuming "stale" is the dangerous assumption, because it evicts a live writer, so
         * a recent unattributed lock is treated as busy. Waiting is recoverable; two builds
         * committing manifests at once is not.
         */
        const age = await stat(lock).then(info => Date.now() - info.mtimeMs, () => null)
        if (age === null) return   // released while we were looking; the retry will take it
        if (age < LOCK_INIT_GRACE_MS) {
            throw new Error(
                `another build is taking the lock on ${resolve(dir)} (${LOCK_FILE} appeared `
                + `${Math.round(age)}ms ago and has not said who owns it yet). Try again.`)
        }
    }
    await rm(lock, { recursive: true, force: true })
}

/**
 * Take the lock, returning the token that proves it is ours.
 *
 * The mechanism is `mkdir`, which fails with `EEXIST` if the directory exists and is the
 * only creation primitive here that publishes nothing incomplete. This used to be
 * `writeFile(lock, mine, { flag: 'wx' })`, which is exclusive but *not* atomic in the sense
 * that matters: it opens the file and then writes it, and between those two operations the
 * lock exists and is empty. A second build reading it there got `''`, parsed `{}`, found no
 * live pid, concluded the lock was stale and deleted a live holder's lock. Measured from a
 * separate process hammering reads during creation: **7,787 of 22,920 observations saw the
 * lock empty**, so a colliding build stole a live lock about a third of the time.
 *
 * `mkdir` has no such window — but the *owner record* inside it does, so that goes through
 * the same temp-and-rename as every other file, and its absence is judged by age rather
 * than assumed to mean "abandoned". Measured the same way, the replacement showed zero
 * empty and zero malformed records in 173,544 observations across 2,402 acquisitions —
 * only complete or absent, and absence is what the grace period is for.
 */
const acquire = async (dir: string): Promise<{ lock: string, token: string }> => {
    const lock = join(dir, LOCK_FILE)
    /*
     * Unguessable, and the point of it is the *release*: `rm(lock)` on the way out assumes
     * the lock still belongs to us. If ours were removed externally and another build took
     * one, an unconditional remove would evict a writer that has done nothing wrong. A pid
     * is not enough for this — pids are reused, and two runs of the same build script can
     * legitimately share one on different machines.
     */
    const token = randomUUID()
    const mine = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), token })

    // Two passes: take it, or break a dead one and take it. A third failure means somebody
    // else won the race for the lock we just cleared, which is their turn, not an error here.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await mkdir(lock)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
            await breakIfStale(lock, dir)
            continue
        }

        try {
            await writeVerified(lock, LOCK_OWNER, mine)
        } catch (error) {
            // We own the directory but cannot say so; leaving it would block every build
            // until the grace period, and leaving it *silently* would be worse.
            await rm(lock, { recursive: true, force: true })
            throw error
        }
        return { lock, token }
    }
    throw new Error(
        `could not take the lock on ${resolve(dir)}: another build claimed it first. Retry.`)
}

/**
 * Release a lock, but only if it is still the one we took.
 *
 * This narrows the window rather than closing it — the record is read and then the
 * directory is removed, and in between the world could change again. Closing it entirely
 * needs an atomic compare-and-delete, which the filesystem does not offer. What it does buy
 * is that the ordinary failure — our lock removed by hand or by a cleanup script, another
 * build legitimately acquiring one — no longer ends with us deleting that build's lock.
 */
const release = async (lock: string, token: string): Promise<void> => {
    const owner = await readOwner(lock)
    if (owner?.token !== token) return
    await rm(lock, { recursive: true, force: true })
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
 * A lock left by a process that is no longer running is broken automatically — otherwise a
 * crash would need a human before any build could run again — and one held by a live
 * process is reported rather than stolen.
 */
const withLock = async <T>(dir: string, body: () => Promise<T>): Promise<T> => {
    const { lock, token } = await acquire(dir)
    try {
        return await body()
    } finally {
        await release(lock, token)
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
 * swap. A chunk's filename carries 64 bits of its content hash, so **a new chunk is
 * overwhelmingly unlikely to collide with a live one** — differing content almost always
 * means a differing name. (Only almost: 64 bits is collision-*resistant*, not
 * collision-free, and the manifest's full SHA-256 is what the corpus is actually verified
 * against.) New chunks are therefore written alongside the old, harming nothing; the
 * manifest is what decides which files constitute the corpus, and replacing one *file* by
 * rename is atomic even on Windows.
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
         * writer could acquire it while this one is still finishing. It is removed by
         * `release`, and only when it is still ours.
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
