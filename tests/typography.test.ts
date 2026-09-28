import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TYPE, roleName } from '@/app/typography'
import { TYPOGRAPHY_CSS_PATH, renderTypographyCss } from '@/scripts/typography-css'
import { stripComments } from './colourAudit'

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

/**
 * Every source file under `app`, comments blanked, as [path, code].
 *
 * Blanked by the palette audit's syntax-aware stripper, not a regex. The regex this used first
 * took any `//` not straight after a colon for a comment, so a bare `//` in JSX text discarded
 * the rest of its line -- and a size declared after it on that line was never read (codex, at
 * row 13's review). A URL's `://` was spared. The syntax tree knows JSX text from a comment.
 */
const sources = (dir = 'app'): [string, string][] =>
    readdirSync(dir).flatMap(name => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return sources(path)
        if (!/\.(tsx?|css)$/.test(name)) return []
        return [[path, stripComments(path, readFileSync(path, 'utf8'))]] as [string, string][]
    })

/** The lines of `code` a pattern finds. */
const hits = (pattern: RegExp, path: string, code: string) =>
    code.split('\n').filter(l => pattern.test(l)).map(l => `${path}: ${l.trim()}`)

/**
 * The `font` shorthand, which sets size, line height and family at once: `font: 13px/16px
 * Arial` in CSS or a style object, `[font:...]` as a Tailwind arbitrary property. It is both a
 * size and a family, so both scans below include it. Missed until row 13's review (codex).
 */
const SHORTHAND = /(?<![-\w])font\s*:/
/** A size or line height declared outside the roles, in any vocabulary the app could use. */
const SIZE = new RegExp([
    /\btext-(xs|sm|base|lg|\d?xl|\[[^\]]+\])(?![\w-])/.source,
    /\bleading-[\w[\].]+/.source,
    /\bfontSize\b|\blineHeight\b/.source,
    /\bfont-size\s*:|\bline-height\s*:/.source,
    SHORTHAND.source,
].join('|'))
/**
 * A family declared anywhere: the utilities, not a theme variable's name; and not
 * `font-family: inherit`, which takes a family away rather than declaring one (the `kbd` rule).
 */
const FAMILY = new RegExp([
    /(?<![-\w])font-(sans|mono|serif|\[)/.source,
    /\bfontFamily\b/.source,
    /\bfont-family\s*:(?!\s*inherit\s*;)/.source,
    SHORTHAND.source,
].join('|'))

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
        for (const bad of ['font-mono', 'font-sans', "font-['Arial']", 'fontFamily', 'font-family: x']) expect(FAMILY.test(bad), bad).toBe(true)
        // The shorthand, in each place it can be written: both a size and a family.
        for (const bad of ['font: 13px/16px Arial;', "style={{ font: '13px Arial' }}", 'className="[font:13px_Arial]"']) {
            expect([SIZE.test(bad), FAMILY.test(bad)], bad).toEqual([true, true])
        }
        for (const fine of ['font-bold', 'font-semibold', 'data-font: x', 'text-body']) expect(SIZE.test(fine), fine).toBe(false)
        expect(FAMILY.test('font-bold')).toBe(false)
        expect(FAMILY.test('--font-sans: var(--font-geist-sans);')).toBe(false)
        expect(FAMILY.test('font-family: inherit;')).toBe(false)
        expect(FAMILY.test('font-family: monospace;')).toBe(true)
    })

    it('and does not mistake a `//` in JSX text for a comment', () => {
        // codex's case: a bare `//` in copy, and a size later on the same line. Bare, because
        // the old regex spared a `//` after a colon, so a URL would not have shown its fault.
        const source = '<p>fish // chips <b className="text-2xl">x</b></p>\n'
        expect(hits(SIZE, 'x.tsx', stripComments('x.tsx', source))).toHaveLength(1)
        // While a real comment is still blanked.
        expect(hits(SIZE, 'x.tsx', stripComments('x.tsx', 'const a = 1 // text-2xl\n'))).toEqual([])
    })

    it('no size or line height anywhere but the roles', () => {
        const found = all.filter(([path]) => !OWNERS.includes(path)).flatMap(([path, code]) => hits(SIZE, path, code))
        expect(found).toEqual([])
    })

    it('and the family once, on the body, as Geist', () => {
        const found = all.flatMap(([path, code]) => hits(FAMILY, path, code))
        // `next/font`'s own property, set on <body>: Tailwind's `--font-sans` was an inline
        // theme entry, never emitted, and `var()` of it fell back to the system face.
        expect(found).toEqual([`${join('app', 'globals.css')}: font-family: var(--font-geist-sans);`])
        expect(readFileSync('app/layout.tsx', 'utf8')).toMatch(/className=\{`\$\{geistSans\.variable\} antialiased`\}/)
        expect(readFileSync('app/layout.tsx', 'utf8')).not.toMatch(/Geist_Mono/)
    })
})
