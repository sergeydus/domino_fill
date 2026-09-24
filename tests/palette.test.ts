import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { isRead, scanCss, scanText, scanTs, stripComments } from './colourAudit'
import { PALETTE, cssName, rgbBytes, type Token } from '@/app/palette'
import { PALETTE_CSS_PATH, renderPaletteCss } from '@/scripts/palette-css'
import { GROUND } from '@/app/siteMetadata'
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
            expect(css).toContain(`  --${cssName(token)}: ${PALETTE[token]};`)
            expect(css).toContain(`  --color-${cssName(token)}: var(--${cssName(token)});`)
        }
    })

    it('is imported by the stylesheet the app loads', () => {
        expect(readFileSync('app/globals.css', 'utf8')).toMatch(/^@import "\.\/palette\.css";$/m)
    })
})

describe('every kind of consumer reads the token rather than a copy', () => {
    it('the browser chrome and the manifest: siteMetadata.GROUND', () => {
        expect(GROUND).toBe(PALETTE.ground)
    })

    it('the line labels, whose meanings are the palette\'s semantic tokens', () => {
        expect(LABEL_COLORS).toEqual({
            neutral: PALETTE.lineNeutral,
            satisfied: PALETTE.success,
            over: PALETTE.problem,
        })
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
        expect(rgbBytes('ground')).toEqual([0xe8, 0xe7, 0xe7])
        expect(() => rgbBytes('focusRing')).toThrow(/not #rrggbb/)
    })

    it('cssName is the kebab-case Tailwind knows', () => {
        expect(cssName('tileFace')).toBe('tile-face')
        expect(cssName('onTutorialAction')).toBe('on-tutorial-action')
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
        // colours is, as far as the same scanner can tell.
        const inPalette = audit(['app/palette.ts'])
        expect(inPalette.filter(f => f.kind === 'hex').length).toBeGreaterThanOrEqual(20)
        expect(inPalette.filter(f => f.kind === 'colour function').length).toBeGreaterThanOrEqual(10)
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
        for (const clean of ['bg-control-surface', 'text-2xl', 'border-4', 'ring-2',
            'inset-[2px]', 'rounded-[4px]', 'outline-hint', 'bg-on-accent/20', 'transparent',
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
        // Copy with a `//` in it is not a comment, and does not hide the code after it.
        expect(readIn('a.tsx', 'const a = <p>and // or</p>; const y = PALETTE.ghost')).toBe(true)
        expect(readIn('a.tsx', 'const a = <p>// or</p>; const y = PALETTE.ghost')).toBe(true)
    })

    it('whole names only', () => {
        expect(isRead('accent', 'PALETTE.accentEdge')).toBe(false)
        expect(isRead('hint', '<div data-hint />')).toBe(false)
        expect(isRead('accent', 'className="ring-accent-edge"')).toBe(false)
        expect(isRead('accentEdge', 'className="ring-accent-edge"')).toBe(true)
    })
})
