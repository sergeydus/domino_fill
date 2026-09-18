import { HORIZON_WARNING_MONTHS, monthsRemaining } from "./corpus"
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
 * This is meant to run on a schedule rather than only on push, since nothing about a commit
 * makes the horizon shrink — time does.
 */

const main = async () => {
    const at = process.argv.indexOf('--today')
    const today = at >= 0 ? process.argv[at + 1] : new Date().toISOString().slice(0, 10)

    const corpus = await readCorpus()
    if (!corpus) {
        console.error(`no corpus at ${CORPUS_DIR}; run \`npm run corpus:build\``)
        process.exitCode = 1
        return
    }

    const remaining = monthsRemaining(corpus.manifest, today)
    const summary = `content reaches ${corpus.manifest.lastDate}; `
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
