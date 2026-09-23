import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { NextConfig } from 'next'

/**
 * The build flag that compiles the component sheet (graphics spec P0-3, row 3).
 *
 * e2e/bundle.spec.ts proves from the bytes that the sheet is absent from production. These
 * are the faster, narrower facts under that: what the flag changes in the config, and what
 * it must leave alone. Each was a measured failure before it was a rule.
 */

const ROOT = path.resolve(__dirname, '..')

/** `next.config.ts` as a build would see it, with the flag set or not. */
const configWith = async (flag: string | undefined): Promise<NextConfig> => {
    vi.resetModules()
    vi.stubEnv('DOMINO_VISUAL_SHEET', flag)
    return (await import('@/next.config')).default
}

const includes = (file: string): string[] =>
    JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')).include

afterEach(() => { vi.unstubAllEnvs() })

describe('without the flag', () => {
    it('the production config is exactly what it was before the sheet existed', async () => {
        // Not merely "no visual extension": the flag's whole contribution spreads away.
        expect(Object.keys(await configWith(undefined))).toEqual(['headers'])
        // Only '1' switches it on; a stray value is not a request.
        expect(Object.keys(await configWith('true'))).toEqual(['headers'])
    })
})

describe('with the flag', () => {
    it('adds the sheet\'s extension, and moves the build and its type-check aside', async () => {
        const config = await configWith('1')
        expect(config.pageExtensions).toEqual(['tsx', 'ts', 'jsx', 'js', 'visual.tsx'])
        // Never where production is served from.
        expect(config.distDir).toBe('.next-visual')
        expect(config.typescript?.tsconfigPath).toBe('tsconfig.visual.json')
    })
})

describe('the sheet build\'s generated types', () => {
    it('are not declared in the tsconfig production and `tsc` use', () => {
        /*
         * Measured: with `.next-visual`'s types in `tsconfig.json`, a leftover sheet build
         * whose route had been renamed failed `tsc --noEmit` and the *production* build,
         * both unable to find `app/visual/page.js`. Stale output from a test-only build
         * must not be able to break the one that ships.
         *
         * Necessary, not sufficient: `next-env.d.ts` imports whichever build's route types
         * came last, and that is a generated file this test cannot see before any build has
         * run. e2e/bundle.spec.ts checks what an ordinary `tsc` actually reads after the
         * suite's builds.
         */
        expect(includes('tsconfig.json').filter(p => p.startsWith('.next-visual'))).toEqual([])
    })

    it('are declared up front for the build that makes them', () => {
        // Undeclared, Next rewrites the tsconfig it builds with -- reformatting all of it.
        const visual = includes('tsconfig.visual.json')
        expect(visual).toEqual(expect.arrayContaining([
            '.next-visual/types/**/*.ts', '.next-visual/dev/types/**/*.ts',
        ]))
        // And it checks the same sources production does: everything but production's own
        // generated types.
        const sources = includes('tsconfig.json').filter(p => !p.startsWith('.next/'))
        expect(visual).toEqual(expect.arrayContaining(sources))
        expect(visual.filter(p => p.startsWith('.next/'))).toEqual([])
    })
})
