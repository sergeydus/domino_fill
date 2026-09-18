import { readdir, readFile, mkdir, writeFile, rm, rename } from "node:fs/promises"
import { join } from "node:path"
import {
    encodeChunk, sha256, type Chunk, type Manifest,
} from "./corpus"

/**
 * Reading and writing the corpus on disk (spec P1-6, row 18c).
 *
 * Kept apart from `corpus.ts` so the rules are testable without a filesystem, and so the one
 * genuinely delicate operation here — replacing committed assets — sits in a single place.
 */

/**
 * Where the generated assets live.
 *
 * `public/` and not anywhere under `app/`, because the corpus must stay **out of the
 * JavaScript import graph**. Ten megabytes of minified JSON reachable from an `import` would
 * be ten megabytes the bundler has to carry; served as static files, a client fetches one
 * ~9 KB month when it needs it. This is the whole reason the content is chunked at all.
 */
export const CORPUS_DIR = join('public', 'puzzles')
export const MANIFEST_FILE = 'index.json'

export type Corpus = { manifest: Manifest, chunks: Chunk[] }

/** Read the committed corpus, or null when there is not one yet. */
export const readCorpus = async (dir: string = CORPUS_DIR): Promise<Corpus | null> => {
    let raw: string
    try {
        raw = await readFile(join(dir, MANIFEST_FILE), 'utf8')
    } catch {
        return null
    }

    const manifest = JSON.parse(raw) as Manifest
    const chunks: Chunk[] = []
    for (const ref of manifest.chunks) {
        const text = await readFile(join(dir, ref.file), 'utf8')
        if (sha256(text) !== ref.sha256) {
            throw new Error(`${ref.file} does not match the hash in ${MANIFEST_FILE}; the committed corpus is corrupt`)
        }
        chunks.push(JSON.parse(text) as Chunk)
    }
    return { manifest, chunks }
}

/**
 * Write a corpus, then swap it into place.
 *
 * Built in a sibling directory and moved over the target in one `rename`, so an interrupted
 * build cannot leave half a corpus committed — a manifest pointing at chunks that were never
 * written would fail every read afterwards, and the failure would look like corruption
 * rather than like an interrupted build.
 *
 * The caller is expected to have validated first. This function deliberately has no opinion
 * about content; mixing "is it correct" into "write it down" is how a bad corpus gets
 * published by a code path that forgot to ask.
 */
export const writeCorpus = async (corpus: Corpus, dir: string = CORPUS_DIR): Promise<void> => {
    const staging = `${dir}.staging`
    await rm(staging, { recursive: true, force: true })
    await mkdir(staging, { recursive: true })

    for (let i = 0; i < corpus.chunks.length; i++) {
        await writeFile(join(staging, corpus.manifest.chunks[i].file), encodeChunk(corpus.chunks[i]), 'utf8')
    }
    // The manifest last, so even a staging directory is never momentarily inconsistent.
    await writeFile(join(staging, MANIFEST_FILE), `${JSON.stringify(corpus.manifest, null, 2)}\n`, 'utf8')

    await rm(dir, { recursive: true, force: true })
    await rename(staging, dir)
}

/**
 * Files in the corpus directory that the manifest does not mention.
 *
 * Worth reporting because a stale chunk from an older build is invisible to every other
 * check — nothing reads it, so nothing notices it, and it sits in the repository forever.
 */
export const orphanFiles = async (corpus: Corpus, dir: string = CORPUS_DIR): Promise<string[]> => {
    const expected = new Set([MANIFEST_FILE, ...corpus.manifest.chunks.map(ref => ref.file)])
    const present = await readdir(dir)
    return present.filter(name => !expected.has(name))
}
