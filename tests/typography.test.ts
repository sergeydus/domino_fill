import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TYPE, roleName } from '@/app/typography'
import { TYPOGRAPHY_CSS_PATH, renderTypographyCss } from '@/scripts/typography-css'

/**
 * Typography as roles (graphics spec P2-1, row 13).
 *
 * `e2e/typography.spec.ts` asserts what the browser computes for every text surface. This
 * pins where that comes from: one table, one generated stylesheet, one declaration of the
 * family, and no size, line height or family declared anywhere else.
 */

describe('the table is the spec\'s', () => {
    it('five roles, each a size and a line height', () => {
        expect(TYPE).toEqual({
            boardLabel: { size: 'var(--label-font)', lineHeight: 1 },
            cardTitle: { size: 24, lineHeight: 1.25 },
            control: { size: 16, lineHeight: 1.25 },
            body: { size: 14, lineHeight: 1.5 },
            meta: { size: 12, lineHeight: 1.5 },
        })
    })
})

describe('the generated stylesheet is the table', () => {
    it(`${TYPOGRAPHY_CSS_PATH} is byte-identical to what \`npm run tokens\` writes`, () => {
        expect(readFileSync(TYPOGRAPHY_CSS_PATH, 'utf8')).toBe(renderTypographyCss())
    })

    it('clears Tailwind\'s own scale before declaring the roles, so no other size exists', () => {
        const css = renderTypographyCss()
        const cleared = css.indexOf('--text-*: initial;')
        expect(cleared).toBeGreaterThan(-1)
        for (const role of Object.keys(TYPE) as (keyof typeof TYPE)[]) {
            expect(css.indexOf(`--text-${roleName(role)}:`), role).toBeGreaterThan(cleared)
        }
    })

    it('is imported by the stylesheet the app loads, and checked out byte for byte', () => {
        expect(readFileSync('app/globals.css', 'utf8')).toMatch(/^@import "\.\/typography\.css";$/m)
        expect(readFileSync('.gitattributes', 'utf8')).toMatch(/^app\/typography\.css -text$/m)
    })
})

/** Every source file under `app`, comments stripped, as [path, code]. */
const sources = (dir = 'app'): [string, string][] =>
    readdirSync(dir).flatMap(name => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return sources(path)
        if (!/\.(tsx?|css)$/.test(name)) return []
        return [[path, readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1')]] as [string, string][]
    })

/** A size or line height declared outside the roles, in any vocabulary the app could use. */
const SIZE = /\btext-(xs|sm|base|lg|\d?xl|\[[^\]]+\])(?![\w-])|\bleading-[\w[\].]+|\bfontSize\b|\blineHeight\b|\bfont-size\s*:|\bline-height\s*:/
/**
 * A family declared anywhere: the utilities, not a theme variable's name; and not
 * `font-family: inherit`, which takes a family away rather than declaring one (the `kbd` rule).
 */
const FAMILY = /(?<![-\w])font-(sans|mono|serif)\b|\bfontFamily\b|\bfont-family\s*:(?!\s*inherit\s*;)/

describe('no size, line height or family is declared outside the table', () => {
    const all = sources()
    // The table and its generated stylesheet are where roles are declared.
    const OWNERS = [join('app', 'typography.ts'), join('app', 'typography.css')]

    it('reads the app: the files that set text are among those read', () => {
        // A positive control: a scan that found nothing would pass everything below.
        expect(all.filter(([, code]) => /\btext-(card-title|body|meta|board-label)\b/.test(code)).length).toBeGreaterThanOrEqual(8)
    })

    it('recognises every vocabulary it is looking for', () => {
        for (const bad of ['text-sm', 'text-2xl', 'text-[13px]', 'leading-none', 'leading-[1.1]', 'style={{ fontSize: 3 }}', 'lineHeight: 1', 'font-size: 12px', 'line-height:1']) {
            expect(SIZE.test(bad), bad).toBe(true)
        }
        for (const fine of ['text-center', 'text-ink', 'text-panel-ink', 'text-problem', 'text-body', 'text-meta', 'text-card-title', 'text-board-label']) {
            expect(SIZE.test(fine), fine).toBe(false)
        }
        for (const bad of ['font-mono', 'font-sans', 'fontFamily', 'font-family: x']) expect(FAMILY.test(bad), bad).toBe(true)
        expect(FAMILY.test('font-bold')).toBe(false)
        expect(FAMILY.test('--font-sans: var(--font-geist-sans);')).toBe(false)
        expect(FAMILY.test('font-family: inherit;')).toBe(false)
        expect(FAMILY.test('font-family: monospace;')).toBe(true)
    })

    it('no size or line height anywhere but the roles', () => {
        const found = all.filter(([path]) => !OWNERS.includes(path))
            .flatMap(([path, code]) => code.split('\n').filter(l => SIZE.test(l)).map(l => `${path}: ${l.trim()}`))
        expect(found).toEqual([])
    })

    it('and the family once, on the body, as Geist', () => {
        const found = all.flatMap(([path, code]) => code.split('\n').filter(l => FAMILY.test(l)).map(l => `${path}: ${l.trim()}`))
        // `next/font`'s own property, set on <body>: Tailwind's `--font-sans` was an inline
        // theme entry, never emitted, and `var()` of it fell back to the system face.
        expect(found).toEqual([`${join('app', 'globals.css')}: font-family: var(--font-geist-sans);`])
        expect(readFileSync('app/layout.tsx', 'utf8')).toMatch(/className=\{`\$\{geistSans\.variable\} antialiased`\}/)
        expect(readFileSync('app/layout.tsx', 'utf8')).not.toMatch(/Geist_Mono/)
    })
})
