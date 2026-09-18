import { duplicateDefinitions, unsolvablePuzzles, validateCorpus } from "./corpus"
import { orphanFiles, readCorpus, CORPUS_DIR } from "./corpus-io"

/**
 * Verify the committed corpus (spec P1-6, row 18c).
 *
 *     npm run corpus:verify
 *
 * The full sweep: chunk hashes, structure, append-only shape, and every puzzle through the
 * production solver. Thirty thousand boards take long enough that the unit suite checks a
 * deterministic sample instead, so this is the thing that must run before the corpus is
 * trusted — in CI, and after any change to the generator.
 */

const main = async () => {
    const corpus = await readCorpus()
    if (!corpus) {
        console.error(`no corpus at ${CORPUS_DIR}; run \`npm run corpus:build\``)
        process.exitCode = 1
        return
    }

    // `readCorpus` already verified every chunk hash; saying so makes the output honest
    // about what has been checked rather than leaving it implied.
    console.log(`${corpus.manifest.chunks.length} chunk hashes match the manifest`)
    console.log(`${corpus.manifest.firstDate} to ${corpus.manifest.lastDate} `
        + `(${corpus.manifest.days} days, ${corpus.manifest.puzzles} puzzles)`)

    let failed = false
    const report = (label: string, problems: string[]) => {
        if (!problems.length) { console.log(`${label}: ok`); return }
        failed = true
        console.error(`${label}: ${problems.length} problems`)
        for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`)
        if (problems.length > 20) console.error(`  ... and ${problems.length - 20} more`)
    }

    report('structure', validateCorpus(corpus.manifest, corpus.chunks))

    const orphans = await orphanFiles(corpus)
    report('stray files', orphans.map(name => `${name} is not referenced by the manifest`))

    // Structural validity says nothing about repetition: the first corpus built here was
    // entirely valid and still served 314 boards twice.
    report('duplicate definitions', duplicateDefinitions(corpus.chunks))

    const started = Date.now()
    let checked = 0
    const unsolvable = unsolvablePuzzles(corpus.chunks, () => {
        checked++
        if (checked % 500 === 0) process.stdout.write(`\r  solved ${checked}/${corpus.manifest.days} days   `)
    })
    process.stdout.write('\r')
    report(`solver (${corpus.manifest.puzzles} puzzles in ${((Date.now() - started) / 1000).toFixed(1)}s)`, unsolvable)

    if (failed) process.exitCode = 1
    else console.log('\ncorpus verified')
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
