// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderPieces } from './pieceFixture'

/**
 * P1-1's bounds, measured from the drawing (graphics spec P1-1, row 7).
 *
 * The spec leaves the values to the row and fixes the bounds, so this asserts the bounds
 * and not the values -- a later retune inside them passes, one outside them does not. Each
 * is measured from the rendered markup of the real piece layer, not read off the geometry
 * module, so it is the picture that is held to them rather than the numbers someone meant.
 * And each is measured at 38, 53, 75 and 106px, the phone floor to the desktop cap: the
 * bounds hold "at every cell size", and a fraction that drifted with the cell would fail at
 * one end.
 *
 * Row 6's art -- today's art until this row, scaled -- failed four of them: the pip was
 * 0.302 of the cell, the extrusion 0.302, the divider 0.47 of the flat tile it crosses,
 * and the flat domino's pips sat 0.05 of the cell from its top edge.
 */

type Rect = { x: number, y: number, w: number, h: number }
type Piece = {
    name: string
    face: Rect
    outline: number
    extrusion: number
    divider: { x1: number, y1: number, x2: number, y2: number, width: number } | null
    pips: { cx: number, cy: number, r: number }[]
}

/** Every piece in the layer, in CSS px: the numbers the browser draws. */
const pieces = (cell: number): Piece[] =>
    [...renderPieces(cell).querySelectorAll<HTMLElement>('[data-piece]')].map(el => {
        const svg = el.querySelector('svg')!
        const scale = Number(svg.getAttribute('width')) / Number(svg.getAttribute('viewBox')!.split(' ')[2])
        const n = (e: Element, a: string) => Number(e.getAttribute(a)) * scale
        /** A rect's box, or a polygon's bounding box (the rock's, since row 8), in px. */
        const box = (e: Element): Rect => {
            if (e.tagName.toLowerCase() === 'rect') return { x: n(e, 'x'), y: n(e, 'y'), w: n(e, 'width'), h: n(e, 'height') }
            const xy = e.getAttribute('points')!.trim().split(/[\s,]+/).map(v => Number(v) * scale)
            const [xs, ys] = [xy.filter((_, i) => i % 2 === 0), xy.filter((_, i) => i % 2 === 1)]
            const [x, y] = [Math.min(...xs), Math.min(...ys)]
            return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
        }
        // Drawing order, as the geometry reader uses: the side, then the face, then the outline.
        const [side, face] = [...svg.querySelectorAll('rect:not([data-outline]), polygon:not([data-outline])')].map(box)
        const line = svg.querySelector('line')
        return {
            name: `${el.dataset.piece}@${el.dataset.at}`,
            face,
            outline: n(svg.querySelector('[data-outline]')!, 'stroke-width'),
            // Bottom to bottom: how far the side shows below the face, for every shape.
            extrusion: (side.y + side.h) - (face.y + face.h),
            divider: line && {
                x1: n(line, 'x1'), y1: n(line, 'y1'), x2: n(line, 'x2'), y2: n(line, 'y2'),
                width: n(line, 'stroke-width'),
            },
            pips: [...svg.querySelectorAll('circle')].map(c => ({ cx: n(c, 'cx'), cy: n(c, 'cy'), r: n(c, 'r') })),
        }
    })

/** From a point to the nearest point of a segment. */
const toSegment = (px: number, py: number, d: NonNullable<Piece['divider']>) => {
    const [dx, dy] = [d.x2 - d.x1, d.y2 - d.y1]
    const t = Math.max(0, Math.min(1, ((px - d.x1) * dx + (py - d.y1) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(px - (d.x1 + t * dx), py - (d.y1 + t * dy))
}

const SIZES = [38, 53, 75, 106]

describe('P1-1: proportions that hold at 38px, and at every size', () => {
    for (const cell of SIZES) {
        describe(`at ${cell}px`, () => {
            // Rendered once per size, inside the tests rather than at collection.
            let drawn: Piece[] | undefined
            const all = () => (drawn ??= pieces(cell))
            const dominoes = () => all().filter(p => p.divider !== null)

            it('draws what it should, or every bound below would pass on nothing', () => {
                expect(all().map(p => p.name)).toEqual(['one@0,0', 'two@0,3', 'rock@3,3'])
                expect(dominoes().flatMap(p => p.pips)).toHaveLength(3)
            })

            it('outline weight is at most 0.12 of the cell', () => {
                for (const p of all()) expect(p.outline / cell, p.name).toBeLessThanOrEqual(0.12)
            })

            it('extrusion depth is 0.10 to 0.18 of the cell', () => {
                for (const p of all()) {
                    expect(p.extrusion / cell, p.name).toBeGreaterThanOrEqual(0.10)
                    expect(p.extrusion / cell, p.name).toBeLessThanOrEqual(0.18)
                }
            })

            it('pip diameter is 0.18 to 0.30 of the cell', () => {
                for (const p of dominoes()) {
                    for (const pip of p.pips) {
                        expect(2 * pip.r / cell, p.name).toBeGreaterThanOrEqual(0.18)
                        expect(2 * pip.r / cell, p.name).toBeLessThanOrEqual(0.30)
                    }
                }
            })

            it('the divider spans at least 0.55 of the tile it crosses', () => {
                /*
                 * "The tile's width" is the side of the tile the divider crosses: the width of
                 * an upright domino, whose divider runs across it, and the height of a flat
                 * one, whose divider runs down it. Measured against the face's full extent,
                 * the stricter of the two ways to read it.
                 */
                for (const p of dominoes()) {
                    const d = p.divider!
                    const across = d.y1 === d.y2
                    const span = across ? Math.abs(d.x2 - d.x1) : Math.abs(d.y2 - d.y1)
                    const tile = across ? p.face.w : p.face.h
                    expect(span / tile, p.name).toBeGreaterThanOrEqual(0.55)
                }
            })

            it('every pip is clear of the divider and of the tile edge by at least 0.06 of the cell', () => {
                /*
                 * Clear means from the pip's edge to the nearest edge of what it must not touch:
                 * the divider's stroke, and the visible face -- inside the outline's stroke on
                 * the three sides that have one, and at the face's own bottom edge, where the
                 * extruded side begins and there is no stroke.
                 */
                for (const p of dominoes()) {
                    const inner = {
                        left: p.face.x + p.outline / 2,
                        right: p.face.x + p.face.w - p.outline / 2,
                        top: p.face.y + p.outline / 2,
                        bottom: p.face.y + p.face.h,
                    }
                    for (const pip of p.pips) {
                        const toDivider = toSegment(pip.cx, pip.cy, p.divider!) - pip.r - p.divider!.width / 2
                        const toEdge = Math.min(pip.cx - inner.left, inner.right - pip.cx,
                            pip.cy - inner.top, inner.bottom - pip.cy) - pip.r
                        expect(toDivider / cell, `${p.name} pip to divider`).toBeGreaterThanOrEqual(0.06)
                        expect(toEdge / cell, `${p.name} pip to tile edge`).toBeGreaterThanOrEqual(0.06)
                    }
                }
            })
        })
    }
})
