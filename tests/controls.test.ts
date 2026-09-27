import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { CONTROL, type VariantName } from '@/app/controls'
import { CONTROLS_CSS_PATH, renderControlsCss } from '@/scripts/controls-css'
import { PRESSED } from '@/app/dominoFill/controlStates'

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

    it('and only a day can be current, ringed in the accent\'s edge', () => {
        const current = Object.entries(CONTROL).filter(([, c]) => 'current' in c).map(([name]) => name)
        expect(current).toEqual(['day'])
        expect(CONTROL.day.current).toEqual({ ring: 'accentEdge' })
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
 * What the audit reads of one `<button>`: where it is, the variants it names, the literal
 * text of its `className`, and anything about it the audit refuses.
 */
type Reading = { at: string, variants: string[], classes: string, refused: string[] }

/** Every `<button>` under `app`, read from the syntax tree: a `<button>` element and nothing else. */
const buttonsIn = (dir = 'app'): Reading[] =>
    readdirSync(dir).flatMap(name => {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) return buttonsIn(path)
        if (!name.endsWith('.tsx')) return []
        return buttonsInSource(path, readFileSync(path, 'utf8'))
    })

/**
 * The whole element, not only its `className` (codex, at row 14's review: `style={{ padding:
 * 13 }}` was invisible to an audit of the class alone).
 *
 * - No `style` and no spread: either can carry a look, and neither is a class to read.
 * - A `className` the audit can read in full: literal text, `control('...')`, and `PRESSED`,
 *   joined by a template. Any other expression -- a variable, a condition -- could hold
 *   anything, so it is refused rather than guessed at.
 */
const buttonsInSource = (path: string, source: string): Reading[] => {
    const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const out: Reading[] = []
    const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === 'button') {
            const reading: Reading = {
                at: `${path}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`,
                variants: [], classes: '', refused: [],
            }
            const variantOf = (e: ts.Expression) =>
                ts.isCallExpression(e) && e.expression.getText(sf) === 'control'
                    && e.arguments.length === 1 && ts.isStringLiteral(e.arguments[0])
                    ? e.arguments[0].text : null
            const piece = (e: ts.Expression) => {
                const variant = variantOf(e)
                if (variant !== null) reading.variants.push(variant)
                else if (!(ts.isIdentifier(e) && e.text === 'PRESSED')) reading.refused.push(`className: ${e.getText(sf)}`)
            }
            let className = false
            for (const attribute of node.attributes.properties) {
                if (ts.isJsxSpreadAttribute(attribute)) { reading.refused.push(`spread: ${attribute.getText(sf)}`); continue }
                const name = attribute.name.getText(sf)
                if (name === 'style' || name === 'class') { reading.refused.push(`${name}: ${attribute.getText(sf)}`); continue }
                if (name !== 'className') continue
                className = true
                const init = attribute.initializer
                if (init === undefined) continue
                const value = ts.isJsxExpression(init) ? init.expression : init
                if (value === undefined) continue
                if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) reading.classes = value.text
                else if (ts.isTemplateExpression(value)) {
                    reading.classes = [value.head.text, ...value.templateSpans.map(span => span.literal.text)].join(' ')
                    for (const span of value.templateSpans) piece(span.expression)
                } else piece(value)
            }
            if (!className) reading.refused.push('no className')
            out.push(reading)
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
    return out
}

/**
 * What a variant owns, said on a button instead: a surface, a colour of text, an edge, a
 * radius, padding, a weight, a ring or shadow, or a state's look -- in a utility, an
 * arbitrary value (`px-[13px]`, codex at row 14's review) or an arbitrary property
 * (`[padding:13px]`). Layout (`mt-4`, `w-full`, `rotate-180`) and a text role (`text-meta`,
 * P2-1) stay with the button. `aria-pressed`'s look is `PRESSED`, audited on its own below.
 */
const OWN_LOOK = new RegExp('(?<![-\\w])(?:' + [
    'bg-', 'text-(?:ink|on-|panel|problem|success|accent|\\[)', 'border', 'rounded', 'p[xytrblse]?-',
    'font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\\[)',
    'opacity-', 'shadow', 'inset-', 'ring', 'outline', 'underline', 'decoration-', 'cursor-',
    'scale-', 'brightness', 'grayscale', 'filter',
    '(?:hover|enabled|disabled|active|focus(?:-visible|-within)?|aria-[\\w-]+|data-[\\w-]+):',
    '\\[[\\w-]+:',
].join('|') + ')')

describe('every button is one variant, and says nothing else about its look', () => {
    const all = buttonsIn()

    it('reads the app: every button there is, found', () => {
        // A positive control: a scan that found no buttons would pass everything below.
        expect(all.length).toBe(18)
    })

    it('recognises a button\'s own look, however it is written', () => {
        for (const bad of [
            'bg-accent', 'rounded-md', 'px-3', 'py-1', 'p-1', 'ps-3', 'pe-2', 'border', 'font-semibold',
            'hover:bg-panel/60', 'disabled:opacity-40', 'cursor-pointer', 'enabled:hover:scale-120',
            'text-on-strong', 'underline', 'ring-2', 'ring-accent-edge', 'shadow-sm', 'outline-2',
            'aria-pressed:bg-accent',
            // Arbitrary values and properties (codex, row 14 review).
            'px-[13px]', 'p-[2px]', 'rounded-[3px]', 'bg-[#fff]', 'text-[#123]', 'font-[650]',
            '[padding:13px]', '[box-shadow:0_0_0_2px_red]',
        ]) {
            expect(OWN_LOOK.test(bad), bad).toBe(true)
        }
        for (const fine of ['mt-4', 'w-full', 'rotate-180', 'text-meta', 'group', 'sr-only']) {
            expect(OWN_LOOK.test(fine), fine).toBe(false)
        }
    })

    it('and refuses a button it cannot read, or that names no variant, or two', () => {
        const read = (jsx: string) => {
            const [r] = buttonsInSource('x.tsx', jsx)
            return { variants: r.variants, own: OWN_LOOK.test(r.classes), refused: r.refused.map(x => x.split(':')[0]) }
        }
        // codex's two, each alone.
        expect(read("<button className={control('quiet')} style={{ padding: 13 }}>a</button>"))
            .toEqual({ variants: ['quiet'], own: false, refused: ['style'] })
        expect(read("<button className={`${control('quiet')} px-[13px]`}>a</button>"))
            .toEqual({ variants: ['quiet'], own: true, refused: [] })
        expect(read("<button {...props} className={control('quiet')}>a</button>").refused).toEqual(['spread'])
        expect(read('<button className={cls}>a</button>').refused).toEqual(['className'])
        expect(read("<button className={`${control('day')} ${on ? 'ring-2' : ''}`}>a</button>").refused).toEqual(['className'])
        expect(read('<button className="rounded-md border px-3 py-1">a</button>')).toEqual({ variants: [], own: true, refused: [] })
        expect(read('<button>a</button>').refused).toEqual(['no className'])
        expect(read("<button className={`${control('quiet')} ${control('primary')}`}>a</button>").variants).toEqual(['quiet', 'primary'])
        expect(read("<button className={`${control('quiet')} ${PRESSED} mt-4`}>a</button>"))
            .toEqual({ variants: ['quiet'], own: false, refused: [] })
    })

    it('each names exactly one variant that exists', () => {
        const wrong = all.filter(r => r.variants.length !== 1 || !(r.variants[0] in CONTROL))
            .map(r => `${r.at}: ${r.variants.join(', ') || 'none'}`)
        expect(wrong).toEqual([])
    })

    it('and none declares its own surface, box or state, or says anything the audit cannot read', () => {
        const own = all.filter(r => OWN_LOOK.test(r.classes) || r.refused.length > 0)
            .map(r => `${r.at}: "${r.classes}" ${r.refused.join('; ')}`)
        expect(own).toEqual([])
    })

    it('and `aria-pressed`\'s look, which every toggle shares, is exactly P1-6\'s toggle and no more', () => {
        /*
         * The accent's fill, and without colour a bolder weight and a ring (P1-6) -- nothing
         * else. Not "anything prefixed `aria-pressed:`": codex, at row 14's review, appended
         * `aria-pressed:p-8`, which passed that and gave every pressed toggle a box of its
         * own. `e2e/controlVariants.spec.ts` holds the same in the browser.
         */
        expect(PRESSED.split(/\s+/).sort()).toEqual([
            'aria-pressed:bg-accent', 'aria-pressed:font-bold', 'aria-pressed:ring-2', 'aria-pressed:ring-accent-edge',
        ])
    })
})
