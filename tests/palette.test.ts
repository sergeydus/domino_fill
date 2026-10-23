import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { isRead, scanCss, scanText, scanTs, stripComments } from './colourAudit'
import { BOARD_TOKENS, PALETTE, PALETTE_DARK, THEMES, cssName, cssVar, rgbBytes, type Token } from '@/app/palette'
import { EXACT_OKLCH, PALETTE_CSS_PATH, declarations, renderPaletteCss } from '@/scripts/palette-css'
import { GROUND, GROUND_DARK } from '@/app/siteMetadata'
import { LABEL_COLORS } from '@/app/dominoFill/lineLabel'

/**
 * The palette is in one place, and every consumer reads it (graphics spec P0-5, row 5).
 *
 * Before this row the game's colours were literals at their use sites, in four
 * vocabularies, and two had already drifted apart. A palette module only helps if nothing
 * goes round it, so most of this file is the audit that says nothing does.
 */

describe('the generated stylesheet is the palette', () => {
    it(`${PALETTE_CSS_PATH} is byte-identical to what \`npm run tokens\` writes`, () => {
        // Byte for byte, as the icons are: a token changed without regenerating fails here
        // rather than shipping a page whose CSS and SVG disagree. `.gitattributes` keeps
        // checkout from turning the file's LF into CRLF underneath this.
        expect(readFileSync(PALETTE_CSS_PATH, 'utf8')).toBe(renderPaletteCss())
    })

    it('declares every token, as a property and as a Tailwind colour', () => {
        const css = renderPaletteCss()
        for (const token of Object.keys(PALETTE) as Token[]) {
            for (const d of declarations(token, PALETTE[token])) expect(css).toContain(`  ${d}`)
            expect(css).toContain(`  --color-${cssName(token)}: var(--${cssName(token)});`)
        }
    })

    it('declares the wash exactly, in channels the build cannot round (UI row 1)', () => {
        // The build rewrites a readable `oklch()` to a rounded `lab()`; a colour built from
        // a variable in the browser it cannot read, so the wash reaches it as written.
        expect(EXACT_OKLCH).toEqual(['candidateWash'])
        expect(declarations('candidateWash', 'oklch(88.2% 0.059 254.128)')).toEqual([
            '--candidate-wash-oklch: 88.2% 0.059 254.128;',
            '--candidate-wash: oklch(var(--candidate-wash-oklch));',
        ])
        expect(declarations('tileFace', '#fff3d6')).toEqual(['--tile-face: #fff3d6;'])
        expect(() => declarations('candidateWash', '#bedbff')).toThrow(/not an OKLCh colour/)
    })

    it('declares every token in each theme\'s block (UI row 1)', () => {
        /*
         * Three blocks of values: light on `:root`; dark for a phone set to dark, unless the
         * player chose light; and dark for a player who chose it. Each declares every token,
         * so no dark block can fall back to a light value for a token it forgot. Read block by
         * block, so a token declared in the wrong one is not counted for the right one.
         */
        const css = renderPaletteCss()
        const block = (opening: string) => {
            const from = css.indexOf(opening)
            expect(from, opening).toBeGreaterThanOrEqual(0)
            return css.slice(from, css.indexOf('}', from))
        }
        const blocks: [string, Readonly<Record<Token, string>>][] = [
            [':root {', PALETTE],
            ['@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {', PALETTE_DARK],
            [':root[data-theme="dark"] {', PALETTE_DARK],
        ]
        for (const [opening, values] of blocks) {
            const declared = [...block(opening).matchAll(/--[a-z-]+: [^;]+;/g)].map(m => m[0])
            expect(declared, opening).toEqual((Object.keys(PALETTE) as Token[]).flatMap(t => declarations(t, values[t])))
        }
    })

    it('is imported by the stylesheet the app loads', () => {
        expect(readFileSync('app/globals.css', 'utf8')).toMatch(/^@import "\.\/palette\.css";$/m)
    })
})

describe('two themes, the same tokens (UI row 1)', () => {
    it('the dark theme has exactly the light theme\'s keys', () => {
        // `tsc` refuses a missing or extra key already; this says so in the suite too.
        expect(Object.keys(PALETTE_DARK).sort()).toEqual(Object.keys(PALETTE).sort())
        expect(Object.keys(THEMES)).toEqual(['light', 'dark'])
        expect([THEMES.light, THEMES.dark]).toEqual([PALETTE, PALETTE_DARK])
    })

    it('the board\'s tokens are equal in both themes, until row 4 gives the board its own', () => {
        expect(BOARD_TOKENS.filter(t => PALETTE_DARK[t] !== PALETTE[t])).toEqual([])
    })

    it('and every other token is the chrome\'s, which the dark theme does change', () => {
        // The positive control for the test above: equal values everywhere would pass it.
        // The scrim is black in both, drawn at 40% over either ground.
        const board = new Set<Token>(BOARD_TOKENS)
        const chrome = (Object.keys(PALETTE) as Token[]).filter(t => !board.has(t))
        expect(chrome.filter(t => PALETTE_DARK[t] === PALETTE[t])).toEqual(['scrim'])
    })
})

describe('every kind of consumer reads the token rather than a copy', () => {
    it('the browser chrome and the manifest: siteMetadata.GROUND, and GROUND_DARK', () => {
        expect(GROUND).toBe(PALETTE.ground)
        expect(GROUND_DARK).toBe(PALETTE_DARK.ground)
    })

    it('the line labels, whose meanings are the palette\'s semantic tokens', () => {
        // As references since UI row 1, so a label follows the theme.
        expect(LABEL_COLORS).toEqual({
            neutral: cssVar('lineNeutral'),
            satisfied: cssVar('success'),
            over: cssVar('problem'),
        })
    })

    it('cssVar is the token\'s custom property, as the browser reads it', () => {
        expect(cssVar('tileFace')).toBe('var(--tile-face)')
        expect(cssVar('refusedCross')).toBe('var(--refused-cross)')
    })

    it('in the app, only siteMetadata imports a theme\'s values', () => {
        /*
         * A component that imports a value, rather than a `cssVar` reference to it, paints the
         * light theme in both (UI row 1). Read from each file's imports: the exports that carry
         * values, under any local name, and a namespace import, which carries them all.
         * `controls.ts` imports the `Token` type, which carries none, and the layout takes its
         * grounds from siteMetadata.
         */
        const VALUES = new Set(['PALETTE', 'PALETTE_DARK', 'THEMES', 'rgbBytes'])
        const importers = walk('app').filter(f => /\.tsx?$/.test(f)).map(f => f.split(path.sep).join('/'))
            .filter(file => importsValues(file, readFileSync(file, 'utf8'), VALUES))
        expect(importers).toEqual(['app/siteMetadata.ts'])
    })

    it('and the check sees every way of importing one', () => {
        const VALUES = new Set(['PALETTE', 'PALETTE_DARK'])
        const sees = (source: string) => importsValues('a.tsx', source, VALUES)
        expect(sees("import { PALETTE } from '../palette'")).toBe(true)
        expect(sees("import { PALETTE_DARK } from '@/app/palette'")).toBe(true)
        expect(sees("import { PALETTE as P } from './palette'")).toBe(true)
        expect(sees("import * as palette from './palette'")).toBe(true)
        expect(sees("import { cssVar, type Token } from './palette'")).toBe(false)
        expect(sees("import type { Token } from './palette'")).toBe(false)
        expect(sees("import { PALETTE } from './paletteNotes'")).toBe(false)
    })

    it('the palette itself depends on nothing, because Node imports it at build time', () => {
        // `scripts/icon.ts` runs under tsx with no bundler: a React or CSS import here would
        // break `npm run icons`, and would stop `npm run tokens` being able to read it.
        const source = ts.createSourceFile('palette.ts', readFileSync('app/palette.ts', 'utf8'),
            ts.ScriptTarget.Latest, true)
        const imports = source.statements.filter(ts.isImportDeclaration)
        expect(imports.map(i => i.getText())).toEqual([])
    })

    it('rgbBytes reads a token as bytes, and refuses one that is not #rrggbb', () => {
        // The ground's bytes, written out: `#fbf3e8` since UI row 3, `#f4f0e8` from P1-3, and
        // `#e8e7e7` before that.
        expect(rgbBytes('ground')).toEqual([0xfb, 0xf3, 0xe8])
        expect(() => rgbBytes('candidateWash')).toThrow(/not #rrggbb/)
    })

    it('cssName is the kebab-case Tailwind knows', () => {
        expect(cssName('tileFace')).toBe('tile-face')
        expect(cssName('raisedEdge')).toBe('raised-edge')
    })
})

// ---- the audit ----------------------------------------------------------------------------


/**
 * The visual source, per the spec: all of `app/`'s TypeScript and CSS, and the scripts that
 * paint. Scoped rather than repository-wide, because content hashes in the corpus and the
 * tests' own fixtures would otherwise be reported as colours.
 */
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
/**
 * Whether a file imports any of `values` from the palette module: by name, renamed, or as a
 * namespace. Type-only imports carry no value and do not count.
 */
const importsValues = (file: string, text: string, values: ReadonlySet<string>) => {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    return source.statements.filter(ts.isImportDeclaration)
        .filter(i => /(^|\/)palette$/.test((i.moduleSpecifier as ts.StringLiteral).text))
        .some(i => {
            if (i.importClause === undefined || i.importClause.isTypeOnly) return false
            const bindings = i.importClause.namedBindings
            if (bindings === undefined) return false
            if (ts.isNamespaceImport(bindings)) return true
            return bindings.elements.some(e => !e.isTypeOnly && values.has((e.propertyName ?? e.name).text))
        })
}

const SCOPE = [
    ...walk('app').filter(f => /\.(tsx?|css)$/.test(f)),
    'scripts/icon.ts',
    'scripts/palette-css.ts',
].map(f => f.split(path.sep).join('/'))

/** The only two files allowed to hold a colour: the palette, and the CSS generated from it. */
const ALLOWED = new Set(['app/palette.ts', PALETTE_CSS_PATH])

const audit = (files: readonly string[]) => files.flatMap(file => {
    const source = readFileSync(file, 'utf8')
    return file.endsWith('.css') ? scanCss(file, source) : scanTs(file, source)
})

describe('no colour outside the palette', () => {
    it('the scope is the visual source, and covers what it claims to', () => {
        // A walk that silently found nothing would pass the audit below vacuously.
        for (const expected of ['app/globals.css', 'app/dominoFill/Pieces/Rock.tsx',
            'app/dominoFill/Archive.tsx', 'app/siteMetadata.ts', 'scripts/icon.ts', 'app/palette.ts']) {
            expect(SCOPE, expected).toContain(expected)
        }
    })

    it('no literal of any vocabulary appears in visual source outside the palette', () => {
        const findings = audit(SCOPE.filter(f => !ALLOWED.has(f)))
        expect(findings.map(f => `${f.file}:${f.line} ${f.kind} ${f.text}`)).toEqual([])
    })

    it('and the palette is not empty of them, or the audit could not see any', () => {
        // The positive control on real source: the one file that is supposed to be full of
        // colours is, as far as the same scanner can tell -- at least one finding for every
        // value the palette holds, of each notation. Counted from the palette rather than
        // written down, since P1-4 folded six `oklch()` blues and reds away and a fixed
        // count said nothing about why it moved.
        const inPalette = audit(['app/palette.ts'])
        const values = Object.values(PALETTE) as string[]
        const hexes = values.filter(v => v.startsWith('#')).length
        const functions = values.filter(v => v.startsWith('oklch(')).length
        expect(hexes + functions, 'every value is one of the two notations').toBe(values.length)
        expect(functions, 'no oklch() left to see').toBeGreaterThan(0)
        expect(inPalette.filter(f => f.kind === 'hex').length).toBeGreaterThanOrEqual(hexes)
        expect(inPalette.filter(f => f.kind === 'colour function').length).toBeGreaterThanOrEqual(functions)
    })

    it('every vocabulary is seen, and nothing that is not a colour is', () => {
        const kinds = (text: string) => scanText(text).map(h => h.kind)
        // The forms the spec names, each one live in this codebase before this row.
        expect(kinds('#419dc8')).toEqual(['hex'])
        expect(kinds('#fff')).toEqual(['hex'])
        expect(kinds('bg-[#419dc8]')).toEqual(['hex'])
        expect(kinds('rgb(1 2 3)')).toEqual(['colour function'])
        expect(kinds('rgba(0,0,0,.5)')).toEqual(['colour function'])
        expect(kinds('hsl(10 20% 30%)')).toEqual(['colour function'])
        expect(kinds('oklch(62% 0.2 260)')).toEqual(['colour function'])
        expect(kinds('black')).toEqual(['named colour'])
        expect(kinds('white')).toEqual(['named colour'])
        expect(kinds('bg-red-700')).toEqual(['Tailwind palette utility'])
        expect(kinds('text-amber-100')).toEqual(['Tailwind palette utility'])
        expect(kinds('hover:bg-white/30')).toEqual(['Tailwind palette utility'])
        expect(kinds('focus-visible:ring-blue-500')).toEqual(['Tailwind palette utility'])
        expect(kinds('outline-black/70')).toEqual(['Tailwind palette utility'])

        // And what must not be reported: tokens, sizes, and the two colourless keywords.
        for (const clean of ['bg-surface', 'text-2xl', 'border-4', 'ring-2',
            'inset-[2px]', 'rounded-[4px]', 'outline-hint', 'bg-surface/60', 'transparent',
            'currentColor', 'none', 'font-bold', 'Hard 8x8', '#main-content']) {
            expect(kinds(clean), clean).toEqual([])
        }
    })

    it('ignores comments, finds strings, and finds byte triples', () => {
        const found = scanTs('x.tsx', [
            '// was #e8e7e7, and black',
            '/* bg-red-700 */',
            'const a = <div className="p-2 bg-white" />',
            'const b = `fill: ${x} #ababab`',
            'const c = [0xe8, 0xe7, 0xe7]',
            'const d = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]',
            'const e = [0, 1]',
        ].join('\n')).map(f => `${f.line} ${f.kind}`)
        expect(found).toEqual(['3 Tailwind palette utility', '4 hex', '5 byte triple'])

        expect(scanCss('x.css', '/* #e8e7e7 */\nbody { color: #171717; }')
            .map(f => `${f.line} ${f.kind}`)).toEqual(['2 hex'])
    })
})

/**
 * What a consumer's source contributes to the token-use check: its code, comments blanked.
 * One function for the real check and the test below, so that test pins the check itself.
 */
const codeOf = (file: string, source: string) => stripComments(file, source)

describe('no token is dead', () => {
    it('every token is read by something', () => {
        /*
         * A palette entry nothing reads is a value that can drift from what it names without
         * anyone noticing -- the same failure as a literal, one step removed. Read in code:
         * comments are stripped first, because a comment naming a token is not a consumer
         * of it (codex, row 5 review: `// PALETTE.ghost` used to count).
         */
        const code = SCOPE.filter(f => !ALLOWED.has(f))
            .map(f => codeOf(f, readFileSync(f, 'utf8'))).join('\n')
        const unread = (Object.keys(PALETTE) as Token[]).filter(token => !isRead(token, code))
        expect(unread).toEqual([])
    })

    it('a token named only in a comment is not read', () => {
        const readIn = (file: string, source: string) => isRead('ghost', codeOf(file, source))
        // Every comment form this codebase uses, each naming the token every way a read can.
        expect(readIn('a.tsx', '// PALETTE.ghost\nconst x = 1')).toBe(false)
        expect(readIn('a.tsx', '/* bg-ghost, var(--ghost) */\nconst x = 1')).toBe(false)
        expect(readIn('a.tsx', 'const x = 1 // trailing PALETTE.ghost')).toBe(false)
        expect(readIn('a.tsx', '/**\n * rgbBytes(\'ghost\')\n */\nexport const x = 1')).toBe(false)
        expect(readIn('a.tsx', 'const a = <div>{/* PALETTE.ghost */}</div>')).toBe(false)
        expect(readIn('a.css', '/* var(--ghost) */\nbody { color: red }')).toBe(false)

        // And the same names in code are reads, comments or not around them.
        expect(readIn('a.tsx', '// leading\nconst x = PALETTE.ghost // trailing')).toBe(true)
        expect(readIn('a.tsx', 'const a = <div className="p-2 bg-ghost/40" />')).toBe(true)
        expect(readIn('a.ts', "const b = rgbBytes('ghost')")).toBe(true)
        expect(readIn('a.css', 'body { color: var(--ghost) }')).toBe(true)
        expect(readIn('a.tsx', "const a = <rect style={{ fill: cssVar('ghost') }} />")).toBe(true)
        expect(readIn('a.tsx', "// cssVar('ghost')\nconst x = 1")).toBe(false)
        expect(readIn('a.tsx', "/* style={{ fill: cssVar('ghost') }} */\nconst x = 1")).toBe(false)
        // Copy with a `//` in it is not a comment, and does not hide the code after it.
        expect(readIn('a.tsx', 'const a = <p>and // or</p>; const y = PALETTE.ghost')).toBe(true)
        expect(readIn('a.tsx', 'const a = <p>// or</p>; const y = PALETTE.ghost')).toBe(true)
    })

    /*
     * UI row 3 retired three tokens for `surface` and `ink`. A utility naming one that's gone
     * still compiles, and Tailwind draws nothing for it, so a missed `bg-panel` would leave a
     * card see-through without an error anywhere. Read as the dead-token check reads, in code.
     */
    it('no source names a retired token (UI row 3)', () => {
        const RETIRED = ['controlSurface', 'panel', 'panelInk']
        expect(RETIRED.filter(t => t in PALETTE)).toEqual([])
        const named = SCOPE.filter(f => !ALLOWED.has(f)).flatMap(f => {
            const code = codeOf(f, readFileSync(f, 'utf8'))
            return RETIRED.filter(t => isRead(t, code)).map(t => `${f}: ${t}`)
        })
        expect(named).toEqual([])
        // And it would see one: the utility, its variable, and the token by name.
        expect(isRead('panel', 'const a = <div className="rounded-xl bg-panel p-4" />')).toBe(true)
        expect(isRead('panelInk', 'const a = <div className="text-panel-ink" />')).toBe(true)
        expect(isRead('controlSurface', '.x { background: var(--control-surface) }')).toBe(true)
    })

    it('whole names only', () => {
        expect(isRead('accent', 'PALETTE.accentEdge')).toBe(false)
        expect(isRead('hint', '<div data-hint />')).toBe(false)
        expect(isRead('accent', 'className="ring-accent-edge"')).toBe(false)
        expect(isRead('accentEdge', 'className="ring-accent-edge"')).toBe(true)
        expect(isRead('accent', "cssVar('accentEdge')")).toBe(false)
        expect(isRead('accentEdge', "cssVar('accentEdge')")).toBe(true)
    })
})
