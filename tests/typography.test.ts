import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { TYPE, WEIGHTS, roleName } from '@/app/typography'
import { TYPOGRAPHY_CSS_PATH, renderTypographyCss } from '@/scripts/typography-css'
import { stripComments } from './colourAudit'

/**
 * Typography as roles (graphics spec P2-1, row 13).
 *
 * `e2e/typography.spec.ts` asserts what the browser computes for every text surface. This
 * pins where that comes from: one table, one generated stylesheet, one declaration of the
 * family, and no size, line height or family declared anywhere else. Since UI row 2, no weight
 * the page doesn't load, either.
 */

describe('the table is the spec\'s', () => {
    it('six roles, each a size, a line height and a weight (UI-SPEC §3.2)', () => {
        // `title` is the spec's seventh, and arrives with the top bar (row 6, §3.2 amended).
        expect(TYPE).toEqual({
            boardLabel: { size: 'var(--label-font)', lineHeight: 1, weight: 900 },
            display: { size: 28, lineHeight: 1.15, weight: 900 },
            clock: { size: 20, lineHeight: 1, weight: 900 },
            control: { size: 16, lineHeight: 1.25, weight: 800 },
            body: { size: 15, lineHeight: 1.45, weight: 600 },
            meta: { size: 13, lineHeight: 1.4, weight: 700 },
        })
    })

    it('in the four weights the page loads, and nothing under 13px', () => {
        expect(WEIGHTS).toEqual([600, 700, 800, 900])
        for (const [role, { size, weight }] of Object.entries(TYPE)) {
            expect(WEIGHTS, role).toContain(weight)
            if (typeof size === 'number') expect(size, role).toBeGreaterThanOrEqual(13)
        }
        // The layout loads exactly those, by the same numbers: one `src` entry each (U12).
        const layout = readFileSync('app/layout.tsx', 'utf8')
        const loaded = [...layout.matchAll(/\{ path: "\.\/fonts\/nunito-latin\.woff2", weight: "(\d+)", style: "normal" \}/g)]
        expect(loaded.map(m => Number(m[1]))).toEqual([...WEIGHTS])
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

    it('sets each role\'s weight with its size, through Tailwind\'s `--font-weight` key', () => {
        const css = renderTypographyCss()
        for (const [role, { weight }] of Object.entries(TYPE)) {
            expect(css).toContain(`  --text-${roleName(role as keyof typeof TYPE)}--font-weight: ${weight};`)
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
 * A weight the page doesn't load (UI row 2): the four utilities under 600, a numeric weight
 * under 600 in a style object or in CSS, or a named `normal` / `lighter`. Nunito has 200-1000,
 * but the page loads 600-900, and a weight between faces draws in the nearest loaded one --
 * so emphasis at 500 would draw at body's 600, and vanish.
 */
const UNLOADED = new RegExp([
    /(?<![-\w])font-(thin|extralight|light|normal|medium|semibold)(?![\w-])/.source,
    /\bfontWeight\s*:\s*['"]?([1-5]\d\d|normal|lighter)\b/.source,
    /\bfont-weight\s*:\s*([1-5]\d\d|normal|lighter)\b/.source,
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
        expect(all.filter(([, code]) => /\btext-(display|clock|body|meta|board-label)\b/.test(code)).length).toBeGreaterThanOrEqual(8)
    })

    it('recognises every vocabulary it is looking for', () => {
        for (const bad of ['text-sm', 'text-2xl', 'text-[13px]', 'leading-none', 'leading-[1.1]', 'style={{ fontSize: 3 }}', 'lineHeight: 1', 'font-size: 12px', 'line-height:1']) {
            expect(SIZE.test(bad), bad).toBe(true)
        }
        for (const fine of ['text-center', 'text-ink', 'text-panel-ink', 'text-problem', 'text-body', 'text-meta', 'text-display', 'text-clock', 'text-board-label']) {
            expect(SIZE.test(fine), fine).toBe(false)
        }
        for (const bad of ['font-mono', 'font-sans', "font-['Arial']", 'fontFamily', 'font-family: x']) expect(FAMILY.test(bad), bad).toBe(true)
        // The shorthand, in each place it can be written: both a size and a family.
        for (const bad of ['font: 13px/16px Arial;', "style={{ font: '13px Arial' }}", 'className="[font:13px_Arial]"']) {
            expect([SIZE.test(bad), FAMILY.test(bad)], bad).toEqual([true, true])
        }
        for (const fine of ['font-bold', 'font-semibold', 'data-font: x', 'text-body']) expect(SIZE.test(fine), fine).toBe(false)
        expect(FAMILY.test('font-bold')).toBe(false)
        expect(FAMILY.test('--font-sans: var(--font-nunito);')).toBe(false)
        expect(FAMILY.test('font-family: inherit;')).toBe(false)
        expect(FAMILY.test('font-family: monospace;')).toBe(true)
    })

    it('recognises a weight the page does not load, in every form', () => {
        for (const bad of ['font-medium', 'font-semibold', 'font-normal', 'font-light', 'font-thin', 'font-extralight',
            'hover:font-medium', "style={{ fontWeight: 500 }}", "fontWeight: '400'", 'font-weight: 500;', 'font-weight:normal']) {
            expect(UNLOADED.test(bad), bad).toBe(true)
        }
        for (const fine of ['font-bold', 'font-extrabold', 'font-black', 'aria-pressed:font-black',
            'fontWeight: 800', 'font-weight: 900;', 'font-medium-ish', '--text-body--font-weight: 600;']) {
            expect(UNLOADED.test(fine), fine).toBe(false)
        }
    })

    it('no weight anywhere that the page does not load', () => {
        expect(all.flatMap(([path, code]) => hits(UNLOADED, path, code))).toEqual([])
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

    it('and the family once, on the body, as Nunito', () => {
        const found = all.flatMap(([path, code]) => hits(FAMILY, path, code))
        // `next/font`'s own property, set on <body>: Tailwind's `--font-sans` was an inline
        // theme entry, never emitted, and `var()` of it fell back to the system face.
        expect(found).toEqual([`${join('app', 'globals.css')}: font-family: var(--font-nunito);`])
        const layout = readFileSync('app/layout.tsx', 'utf8')
        // From the repository since U12. The binding is `Nunito` because Turbopack names the
        // stack after it: `nunito` would make the family lowercase (codex).
        expect(layout).toMatch(/import localFont from "next\/font\/local";/)
        expect(layout).toMatch(/^const Nunito = localFont\(\{$/m)
        expect(layout).toMatch(/variable: "--font-nunito"/)
        expect(layout).toMatch(/className=\{`\$\{Nunito\.variable\} antialiased`\}/)
        // Only the Latin subset's characters, as Google's CSS declared them.
        expect(layout.match(/prop: "unicode-range",\s+value: "([^"]*)"/)?.[1]).toBe(LATIN)
        // Geist is gone, both faces (UI row 2).
        expect(layout).not.toMatch(/Geist/)
    })
})

/** The Latin subset's range, from Google's CSS for Nunito 600-900 (U12). */
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, ' +
    'U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'

/**
 * Muted text is a colour, `inkMuted`, not an opacity (UI row 3). An opacity takes text below
 * 4.5:1 wherever it lands, and nothing checks the result; `inkMuted` is held to 4.5:1 on the
 * ground and the surface by `tests/contrast.test.ts`. A drawing may still be translucent: the
 * drag's wash is, and is allowed by name.
 */
describe('muted text is `inkMuted`, never an opacity', () => {
    const OPACITY = /(?<![-\w])opacity-\d+(?![\w-])/
    const DRAWINGS = [join('app', 'dominoFill', 'Hover.tsx')]

    it('no `opacity-*` utility in `app/` but on a drawing named here', () => {
        const found = sources().filter(([path]) => !DRAWINGS.includes(path))
            .flatMap(([path, code]) => hits(OPACITY, path, code))
        expect(found).toEqual([])
        // And it would see one, however it's written.
        for (const bad of ['opacity-70', 'text-meta opacity-60', 'hover:opacity-80']) expect(OPACITY.test(bad), bad).toBe(true)
        for (const fine of ['text-ink-muted', 'disabled-opacity', 'opacity']) expect(OPACITY.test(fine), fine).toBe(false)
    })

    it('the four texts that were faded are `text-ink-muted`', () => {
        const muted = (file: string, text: string) => {
            const code = readFileSync(file, 'utf8')
            const line = code.split('\n').find(l => l.includes(text))
            return line?.includes('text-ink-muted') ?? `${file}: no line with ${text}`
        }
        expect([
            muted('app/dominoFill/Tutorial.tsx', '<p className="text-meta text-ink-muted">'),
            muted('app/dominoFill/DominoClient.tsx', "<p className='text-meta text-ink-muted'>"),
            muted('app/dominoFill/ChallengeClock.tsx', "isCoveredView(view) ? 'text-ink-muted'"),
            muted('app/visual/Sheet.tsx', "<h2 className='text-meta text-ink-muted'>"),
        ]).toEqual([true, true, true, true])
    })
})

describe('the font is the repository\'s (U12)', () => {
    it('no build fetches it: nothing the build compiles imports `next/font/google`', () => {
        const GOOGLE = /["']next\/font\/google["']/
        const compiled = [...sources(), ['next.config.ts', readFileSync('next.config.ts', 'utf8')] as [string, string]]
        expect(compiled.flatMap(([path, code]) => hits(GOOGLE, path, code))).toEqual([])
        expect(GOOGLE.test('import { Nunito } from "next/font/google";')).toBe(true)
    })

    it('the file is the one Google served, byte for byte', () => {
        // fonts.gstatic.com/s/nunito/v32/XRXV3I6Li01BKofINeaBTMnFcQ.woff2, the Latin file for
        // `css2?family=Nunito:wght@600;700;800;900`, and what `next/font/google` last built with.
        const bytes = readFileSync('app/fonts/nunito-latin.woff2')
        expect(bytes.length).toBe(39152)
        expect(createHash('sha256').update(bytes).digest('hex'))
            .toBe('20fc9b6fc618e7c3c68d3ac750a2a5dfbceb8521675458d2cea580b5693e4798')
        expect(readFileSync('.gitattributes', 'utf8')).toMatch(/^\*\.woff2 binary$/m)
    })

    it('with its licence beside it', () => {
        const licence = readFileSync('app/fonts/OFL.txt', 'utf8')
        expect(licence).toMatch(/^Copyright 2014 The Nunito Project Authors \(https:\/\/github\.com\/googlefonts\/nunito\)/)
        expect(licence).toContain('This Font Software is licensed under the SIL Open Font License, Version 1.1.')
        expect(licence).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007')
    })
})
