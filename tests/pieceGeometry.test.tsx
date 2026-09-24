// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import DominoPieceOne from '@/app/dominoFill/Pieces/DominoPieceOne'
import DominoPieceTwo from '@/app/dominoFill/Pieces/DominoPieceTwo'
import Rock from '@/app/dominoFill/Pieces/Rock'
import { PIECE, UNIT, fraction } from '@/app/dominoFill/Pieces/geometry'
import { readArt } from '@/e2e/artGeometry'
import { renderPieces, sessionAt } from './pieceFixture'

/**
 * The art's geometry, pinned (graphics spec P0-2, row 2; rewritten for P0-6, row 6; values
 * moved by P1-1, row 7).
 *
 * Row 2 pinned the six pixel constants of §1.1 at 38 and 53px, defects included: the
 * divider was 16% of a 38px cell and the pip 42% of it, because every length was a fixed
 * number of pixels on a cell that is 38px on a phone and 106px on a large desktop.
 *
 * Row 6 made the drawing scale with the cell. So the assertions are now about ratios:
 *
 *   - **at 53px the art was exactly what row 2 pinned** -- the cell it was drawn for, where
 *     the spec required baseline 2 to stay pixel-identical;
 *   - **at every other size it was that drawing scaled**, and nothing else: every constant is
 *     the same fraction of the cell at 38, 53, 75 and 106, and every geometric attribute on
 *     the layer is its 53px value times the cell ratio.
 *
 * P1-1 (row 7) then moved the fractions, and moved them here: the written-out values below
 * are its, at a 100px cell where each is its percentage of the cell. The next row to move
 * one has to move it here too. P1-1's bounds themselves are `tests/proportions.test.tsx`.
 *
 * The layer is rendered by `tests/pieceFixture.tsx`, which says why a server render of the
 * whole layer.
 */

const render = renderPieces

/** A pixel length out of a transform, e.g. `translateX(-26px)`. */
const offset = (transform: string, axis: 'X' | 'Y') => {
    const m = new RegExp(`translate${axis}\\((-?[\\d.e+-]+)px\\)`).exec(transform)
    expect(m, `no translate${axis} in "${transform}"`).toBeTruthy()
    return -Number(m![1])
}

/**
 * Every instance of every constant, in CSS px.
 *
 * The six at rest come from `readArt`, the same reader e2e/art.spec.ts runs in the real
 * page. The entry offset is read here, from `motion`'s initial transform: it exists only
 * in this render, and rocks do not enter -- they are part of the puzzle, there before the
 * player is -- so it is the two dominoes' x and y.
 */
const measure = (cell: number) => {
    const host = render(cell)
    const entry = ['one', 'two'].flatMap(kind => {
        const transform = host.querySelector<HTMLElement>(`[data-piece="${kind}"]`)!.style.transform
        return [offset(transform, 'X'), offset(transform, 'Y')]
    })
    return { ...readArt(host), entry }
}

type Constant = Exclude<keyof ReturnType<typeof measure>, 'counts'>

/**
 * §1.1's table, as the drawing now states it.
 *
 * `units` is each constant in the drawing's own units (`UNIT` to a cell); `fraction` is
 * written out, as §1.1's columns were, and is every size's since row 6 -- P1-1's values
 * since row 7 (row 6's were 0.113, 0.151, 0.302, 0.396, 0.302, 0.302 and 0.491, row 2's
 * 53px column). `count` is how many instances the layer draws: three
 * outlines, three rects per piece, one pip on the upright and two on the flat, one divider
 * per domino, one side and one lift per piece, and an x and a y offset for each domino
 * that enters.
 */
const TABLE: Record<Constant, { label: string, count: number, units: number, fraction: number }> = {
    outline: { label: 'outline stroke', count: 3, units: PIECE.outline, fraction: 0.09 },
    radius: { label: 'corner radius', count: 9, units: PIECE.radius, fraction: 0.14 },
    pip: { label: 'pip diameter', count: 3, units: 2 * PIECE.pipRadius, fraction: 0.24 },
    divider: { label: 'divider span', count: 2, units: UNIT - 2 * PIECE.dividerInset, fraction: 0.6 },
    extrusion: { label: 'extrusion depth', count: 3, units: PIECE.extrusion, fraction: 0.14 },
    lift: { label: 'lift out of the cell', count: 3, units: PIECE.extrusion, fraction: 0.14 },
    entry: { label: 'entry offset', count: 4, units: PIECE.entry, fraction: 0.491 },
}

const CONSTANTS = Object.keys(TABLE) as Constant[]

/**
 * P1-1's values at a 100px cell, written out rather than derived, as the fixed point: at
 * 100px each is its percentage of the cell. The entry offset is not P1-1's -- it is row 6's
 * 26/53 of a cell until P1-6 limits it -- and so is not a round number.
 */
const P1_1_AT_100: Record<Constant, number> = {
    outline: 9, radius: 14, pip: 24, divider: 60, extrusion: 14, lift: 14, entry: 2600 / 53,
}

describe(`at 100px, each constant is P1-1's value, as a percentage of the cell`, () => {
    let measured: ReturnType<typeof measure>
    beforeAll(() => { measured = measure(100) })

    for (const name of CONSTANTS) {
        it(`${TABLE[name].label} is ${P1_1_AT_100[name].toFixed(2)}px on every piece`, () => {
            expect(measured.counts).toEqual({ ones: 1, twos: 1, rocks: 1 })
            expect(measured[name]).toHaveLength(TABLE[name].count)
            for (const value of measured[name]) expect(value, TABLE[name].label).toBeCloseTo(P1_1_AT_100[name], 9)
        })
    }
})

describe('at every size, the same fraction of the cell', () => {
    for (const cell of [38, 53, 75, 106]) {
        describe(`at ${cell}px`, () => {
            let measured: ReturnType<typeof measure>
            beforeAll(() => { measured = measure(cell) })

            for (const name of CONSTANTS) {
                const { label, count, units, fraction: f } = TABLE[name]
                it(`${label} is ${f} of the cell on every piece`, () => {
                    expect(measured[name], `${label}: one per instance`).toHaveLength(count)
                    for (const value of measured[name]) {
                        expect(value, label).toBeCloseTo(fraction(units) * cell, 9)
                        // §1.1's own rounding, so the table and this file cannot disagree.
                        expect(Math.round((value / cell) * 1000) / 1000, `${label} / cell`).toBe(f)
                    }
                })
            }
        })
    }

    it('so the swing between the phone and the desktop cap is gone', () => {
        /*
         * Row 2 pinned how badly the fixed constants failed this: 2.79x for most of them
         * between 38 and 106px, and 4.42x the other way for the divider. Each is now the
         * same fraction at both ends.
         */
        const [floor, cap] = [measure(38), measure(106)]
        for (const name of CONSTANTS) {
            const swing = (floor[name][0] / 38) / (cap[name][0] / 106)
            expect(swing, TABLE[name].label).toBeCloseTo(1, 12)
        }
    })
})

/**
 * Every geometric number the layer writes, in CSS px, in document order.
 *
 * Not only the six constants: every rect, line and circle attribute through its piece's
 * scale, each svg's box and lift, each piece's position on the board, and each domino's
 * entry offset -- so a length that stopped scaling is caught whether or not anyone thought
 * to name it.
 */
const everything = (cell: number): { at: string, value: number }[] => {
    const host = render(cell)
    const out: { at: string, value: number }[] = []
    const ATTRIBUTES = ['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r',
        'x1', 'y1', 'x2', 'y2', 'stroke-width']
    for (const piece of host.querySelectorAll<HTMLElement>('[data-piece]')) {
        const name = `${piece.dataset.piece}@${piece.dataset.at}`
        out.push({ at: `${name} top`, value: parseFloat(piece.style.top) })
        out.push({ at: `${name} left`, value: parseFloat(piece.style.left) })
        if (piece.style.transform) {
            out.push({ at: `${name} entry x`, value: offset(piece.style.transform, 'X') })
            out.push({ at: `${name} entry y`, value: offset(piece.style.transform, 'Y') })
        }
        const svg = piece.querySelector('svg')!
        const scale = Number(svg.getAttribute('width')) / Number(svg.getAttribute('viewBox')!.split(' ')[2])
        out.push({ at: `${name} svg width`, value: Number(svg.getAttribute('width')) })
        out.push({ at: `${name} svg height`, value: Number(svg.getAttribute('height')) })
        const lift = /translate:\s*0(?:px)?\s+(-?[\d.e+-]+)px/.exec(svg.getAttribute('style') ?? '')
        out.push({ at: `${name} lift`, value: -Number(lift![1]) })
        svg.querySelectorAll('*').forEach((el, index) => {
            for (const attribute of ATTRIBUTES) {
                const raw = el.getAttribute(attribute)
                if (raw !== null) {
                    out.push({ at: `${name} ${el.tagName}[${index}] ${attribute}`, value: Number(raw) * scale })
                }
            }
        })
    }
    return out
}

describe('a piece takes no SVG props', () => {
    it('so a caller cannot size or style one past pieceBox -- a compile-time check', () => {
        /*
         * Each line must fail to type-check; `tsc --noEmit` in the gate fails on an unused
         * `@ts-expect-error`, so widening a piece's props again breaks the build rather
         * than this test. Never rendered: the check is the compiler's.
         */
        const s = sessionAt(38)
        const attempts = () => [
            // @ts-expect-error -- no width
            <DominoPieceOne key='1' boardsStore={s} width={10} />,
            // @ts-expect-error -- no style
            <DominoPieceTwo key='2' boardsStore={s} style={{ translate: '0 0' }} />,
            // @ts-expect-error -- no className
            <Rock key='3' boardsStore={s} className='-translate-y-4' />,
            // @ts-expect-error -- no viewBox
            <Rock key='4' boardsStore={s} viewBox='0 0 1 1' />,
        ]
        expect(typeof attempts).toBe('function')
    })
})

describe('every geometric attribute scales linearly with the cell', () => {
    const reference = everything(53)

    it('reads enough of the drawing to mean something', () => {
        // Three pieces' positions, boxes and lifts; two entries; and five, five and three
        // rects, lines and circles' worth of attributes. A reader that silently found
        // nothing would make the assertion below vacuous.
        expect(reference.length).toBeGreaterThanOrEqual(80)
        expect(reference.every(r => Number.isFinite(r.value))).toBe(true)
    })

    it('and every svg\'s box has its viewBox\'s proportions, at every size', () => {
        /*
         * The readers above take a piece's scale from its width, so a box whose height
         * disagreed with its viewBox would pass them -- and the browser would fit the drawing
         * into it, squashed or letterboxed. Found by mutation: `pieceBox` without the
         * extrusion in its height still scaled linearly.
         */
        for (const cell of [38, 53, 75, 106]) {
            for (const svg of render(cell).querySelectorAll('svg')) {
                const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number)
                const ratio = Number(svg.getAttribute('height')) / Number(svg.getAttribute('width'))
                expect(ratio, `${cell}px: ${svg.getAttribute('viewBox')}`).toBeCloseTo(h / w, 12)
            }
        }
    })

    for (const cell of [38, 75, 106]) {
        it(`at ${cell}px every number is its 53px value times ${cell}/53`, () => {
            const scaled = everything(cell)
            expect(scaled.map(r => r.at)).toEqual(reference.map(r => r.at))
            for (const [i, { at, value }] of scaled.entries()) {
                expect(value, at).toBeCloseTo(reference[i].value * cell / 53, 9)
            }
        })
    }
})
