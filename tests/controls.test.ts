import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { CONTROL, type VariantName } from '@/app/controls'
import { CONTROLS_CSS_PATH, renderControlsCss } from '@/scripts/controls-css'
import { TYPE } from '@/app/typography'
import { CHIP_CELL_PX } from '@/app/dominoFill/Pieces/DominoPieces'
import { WIDE_LAYOUT_QUERY } from '@/app/dominoFill/composition'
import { pieceBox } from '@/app/dominoFill/Pieces/geometry'

/**
 * One control vocabulary (graphics spec P2-2, row 14; raised in UI row 3).
 *
 * `e2e/controlVariants.spec.ts` holds every button on screen to exactly one variant by
 * computed style. This pins where that comes from: one table, one generated stylesheet, and
 * no button in the source that says anything about its own surface, box or states.
 */

describe('the table is the spec\'s', () => {
    it('UI-SPEC §3.3\'s primary, raised and chip, the caution, and the arrows and days until their rows', () => {
        // `round`, `card` and `switch` arrive with their controls (rows 6-8, §12 amended).
        expect(Object.keys(CONTROL)).toEqual(['primary', 'raised', 'caution', 'chip', 'icon', 'day'])
    })

    it('primary: the accent, with `onAccent` text, on a 4px edge in the accent\'s edge', () => {
        expect(CONTROL.primary).toMatchObject({
            surface: 'accent', ink: 'onAccent', edge: { depth: 4, colour: 'accentEdge' }, border: null, press: 'sink',
        })
        // Disabled, it gives the accent up for the raised look, so it doesn't ask to be pressed.
        expect(CONTROL.primary.disabled).toEqual({ surface: CONTROL.raised.surface, ink: CONTROL.raised.ink, opacity: 0.45 })
    })

    it('raised: the surface, on a 3px edge, and held down on the accent when a toggle is on', () => {
        expect(CONTROL.raised).toMatchObject({
            surface: 'surface', ink: 'ink', edge: { depth: 3, colour: 'raisedEdge' }, border: null, press: 'sink',
            pressed: { surface: 'accent', ink: 'onAccent' }, disabled: { opacity: 0.45 },
        })
    })

    it('caution: raised, with its text in `problem` -- the one property between them', () => {
        expect(CONTROL.caution.ink).toBe('problem')
        expect({ ...CONTROL.caution, ink: CONTROL.raised.ink }).toEqual(CONTROL.raised)
    })

    it('chip: raised at radius 8, a ring when chosen, never the accent\'s fill', () => {
        expect(CONTROL.chip).toMatchObject({ surface: 'surface', radius: 8, checked: { ring: 'accentEdge' } })
        // Chosen is not pressed: a chip is one of a radio group, never a toggle.
        expect(CONTROL.chip.pressed).toBeUndefined()
        // A chip is the upright piece's box, extruded side included, plus the padding: 66px on a
        // phone and 78px on the desktop composition. The first chips were 46px, and "tiny".
        const chip = (cell: number) => Math.round(pieceBox(1, 2, cell).height + 2 * CONTROL.chip.padding.y)
        expect([chip(CHIP_CELL_PX.narrow), chip(CHIP_CELL_PX.wide)]).toEqual([66, 78])
    })

    it('the `wide:` variant is the desktop composition\'s query, exactly', () => {
        // A size that follows the layout must switch where the layout does (globals.css).
        const css = readFileSync('app/globals.css', 'utf8')
        const variant = css.match(/@custom-variant wide \(@media (.+)\);/)
        expect(variant?.[1]).toBe(WIDE_LAYOUT_QUERY)
    })

    it('one weight: the `control` role\'s 800, and a day\'s `meta` 700', () => {
        // The primary was 900 over everyone else's 800 until UI row 3, and a pressed toggle 900
        // too; the toggle's depth tells it apart now (UI-SPEC §3.2, amended).
        for (const [name, c] of Object.entries(CONTROL)) expect(c.weight, name).toBe(name === 'day' ? 700 : TYPE.control.weight)
    })

    it('icon: no surface and no padding, in a 48px box', () => {
        expect(CONTROL.icon).toMatchObject({ surface: null, edge: null, ink: null, padding: { x: 0, y: 0 }, min: { width: 48, height: 48 } })
    })

    it('day: its surface is its mark, bordered as it was, 48px tall', () => {
        expect(CONTROL.day.surface).toEqual({ none: 'markNone', started: 'markStarted', partial: 'markPartial', complete: 'markComplete' })
        expect(CONTROL.day).toMatchObject({ border: { width: 1, colour: 'ink' }, edge: null, min: { height: 48 } })
    })

    it('and only a day can be current, ringed in the accent\'s edge', () => {
        const current = Object.entries(CONTROL).filter(([, c]) => 'current' in c).map(([name]) => name)
        expect(current).toEqual(['day'])
        expect(CONTROL.day.current).toEqual({ ring: 'accentEdge' })
    })

    it('the text variants share one box, 48px tall from the `control` role, so a row of them lines up', () => {
        const boxes = (['primary', 'raised', 'caution'] as const).map(v => ({ radius: CONTROL[v].radius, padding: CONTROL[v].padding }))
        expect(new Set(boxes.map(b => JSON.stringify(b))).size).toBe(1)
        const { padding, radius } = CONTROL.raised
        expect(radius).toBe(16)
        expect(TYPE.control.size * TYPE.control.lineHeight + 2 * padding.y).toBe(48)
    })

    it('every control is at least 48px tall, and every one but a day 48px wide (UI-SPEC §3.3)', () => {
        for (const [name, c] of Object.entries(CONTROL)) {
            expect(c.min.height, name).toBeGreaterThanOrEqual(48)
            if (name !== 'day') expect(c.min.width, name).toBeGreaterThanOrEqual(48)
        }
    })

    it('every border fits inside its padding', () => {
        for (const c of Object.values(CONTROL)) {
            const border = c.border?.width ?? 0
            expect(c.padding.x - border).toBeGreaterThanOrEqual(0)
            expect(c.padding.y - border).toBeGreaterThanOrEqual(0)
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
            const hover = css.indexOf(`.control-${v}:hover:where(:enabled:not([aria-pressed="true"]))`)
            const press = css.indexOf(`.control-${v}:not(:disabled):active`)
            if (hover >= 0 && press >= 0) expect(press, v).toBeGreaterThan(hover)
        }
    })

    it('under reduced motion a press doesn\'t move, but a toggle that is on stays down (UI row 3)', () => {
        const css = renderControlsCss()
        for (const v of ['primary', 'raised', 'caution', 'chip'] as const) {
            const block = `  @media (prefers-reduced-motion: reduce) {\n    .control-${v}:not(:disabled):not([aria-pressed="true"]):active {\n      translate: none;\n    }\n  }`
            expect(css, v).toContain(block)
        }
        expect(css).toContain('  .control-raised[aria-pressed="true"] {\n    background-color: var(--accent);\n    color: var(--on-accent);\n    translate: 0 3px;')
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
 * - A `className` the audit can read in full: literal text and `control('...')`, joined by a
 *   template. Any other expression -- a variable, a condition -- could hold
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
                else reading.refused.push(`className: ${e.getText(sf)}`)
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
 * P2-1) stay with the button. `aria-pressed`'s look is the variant's own since UI row 3.
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
        // 20 existing declarations plus the challenge fixture's four test-only controls, and
        // since slice 3a three more: the cover's Start and Try again, and the completion
        // card's Try again for a finish that hasn't saved. "Next board" and "Practice" are
        // the card's existing buttons, relabelled. Since slice 3b, three more: the Results
        // button beside Archive, and the results screen's Share and Close.
        expect(all.length).toBe(30)
        const at = (file: string) => all.filter(button => button.at.replace(/\\/g, '/').startsWith(`${file}:`))
        expect(at('app/visual/challenge/ChallengeFixture.tsx')).toHaveLength(4)
        expect(at('app/dominoFill/ChallengeCover.tsx')).toHaveLength(2)
        expect(at('app/dominoFill/CompletionCard.tsx')).toHaveLength(3)
        expect(at('app/dominoFill/ResultsDialog.tsx')).toHaveLength(2)
        expect(at('app/dominoFill/PageButtons.tsx')).toHaveLength(4)
    })

    it('recognises a button\'s own look, however it is written', () => {
        for (const bad of [
            'bg-accent', 'rounded-md', 'px-3', 'py-1', 'p-1', 'ps-3', 'pe-2', 'border', 'font-semibold',
            'hover:bg-surface/60', 'disabled:opacity-40', 'cursor-pointer', 'enabled:hover:scale-120',
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
        expect(read("<button className={control('raised')} style={{ padding: 13 }}>a</button>"))
            .toEqual({ variants: ['raised'], own: false, refused: ['style'] })
        expect(read("<button className={`${control('raised')} px-[13px]`}>a</button>"))
            .toEqual({ variants: ['raised'], own: true, refused: [] })
        expect(read("<button {...props} className={control('raised')}>a</button>").refused).toEqual(['spread'])
        expect(read('<button className={cls}>a</button>').refused).toEqual(['className'])
        expect(read("<button className={`${control('day')} ${on ? 'ring-2' : ''}`}>a</button>").refused).toEqual(['className'])
        expect(read('<button className="rounded-md border px-3 py-1">a</button>')).toEqual({ variants: [], own: true, refused: [] })
        expect(read('<button>a</button>').refused).toEqual(['no className'])
        expect(read("<button className={`${control('raised')} ${control('primary')}`}>a</button>").variants).toEqual(['raised', 'primary'])
        // `PRESSED` was the one identifier allowed until UI row 3; it's gone, and refused like any.
        expect(read("<button className={`${control('raised')} ${PRESSED} mt-4`}>a</button>").refused).toEqual(['className'])
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

    it('and `aria-pressed`\'s look is the variant\'s alone: no utility anywhere in `app/` draws it', () => {
        /*
         * The accent's fill and, without colour, the toggle's depth (UI row 3); P1-6's ring and
         * weight until then, in utilities. A button's own `aria-pressed:` utility is refused by
         * the audit above; this covers every other element too, so a wrapper can't restyle one.
         */
        const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
            const path = join(dir, name)
            return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : []
        })
        const found = walk('app').filter(f => /aria-pressed:/.test(readFileSync(f, 'utf8')))
        expect(found).toEqual([])
    })
})
