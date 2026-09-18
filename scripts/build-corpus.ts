import { gzipSync, brotliCompressSync, constants } from "node:zlib"
import {
    CORPUS_MONTHS, CORPUS_START_MONTH, addMonths, appendOnlyProblems, duplicateDefinitions,
    encodeChunk, generateChunk, manifestFor, monthsBetween, monthOf, unsolvablePuzzles,
    validateCorpus, type Chunk,
} from "./corpus"
import { assertSafeTarget, readCorpus, writeCorpus, CORPUS_DIR } from "./corpus-io"

/**
 * Build the puzzle corpus (spec P1-6, row 18c).
 *
 *     npm run corpus:build            extend the horizon to CORPUS_MONTHS from the start
 *     npm run corpus:build -- --months 3     a short run, for trying things out
 *
 * Nothing is written until the whole corpus has been validated and checked against what is
 * already committed. That order is the point of the script: generation is cheap to redo and
 * a wrong corpus is expensive to notice.
 */

const arg = (name: string): string | null => {
    const at = process.argv.indexOf(`--${name}`)
    return at >= 0 ? process.argv[at + 1] ?? null : null
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MB`

const main = async () => {
    const months = Number(arg('months') ?? CORPUS_MONTHS)
    if (!Number.isInteger(months) || months < 1) {
        throw new RangeError(`--months must be a positive integer, got ${arg('months')}`)
    }
    const dir = arg('out') ?? CORPUS_DIR

    // Before generating, not after: five minutes of work should not be spent discovering
    // that the destination was never writable.
    await assertSafeTarget(dir)

    const previous = await readCorpus(dir)
    if (previous) {
        console.log(`existing corpus: ${previous.manifest.firstDate} to ${previous.manifest.lastDate} `
            + `(${previous.manifest.days} days, ${previous.manifest.chunks.length} chunks)`)
    } else {
        console.log('no existing corpus; building from scratch')
    }

    // Never shorter than what is published. Asking for three months when twelve are already
    // committed is a mistake, not an instruction to delete nine.
    const committed = previous ? monthsBetween(CORPUS_START_MONTH, monthOf(previous.manifest.lastDate)) + 1 : 0
    const total = Math.max(months, committed)
    if (total > months) {
        console.log(`extending to ${total} months instead of ${months}: ${committed} are already published`)
    }

    const started = Date.now()
    const chunks: Chunk[] = []
    // Shared across the whole run and filled in date order, so a puzzle is only ever
    // compared against ones that come before it -- which is what makes re-rolling on a
    // collision reproducible rather than dependent on where the build happened to start.
    const seen = new Set<string>()
    for (let i = 0; i < total; i++) {
        const month = addMonths(CORPUS_START_MONTH, i)
        chunks.push(generateChunk(month, seen))
        if ((i + 1) % 12 === 0 || i === total - 1) {
            const done = i + 1
            const rate = (Date.now() - started) / done
            process.stdout.write(`\r  generated ${done}/${total} months `
                + `(${(rate / 1000).toFixed(2)}s/month, ~${Math.round(rate * (total - done) / 1000)}s left)   `)
        }
    }
    const generationMs = Date.now() - started
    process.stdout.write('\n')
    console.log(`generated in ${(generationMs / 1000).toFixed(1)}s`)

    const manifest = manifestFor(chunks, new Date().toISOString())

    const structural = validateCorpus(manifest, chunks)
    if (structural.length) {
        console.error(`\n${structural.length} structural problems:`)
        for (const problem of structural.slice(0, 20)) console.error(`  ${problem}`)
        process.exitCode = 1
        return
    }
    console.log('structure ok')

    // Belt and braces: generation re-rolls to avoid repeats, and this proves it worked
    // rather than trusting that it did.
    const repeats = duplicateDefinitions(chunks)
    if (repeats.length) {
        console.error(`\n${repeats.length} puzzles repeat an earlier definition:`)
        for (const problem of repeats.slice(0, 20)) console.error(`  ${problem}`)
        process.exitCode = 1
        return
    }
    console.log(`no repeated definitions among ${manifest.puzzles} puzzles`)

    const solverStarted = Date.now()
    let checked = 0
    const unsolvable = unsolvablePuzzles(chunks, () => {
        checked++
        if (checked % 500 === 0) process.stdout.write(`\r  solved ${checked}/${manifest.days} days   `)
    })
    process.stdout.write('\n')
    if (unsolvable.length) {
        console.error(`${unsolvable.length} puzzles are not uniquely solvable:`)
        for (const problem of unsolvable.slice(0, 20)) console.error(`  ${problem}`)
        process.exitCode = 1
        return
    }
    console.log(`every one of ${manifest.puzzles} puzzles verified by the production solver `
        + `in ${((Date.now() - solverStarted) / 1000).toFixed(1)}s`)

    const broken = appendOnlyProblems(previous, { manifest, chunks })
    if (broken.length) {
        console.error(`\nthis build would change ${broken.length} already-published things:`)
        for (const problem of broken.slice(0, 20)) console.error(`  ${problem}`)
        console.error('\nrefusing to write. A published date is a promise.')
        process.exitCode = 1
        return
    }
    console.log(previous ? 'append-only: every published date is unchanged' : 'append-only: nothing published yet')

    await writeCorpus({ manifest, chunks }, dir)

    const encoded = chunks.map(encodeChunk)
    const raw = encoded.reduce((total, text) => total + Buffer.byteLength(text), 0)
    const gzipped = encoded.reduce((total, text) => total + gzipSync(text, { level: 9 }).length, 0)
    const brotli = encoded.reduce((total, text) =>
        total + brotliCompressSync(Buffer.from(text), {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }).length, 0)
    const biggest = encoded.reduce((a, b) => (Buffer.byteLength(b) > Buffer.byteLength(a) ? b : a))
    const biggestBrotli = brotliCompressSync(Buffer.from(biggest), {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length

    console.log(`\nwrote ${dir}`)
    console.log(`  ${manifest.firstDate} to ${manifest.lastDate}`)
    console.log(`  ${manifest.days} days, ${manifest.puzzles} puzzles, ${chunks.length} chunks`)
    console.log(`  on disk (minified)  ${mb(raw)}`)
    console.log(`  gzip                ${mb(gzipped)}`)
    console.log(`  brotli              ${mb(brotli)}`)
    console.log(`  largest chunk       ${kb(Buffer.byteLength(biggest))} raw, ${kb(biggestBrotli)} brotli`)
    console.log(`  generation          ${(generationMs / 1000).toFixed(1)}s`)
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
