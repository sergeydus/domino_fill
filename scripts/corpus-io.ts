import { randomUUID } from "node:crypto"
import { readdir, readFile, mkdir, writeFile, rm, rename, stat } from "node:fs/promises"
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

/** A published chunk: a month, a 16-hex content hash, `.json`. */
const CHUNK_FILE = /^\d{4}-\d{2}\.[0-9a-f]{16}\.json$/

export type Corpus = { manifest: Manifest, chunks: Chunk[] }

/**
 * Refuse to treat a directory as a corpus unless it is one, or is empty.
 *
 * The write path creates and deletes files in this directory, so pointing it at `public`, or
 * at the repository root, must fail *before* anything is generated rather than after. The
 * check is on content rather than on the path, because a rule about paths would still let
 * `--out ./src` through: a directory qualifies only if it is absent, empty, or holds nothing
 * but a manifest and correctly-named chunks.
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

    const strangers = entries.filter(name => name !== MANIFEST_FILE && !CHUNK_FILE.test(name))
    if (strangers.length > 0) {
        throw new Error(
            `${resolve(dir)} is not a corpus directory: it holds ${strangers.length} unrelated `
            + `entr${strangers.length === 1 ? 'y' : 'ies'} (${strangers.slice(0, 3).join(', ')}`
            + `${strangers.length > 3 ? ', …' : ''}). Refusing to write a corpus into it.`)
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

/**
 * Write a corpus, committing it in a single atomic step.
 *
 * The previous version did `rm(dir, { recursive: true }); rename(staging, dir)`, which is
 * wrong twice. Between those two calls there is no corpus at all, so an interruption — or a
 * rename that fails — leaves nothing readable. And it cannot even be fixed by reordering:
 * renaming a directory over a non-empty one fails with `EPERM` on Windows (measured), which
 * is presumably why the delete was there.
 *
 * The content-addressed design has its own transaction, and it is better than a directory
 * swap. A chunk's filename contains the hash of its bytes, so **a new chunk can never
 * collide with a live one** — differing content means a differing name. New chunks are
 * therefore written alongside the old, harming nothing; the manifest is what decides which
 * files constitute the corpus, and replacing one *file* by rename is atomic even on Windows.
 *
 * So the order is: write the new chunks, write the manifest under a unique temporary name,
 * read it back to prove it landed intact, rename it over `index.json` — that rename is the
 * commit — and only then delete the chunks nothing references any more.
 *
 * Interrupted at any point before the rename, the old manifest and every chunk it names are
 * still present and still readable. The cost of failing is some unreferenced files, which
 * `orphanFiles` reports and the next successful build removes.
 */
export const writeCorpus = async (corpus: Corpus, dir: string = CORPUS_DIR): Promise<void> => {
    await assertSafeTarget(dir)
    await mkdir(dir, { recursive: true })

    const previous = await readdir(dir).catch(() => [] as string[])
    const wanted = new Set(corpus.manifest.chunks.map(ref => ref.file))

    for (let i = 0; i < corpus.chunks.length; i++) {
        const ref = corpus.manifest.chunks[i]
        const encoded = encodeChunk(corpus.chunks[i])
        // Already there and correct by construction — the name *is* the hash — so skip it.
        // This is what makes extending the horizon cheap rather than a full rewrite.
        if (previous.includes(ref.file)) continue
        await writeFile(join(dir, ref.file), encoded, 'utf8')
    }

    // Unique, so two builds running at once cannot overwrite each other's half-written
    // manifest and commit a mixture of the two.
    const pending = join(dir, `${MANIFEST_FILE}.${randomUUID()}.tmp`)
    const text = `${JSON.stringify(corpus.manifest, null, 2)}\n`
    try {
        await writeFile(pending, text, 'utf8')
        // Read back before committing. A short write or a full disk is precisely the case
        // that would otherwise be sealed in by the rename.
        if (await readFile(pending, 'utf8') !== text) {
            throw new Error(`${pending} did not survive being written; refusing to commit it`)
        }
        await rename(pending, join(dir, MANIFEST_FILE))
    } catch (error) {
        await rm(pending, { force: true })
        throw error
    }

    // Committed. Anything the new manifest does not name is now dead, and only now is it
    // safe to remove: until the rename above, those files were the live corpus.
    for (const name of previous) {
        if (name === MANIFEST_FILE || wanted.has(name)) continue
        await rm(join(dir, name), { force: true })
    }
}

/**
 * Files in the corpus directory that the manifest does not mention.
 *
 * Worth reporting because a stale chunk is invisible to every other check — nothing reads
 * it, so nothing notices it — and because a leftover `.tmp` is the fingerprint of a build
 * that died before committing.
 */
export const orphanFiles = async (corpus: Corpus, dir: string = CORPUS_DIR): Promise<string[]> => {
    const expected = new Set([MANIFEST_FILE, ...corpus.manifest.chunks.map(ref => ref.file)])
    const present = await readdir(dir)
    return present.filter(name => !expected.has(name))
}

/** Is there a readable corpus here? Used by the failure-injection tests. */
export const corpusIsReadable = async (dir: string = CORPUS_DIR): Promise<boolean> => {
    try {
        await stat(join(dir, MANIFEST_FILE))
        return (await readCorpus(dir)) !== null
    } catch {
        return false
    }
}
