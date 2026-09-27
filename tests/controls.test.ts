import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { CONTROL, type VariantName } from '@/app/controls'
import { CONTROLS_CSS_PATH, renderControlsCss } from '@/scripts/controls-css'

/**
 * One control vocabulary (graphics spec P2-2, row 14).
 *
 * `e2e/controlVariants.spec.ts` holds every button on screen to exactly one variant by
 * computed style. This pins where that comes from: one table, one generated stylesheet, and
 * no button in the source that says anything about its own surface, box or states.
 */

describe('the table is the spec\'s', () => {
    it('five variants, and the archive\'s days', () => {
        expect(Object.keys(CONTROL)).toEqual(['primary', 'secondary', 'caution', 'quiet', 'icon', 'day'])
    })

    it('primary: the accent\'s surface, the strongest weight', () => {
        expect(CONTROL.primary).toMatchObject({ surface: 'accent', weight: 700 })
        const weights = Object.values(CONTROL).map(c => c.weight)
        expect(CONTROL.primary.weight).toBe(Math.max(...weights))
    })

    it('secondary: the neutral surface, and the accent on focus and while pressed', () => {
        expect(CONTROL.secondary).toMatchObject({ surface: 'controlSurface', focus: 'accentEdge', press: { surface: 'accent' } })
    })

    it('caution: `problem` as an edge, not a fill -- on the secondary\'s surface, so the edge is the difference', () => {
        expect(CONTROL.caution.edge).toEqual({ width: 2, colour: 'problem' })
        expect(CONTROL.caution.surface).toBe(CONTROL.secondary.surface)
        // Everything else is the secondary's: the edge is the one named property between them.
        expect(CONTROL.secondary.edge).toBeNull()
        expect({ ...CONTROL.caution, edge: null }).toEqual(CONTROL.secondary)
    })

    it('quiet: bordered, with no surface until the pointer or a press gives it one', () => {
        expect(CONTROL.quiet).toMatchObject({ surface: null, edge: { width: 1 } })
        expect(CONTROL.quiet.hover.surface).toBeDefined()
        expect(CONTROL.quiet.press.surface).toBeDefined()
    })

    it('icon: no surface, no box of its own', () => {
        expect(CONTROL.icon).toMatchObject({ surface: null, edge: null, ink: null, padding: { x: 0, y: 0 } })
    })

    it('day: its surface is its mark', () => {
        expect(CONTROL.day.surface).toEqual({ none: 'markNone', started: 'markStarted', partial: 'markPartial', complete: 'markComplete' })
    })

    it('the text variants share one box, so a row of them lines up', () => {
        const boxes = (['primary', 'secondary', 'caution', 'quiet'] as const).map(v => ({ radius: CONTROL[v].radius, padding: CONTROL[v].padding }))
        expect(new Set(boxes.map(b => JSON.stringify(b))).size).toBe(1)
    })

    it('every edge fits inside its padding', () => {
        for (const c of Object.values(CONTROL)) {
            const edge = c.edge?.width ?? 0
            expect(c.padding.x - edge).toBeGreaterThanOrEqual(0)
            expect(c.padding.y - edge).toBeGreaterThanOrEqual(0)
        }
    })
})

describe('the generated stylesheet is the table', () => {
    it(`${CONTROLS_CSS_PATH} is byte-identical to what \`npm run tokens\` writes`, () => {
        expect(readFileSync(CONTROLS_CSS_PATH, 'utf8')).toBe(renderControlsCss())
    })

    it('is imported by the stylesheet the app loads, and checked out byte for byte', () => {
        expect(readFileSync('app/globals.css', 'utf8')).toMatch(/^@import "\.\/controls\.css";$/m)
        expect(readFileSync('.gitattributes', 'utf8')).toMatch(/^app\/controls\.css -text$/m)
    })

    it('every hover waits for a fine pointer that can hover (P1-6)', () => {
        const css = renderControlsCss()
        const hovers = css.split('\n').filter(l => l.includes(':hover'))
        expect(hovers.length).toBeGreaterThan(0)
        // Each hover selector is the first line of a block opened by the media query.
        const lines = css.split('\n')
        for (const [i, l] of lines.entries()) {
            if (l.includes(':hover')) expect(lines[i - 1].trim()).toBe('@media (hover: hover) and (pointer: fine) {')
        }
    })

    it('a press is written after the hover it ties with, so a pointer pressing shows the press', () => {
        const css = renderControlsCss()
        for (const v of Object.keys(CONTROL) as VariantName[]) {
            const hover = css.indexOf(`.control-${v}:enabled:hover`)
            const press = css.indexOf(`.control-${v}:not(:disabled):active`)
            if (hover >= 0 && press >= 0) expect(press, v).toBeGreaterThan(hover)
        }
    })
})

/**
 * Every `<button>` under `app`, as [where, the text of its `className`].
 *
 * Read from the syntax tree, so a button is a `<button>` element and nothing else is.
 */
const buttonsIn = (dir = 'app'): [string, string | null][] =>
    readdirSync(dir).flatMap(name => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return buttonsIn(path)
        if (!name.endsWith('.tsx')) return []
        return buttonsInSource(path, readFileSync(path, 'utf8'))
    })

const buttonsInSource = (path: string, source: string): [string, string | null][] => {
    const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const out: [string, string | null][] = []
    const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === 'button') {
            const cls = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(sf) === 'className')
            const at = `${path}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`
            out.push([at, cls && ts.isJsxAttribute(cls) && cls.initializer ? cls.initializer.getText(sf) : null])
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
    return out
}

/** The variant a `className` names. */
const variantsIn = (cls: string) => [...cls.matchAll(/\bcontrol\('(\w+)'\)/g)].map(m => m[1])

/**
 * What a variant owns, said on a button instead: a surface, a colour of text, an edge, a
 * radius, padding, a weight, or a state's look. Layout (`mt-4`, `w-full`, `rotate-180`), a
 * text role (`text-meta`, P2-1) and a state that is not the variant's (`aria-pressed`'s
 * `PRESSED`, the archive's current day's ring) stay with the button.
 */
const OWN_LOOK = /(?<![-\w])(?:bg-|text-(?:ink|on-|panel|problem|success|accent)|border|rounded|p[xytrbl]?-\d|font-(?:thin|light|normal|medium|semibold|bold|black)|opacity-|shadow|underline|cursor-|scale-|grayscale|(?:hover|enabled|disabled|active|focus(?:-visible)?):)/

describe('every button is one variant, and says nothing else about its look', () => {
    const all = buttonsIn()

    it('reads the app: every button there is, found', () => {
        // A positive control: a scan that found no buttons would pass everything below.
        expect(all.length).toBe(18)
    })

    it('recognises a button\'s own look', () => {
        for (const bad of ['bg-accent', 'rounded-md', 'px-3', 'py-1', 'p-1', 'border', 'font-semibold', 'hover:bg-panel/60', 'disabled:opacity-40', 'cursor-pointer', 'enabled:hover:scale-120', 'text-on-strong', 'underline']) {
            expect(OWN_LOOK.test(bad), bad).toBe(true)
        }
        for (const fine of ['mt-4', 'w-full', 'rotate-180', 'text-meta', 'ring-2 ring-accent-edge', '${PRESSED}', 'control(\'quiet\')']) {
            expect(OWN_LOOK.test(fine), fine).toBe(false)
        }
    })

    it('and finds a button that has one, or none, or two variants', () => {
        const found = buttonsInSource('x.tsx', [
            '<button className="rounded-md border px-3 py-1">a</button>',
            '<button>b</button>',
            "<button className={`${control('quiet')} ${control('primary')}`}>c</button>",
        ].join('\n'))
        expect(found.map(([, cls]) => cls === null ? null : [variantsIn(cls).length, OWN_LOOK.test(cls)]))
            .toEqual([[0, true], null, [2, false]])
    })

    it('each names exactly one variant that exists', () => {
        const wrong = all.filter(([, cls]) => {
            const named = cls === null ? [] : variantsIn(cls)
            return named.length !== 1 || !(named[0] in CONTROL)
        }).map(([at, cls]) => `${at}: ${cls}`)
        expect(wrong).toEqual([])
    })

    it('and none declares its own surface, box or state', () => {
        const own = all.filter(([, cls]) => cls !== null && OWN_LOOK.test(cls)).map(([at, cls]) => `${at}: ${cls}`)
        expect(own).toEqual([])
    })
})
