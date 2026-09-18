import {
    HORIZON_WARNING_MONTHS, lastDateOf, monthOf, monthsBetween, parseDate, validateCorpus,
} from "./corpus"
import { readCorpus, CORPUS_DIR } from "./corpus-io"

/**
 * Fail when the corpus is running out (spec P1-6, row 18c).
 *
 *     npm run corpus:horizon
 *     npm run corpus:horizon -- --today 2035-01-15    (for testing the guard itself)
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

const main = async () => {
    const at = process.argv.indexOf('--today')
    const today = at >= 0 ? process.argv[at + 1] ?? '' : new Date().toISOString().slice(0, 10)
    if (!parseDate(today)) {
        // Otherwise the subtraction yields NaN and the guard reports "NaN months left" while
        // exiting zero, which reads as a pass.
        console.error(`--today must be a real YYYY-MM-DD date, got ${JSON.stringify(today)}`)
        process.exitCode = 1
        return
    }

    const corpus = await readCorpus()
    if (!corpus) {
        console.error(`no corpus at ${CORPUS_DIR}; run \`npm run corpus:build\``)
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
