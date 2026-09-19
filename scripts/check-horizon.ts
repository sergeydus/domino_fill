import {
    HORIZON_WARNING_MONTHS, lastDateOf, monthOf, monthsBetween, parseDate, validateCorpus,
} from "./corpus"
import { readCorpus, CORPUS_DIR } from "./corpus-io"

/**
 * Fail when the corpus is running out (spec P1-6, row 18c).
 *
 *     npm run corpus:horizon
 *     npm run corpus:horizon -- --today 2035-01-15    (for testing the guard itself)
 *     npm run corpus:horizon -- --dir <path>          (ditto, against a fixture)
 *
 * **Measured from the last indexed date, not from a count of files.** A count cannot tell
 * you anything: a hundred and twenty chunks are ten years of runway on the day they are
 * built and none at all ten years later. The question is only ever "how far ahead of today
 * does the content reach", and that is a date subtraction.
 *
 * And the date is taken from the **chunks**, not from the manifest's summary of them. This
 * used to read `manifest.lastDate` directly. `readCorpus` verifies every chunk's hash, but
 * nothing tied that field to the chunks — so editing one line of `index.json` to a later
 * date would have satisfied the guard for years without a single extra puzzle existing. A
 * guard that can be silenced by editing the thing it is guarding is not a guard.
 */

const arg = (name: string): string | null => {
    const at = process.argv.indexOf(`--${name}`)
    return at >= 0 ? process.argv[at + 1] ?? '' : null
}

const main = async () => {
    const today = arg('today') ?? new Date().toISOString().slice(0, 10)
    // So the guard can be exercised end-to-end against a fixture. A test that edited the
    // committed manifest in place -- which this one used to -- can leave the repository
    // corrupted if its worker is killed, and any test running in parallel sees the tampered
    // file in the meantime.
    const dir = arg('dir') ?? CORPUS_DIR
    if (!parseDate(today)) {
        // Otherwise the subtraction yields NaN and the guard reports "NaN months left" while
        // exiting zero, which reads as a pass.
        console.error(`--today must be a real YYYY-MM-DD date, got ${JSON.stringify(today)}`)
        process.exitCode = 1
        return
    }

    const corpus = await readCorpus(dir)
    if (!corpus) {
        console.error(`no corpus at ${dir}; run \`npm run corpus:build\``)
        process.exitCode = 1
        return
    }

    // Structure before arithmetic. There is no sense reporting how much runway a corpus has
    // if its manifest does not describe the chunks underneath it.
    const problems = validateCorpus(corpus.manifest, corpus.chunks)
    if (problems.length) {
        console.error(`the corpus does not validate; ${problems.length} problems:`)
        for (const problem of problems.slice(0, 10)) console.error(`  ${problem}`)
        process.exitCode = 1
        return
    }

    const lastDate = lastDateOf(corpus.chunks)
    if (!lastDate) {
        console.error('the corpus contains no days at all')
        process.exitCode = 1
        return
    }

    const remaining = monthsBetween(monthOf(today), monthOf(lastDate))
    const summary = `content reaches ${lastDate}; `
        + `${remaining} month${remaining === 1 ? '' : 's'} left as of ${today}`

    if (remaining < HORIZON_WARNING_MONTHS) {
        console.error(`${summary} — fewer than ${HORIZON_WARNING_MONTHS}.`)
        console.error('Run `npm run corpus:build` to extend the horizon, then commit the new chunks.')
        process.exitCode = 1
        return
    }
    console.log(summary)
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
