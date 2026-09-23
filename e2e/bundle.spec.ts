import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { BASE_URL, ROUTES_ENV, VISUAL_URL } from './server'

/**
 * The component sheet is absent from the production build -- proven from the build, not
 * inferred from a status code (graphics spec P0-3, row 3).
 *
 * A 404 says the router declined to serve `/visual`. It says nothing about whether the
 * sheet, its fixtures and everything they import were compiled and shipped anyway, which is
 * exactly what a runtime guard would do. So three things are checked of the build that is
 * served as production, and each is checked of the sheet's own build first, as a positive
 * control: a search that cannot find the sentinel where it *must* be is not evidence of
 * anything when it also fails to find it where it must not.
 *
 *   - the sentinel's bytes, anywhere in the emitted output;
 *   - the route listing `next build` printed, and the route manifest it wrote;
 *   - and the 404, which is necessary and by itself proves nothing.
 */

const ROOT = path.resolve(__dirname, '..')
const SHEET = path.join(ROOT, 'app', 'visual', 'Sheet.tsx')

/**
 * The sentinel, read from its one declaration rather than restated here.
 *
 * Restating it would put a second copy in the repository, and a test that searches for a
 * string it also contains is one refactor away from searching for the wrong one.
 */
const SENTINEL = (() => {
    const match = /export const SHEET_SENTINEL = '([^']+)'/.exec(fs.readFileSync(SHEET, 'utf8'))
    if (!match) throw new Error(`no SHEET_SENTINEL declaration in ${SHEET}`)
    return match[1]
})()

/** Every file under `dir` whose bytes contain the sentinel, as paths relative to it. */
const filesContaining = (dir: string) => {
    const needle = Buffer.from(SENTINEL, 'utf8')
    const found: string[] = []
    const walk = (at: string) => {
        for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
            const full = path.join(at, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (fs.readFileSync(full).includes(needle)) found.push(path.relative(dir, full))
        }
    }
    walk(dir)
    return found
}

const listing = (build: keyof typeof ROUTES_ENV) => {
    const text = process.env[ROUTES_ENV[build]]
    if (!text) throw new Error(`global setup published no ${build} route listing`)
    return text
}

/** The routes a build's manifest maps, as the URL paths they serve. */
const manifestRoutes = (distDir: string) => Object.values(JSON.parse(fs.readFileSync(
    path.join(ROOT, distDir, 'app-path-routes-manifest.json'), 'utf8')) as Record<string, string>)

/** A listing line naming the route, not a line merely containing the text. */
const listsVisual = (text: string) => /^[┌├└]\s+\S+\s+\/visual$/m.test(text)

test('the sentinel is declared in exactly one file in the repository', () => {
    // If it were anywhere else, zero bytes in the build would say less than it claims.
    const grep = spawnSync('git', ['grep', '--untracked', '-l', '-F', SENTINEL], { cwd: ROOT, encoding: 'utf8' })
    expect(grep.stdout.trim().split('\n')).toEqual(['app/visual/Sheet.tsx'])
})

test.describe('the sheet build carries the sheet (positive control)', () => {
    test('its bytes are in the emitted output', () => {
        expect(filesContaining(path.join(ROOT, '.next-visual')).length).toBeGreaterThan(0)
    })

    test('it is listed, and in the manifest', () => {
        expect(listsVisual(listing('visual')), listing('visual')).toBe(true)
        expect(manifestRoutes('.next-visual')).toContain('/visual')
    })

    test('it is served', async ({ request }) => {
        const res = await request.get(`${VISUAL_URL}/visual`)
        expect(res.status()).toBe(200)
        expect(await res.text()).toContain(SENTINEL)
    })
})

/**
 * Every file an ordinary type-check reads, via `tsconfig.json` or another project file.
 *
 * `--listFilesOnly` rather than a look at the configs, because the sheet's types can arrive
 * without being named in any tsconfig: `next-env.d.ts` imports whichever route types the
 * last build wrote, and `tsc` follows it.
 */
const typeChecked = (project: string) => {
    const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
    const res = spawnSync(process.execPath, [tsc, '-p', project, '--listFilesOnly'],
        { cwd: ROOT, encoding: 'utf8' })
    if (res.status !== 0) throw new Error(`tsc -p ${project} failed:\n${res.stdout}\n${res.stderr}`)
    return res.stdout.split(/\r?\n/).filter(Boolean).map(f => path.relative(ROOT, f).replace(/\\/g, '/'))
}

test.describe('the type environment the run leaves behind is production\'s', () => {
    /*
     * The suite builds the sheet and then production, and the order is the fix. Each build
     * points the untracked `next-env.d.ts` at its own route types; production built last
     * leaves it where a developer's next `tsc` expects it. Found in review: with the order
     * reversed, an ordinary `tsc` after an E2E run read `.next-visual/types/routes.d.ts`.
     */
    test('next-env.d.ts imports production\'s route types', () => {
        const env = fs.readFileSync(path.join(ROOT, 'next-env.d.ts'), 'utf8')
        expect(env).toContain('import "./.next/types/routes.d.ts"')
        expect(env).not.toContain('.next-visual')
    })

    test('and an ordinary tsc reads nothing the sheet build generated', () => {
        // Positive control: the listing can see those files, from the config meant to read them.
        expect(typeChecked('tsconfig.visual.json').filter(f => f.startsWith('.next-visual/')))
            .not.toEqual([])
        expect(typeChecked('tsconfig.json').filter(f => f.startsWith('.next-visual/'))).toEqual([])
    })
})

test.describe('the production build does not', () => {
    test('no emitted file contains the sentinel, searched as bytes', () => {
        const found = filesContaining(path.join(ROOT, '.next'))
        expect(found, `the sheet was compiled into production: ${found.join(', ')}`).toEqual([])
    })

    test('the route is not listed and not in the manifest', () => {
        const text = listing('production')
        // The listing is real: it names the page that does ship.
        expect(text).toMatch(/^[┌├└]\s+\S+\s+\/$/m)
        expect(listsVisual(text), text).toBe(false)
        const routes = manifestRoutes('.next')
        expect(routes).toContain('/')
        expect(routes).not.toContain('/visual')
    })

    test('and it 404s -- necessary, and by itself proof of nothing', async ({ request }) => {
        const res = await request.get(`${BASE_URL}/visual`)
        expect(res.status()).toBe(404)
    })
})
