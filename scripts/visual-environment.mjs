// The environment a set of visual baselines was taken in (graphics spec P0-4, row 4).
//
// The baselines are taken on a GitHub-hosted Ubuntu runner, not in a pinned container: this
// project uses no Docker anywhere. Playwright's version -- and with it Chromium's exact build --
// is pinned by the lockfile. The runner image is not: GitHub updates it, and a system library
// or font can change under an unchanged commit. This is the record that makes that visible.
//
//   node scripts/visual-environment.mjs guard   refuse to continue unless on the CI runner
//   node scripts/visual-environment.mjs write   record this environment beside the baselines
//   node scripts/visual-environment.mjs check   compare this environment with the record
//
// `check` never fails the run. The screenshots decide pass or fail; this says, when they
// fail, whether the machine changed as well as the code.

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RECORD = path.join(ROOT, 'visual-tests', '__screenshots__', 'environment.json')

const onRunner = () => process.env.GITHUB_ACTIONS === 'true' && process.platform === 'linux'

const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'))

const run = (command) => {
    try {
        return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
        return null
    }
}

const current = () => {
    const chromium = read('node_modules/playwright-core/browsers.json').browsers
        .find(b => b.name === 'chromium')
    const osRelease = run('grep ^PRETTY_NAME= /etc/os-release')
    const fonts = run('fc-list : family style file | sort')
    return {
        runnerImage: `${process.env.ImageOS ?? '?'} ${process.env.ImageVersion ?? '?'}`,
        os: osRelease ? osRelease.replace(/^PRETTY_NAME="?|"$/g, '') : process.platform,
        playwright: read('node_modules/@playwright/test/package.json').version,
        chromium: `${chromium.browserVersion} (revision ${chromium.revision})`,
        // None of these draws a glyph on the baseline pages -- e2e/fonts.spec.ts proves every
        // one comes from the self-hosted Geist files -- but the set is the cheapest single
        // signal that the image underneath has changed.
        systemFonts: fonts ? createHash('sha256').update(fonts).digest('hex').slice(0, 16) : null,
    }
}

const command = process.argv[2]

if (command === 'guard') {
    if (!onRunner()) {
        console.error(
            'visual:update runs only on the CI runner. Baselines are pixels, and pixels taken on '
            + 'this machine would not be the ones CI compares against. Push a commit whose message '
            + 'contains [visual update] and download the "visual-baselines" artifact instead.')
        process.exit(1)
    }
} else if (command === 'write') {
    fs.mkdirSync(path.dirname(RECORD), { recursive: true })
    fs.writeFileSync(RECORD, JSON.stringify(current(), null, 2) + '\n')
    console.log(`recorded ${path.relative(ROOT, RECORD)}:\n${fs.readFileSync(RECORD, 'utf8')}`)
} else if (command === 'check') {
    const now = current()
    console.log(`this environment:\n${JSON.stringify(now, null, 2)}`)
    // Printed, not recorded or compared: GitHub's pool mixes CPU models, Chromium rasterises
    // in software here, and a CPU-dependent rounding difference is the leading suspect for
    // any instance-to-instance noise. The log is where to correlate it.
    console.log(`cpu: ${run("lscpu | grep '^Model name' | sed 's/^Model name:[[:space:]]*//'") ?? '?'}`)
    if (!fs.existsSync(RECORD)) {
        console.log('::warning::no environment.json beside the baselines')
    } else {
        const then = JSON.parse(fs.readFileSync(RECORD, 'utf8'))
        const changed = Object.keys({ ...then, ...now }).filter(k => then[k] !== now[k])
        for (const key of changed) {
            console.log(`::warning::${key} differs from the baselines' environment: `
                + `was ${JSON.stringify(then[key])}, now ${JSON.stringify(now[key])}`)
        }
        if (changed.length === 0) console.log('same environment as the baselines')
    }
} else {
    console.error(`usage: visual-environment.mjs guard|write|check (got ${command})`)
    process.exit(2)
}
