// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { PIECE, UNIT, ROCK } from '@/app/dominoFill/Pieces/geometry'
import { renderPieces } from './pieceFixture'
import { boxFamilyLowerBound, closestRoundedRect, deviation, type Point, type Sampling } from './roundedRect'

/**
 * The rock is not a domino (graphics spec P1-2, row 8).
 *
 * §1.4: the rock was the domino's rounded rectangle in grey, and two rocks in a column read
 * as an upright domino. P1-2 asks that its silhouette "deviate from a rounded rectangle by
 * ≥0.05 of the cell at three or more points, asserted from the path". `tests/roundedRect.ts`
 * says how that is read -- against the best-fitting rounded rectangle, at three points of
 * the outline pairwise a quarter of a cell apart along it -- and which of its checks is
 * exhaustive and which is a search.
 *
 * The silhouette is read from the rendered piece layer, as the outline the browser strokes,
 * and measured in cells: every point divided by the cell size it was drawn at.
 */

const BAR = 0.05
const SAMPLING: Sampling = { separation: 0.25, samples: 120 }
const SIZES = [38, 53, 75, 106]

const parse = (raw: string | null): Point[] => {
    const xy = (raw ?? '').trim().split(/[\s,]+/).map(Number)
    return Array.from({ length: xy.length / 2 }, (_, i) => [xy[2 * i], xy[2 * i + 1]] as const)
}

/** The rock as drawn at `cell` px: its polygons, in cells. */
const drawn = (cell: number) => {
    const rock = renderPieces(cell).querySelector('[data-piece="rock"] svg')!
    const scale = Number(rock.getAttribute('width')) / Number(rock.getAttribute('viewBox')!.split(' ')[2])
    const inCells = (el: Element) => parse(el.getAttribute('points')).map(([x, y]) => [x * scale / cell, y * scale / cell] as const)
    const [side, face, ...facets] = [...rock.querySelectorAll('polygon:not([data-outline])')].map(inCells)
    return { outline: inCells(rock.querySelector('[data-outline]')!), side, face, facets, rects: rock.querySelectorAll('rect').length }
}

/** A rounded rectangle as a polygon, `steps` chords to each corner. */
const roundedRect = (x0: number, y0: number, w: number, h: number, r: number, steps = 8): Point[] =>
    ([[x0 + w - r, y0 + r, -90], [x0 + w - r, y0 + h - r, 0], [x0 + r, y0 + h - r, 90], [x0 + r, y0 + r, 180]] as const)
        .flatMap(([cx, cy, from]) => Array.from({ length: steps + 1 }, (_, i) => {
            const t = (from + (90 * i) / steps) * Math.PI / 180
            return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as const
        }))

const turned = (polygon: Point[], angle: number): Point[] => {
    const [cx, cy] = [0.5, 0.5]
    const [c, s] = [Math.cos(angle), Math.sin(angle)]
    return polygon.map(([x, y]) => [cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)] as const)
}

/**
 * The closest rounded rectangle an independent and far heavier search found for this rock:
 * 3,000 random starting rectangles, each refined by a pattern search, with the outline
 * sampled twice as finely (row 8). It stands 0.0757 of a cell off the rock.
 *
 * A search that stops short overstates the rock's deviation, which only makes the rock
 * pass more easily -- and the calibration shapes below cannot see it, since they start
 * close to their answers. This can: the search must come at least as close as the
 * witness. Five iterations per descent come out at 0.083 and forty at 0.077, and fail it;
 * the search as written finds 0.0747. A row that redraws the rock re-derives the witness.
 */
const WITNESS = { cx: 0.5253111362457275, cy: 0.723247194290161, a: 0.47493767738342285,
    b: 0.3782433032989502, k: 0.8005417108535766, turn: -0.34587713544584153 }

/** The rock's old silhouette, and the domino's on one cell: the inset box, with the extrusion. */
const I = PIECE.inset / UNIT
const DOMINO_CELL = roundedRect(I, I, 1 - 2 * I, 1 - 2 * I + PIECE.extrusion / UNIT, PIECE.radius / UNIT)

describe('P1-2: the rock deviates from a rounded rectangle by 0.05 of the cell at three points', () => {
    it('is drawn as polygons, the outline stroking the side\'s own path', () => {
        for (const cell of SIZES) {
            const rock = drawn(cell)
            expect(rock.rects, `${cell}px: a rect left in the rock`).toBe(0)
            expect(rock.side, `${cell}px: side and outline disagree`).toEqual(rock.outline)
            expect(rock.facets, `${cell}px`).toHaveLength(2)
        }
    })

    it('fills the box every piece shares, and its facets stay on its face', () => {
        const { face, facets } = drawn(38)
        const xs = face.map(p => p[0])
        const ys = face.map(p => p[1])
        for (const [value, expected] of [[Math.min(...xs), I], [Math.max(...xs), 1 - I], [Math.min(...ys), I], [Math.max(...ys), 1 - I]]) {
            expect(value).toBeCloseTo(expected, 9)
        }
        // Inside or on the face: winding number for the inside, distance to an edge for "on".
        const onEdge = ([x, y]: Point) => face.some((p, i) => {
            const q = face[(i + 1) % face.length]
            const cross = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
            const within = Math.min(p[0], q[0]) - 1e-9 <= x && x <= Math.max(p[0], q[0]) + 1e-9
                && Math.min(p[1], q[1]) - 1e-9 <= y && y <= Math.max(p[1], q[1]) + 1e-9
            return Math.abs(cross) < 1e-9 && within
        })
        const inside = ([x, y]: Point) => face.reduce((w, p, i) => {
            const q = face[(i + 1) % face.length]
            const cross = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])
            if (p[1] <= y && q[1] > y && cross > 0) return w + 1
            if (p[1] > y && q[1] <= y && cross < 0) return w - 1
            return w
        }, 0) !== 0
        for (const point of facets.flat()) expect(onEdge(point) || inside(point), `facet point ${point}`).toBe(true)
    })

    it('against the rounded rectangle it replaced -- the domino\'s -- by far more than 0.05', () => {
        // Its own silhouette until this row, and a member of the family below: stated on its
        // own because it is the one §1.4 is about.
        const f = deviation(drawn(38).outline, SAMPLING)
        const domino = { cx: 0.5, cy: I + (1 - 2 * I + PIECE.extrusion / UNIT) / 2, a: 0.5 - I,
            b: (1 - 2 * I + PIECE.extrusion / UNIT) / 2, k: (PIECE.radius / UNIT) / (0.5 - I), turn: 0 }
        expect(f(domino)).toBeGreaterThanOrEqual(BAR)
    })

    for (const cell of SIZES) {
        it(`at ${cell}px, against every rounded rectangle on its own bounding box -- exhaustive`, () => {
            const { bound } = boxFamilyLowerBound(drawn(cell).outline, SAMPLING)
            expect(bound).toBeGreaterThanOrEqual(BAR)
        })
    }

    it('against the closest rounded rectangle a search finds, of any size, radius, place or turn', () => {
        // At the phone's cell, the one the art is designed for. The other sizes draw the same
        // shape in cells, which the family check above and tests/pieceGeometry.test.tsx's
        // linear scaling both confirm.
        const outline = drawn(38).outline
        const { deviation: closest } = closestRoundedRect(outline, SAMPLING)
        expect(closest).toBeGreaterThanOrEqual(BAR)
        // And it is really searching: it comes at least as close as the witness does.
        expect(closest).toBeLessThanOrEqual(deviation(outline, SAMPLING)(WITNESS))
    })
})

describe('the search finds what it is for', () => {
    /*
     * The other direction: shapes that are rounded rectangles, or one small feature away
     * from one, must come out under the bar. They are the ways a rock could slide back
     * towards a domino while looking, to a weaker check, like something else -- smaller,
     * moved, turned, or with a spike on it. They start close to their own answers, so they
     * say little about how hard the search looks; `WITNESS` above is for that.
     */
    const shapes: [string, Point[]][] = [
        ['the domino\'s silhouette on one cell', DOMINO_CELL],
        ['a smaller rounded rectangle, off-centre', roundedRect(0.2, 0.3, 0.55, 0.6, 0.1)],
        ['the domino\'s, turned by 20°', turned(DOMINO_CELL, (20 * Math.PI) / 180)],
        // The top edge closes the polygon, from its top-left corner back to the first point.
        ['a rounded rectangle with one spike on top', [
            ...roundedRect(I, 0.2, 1 - 2 * I, 0.8, 0.14), [0.3, 0.2], [0.4, 0.04], [0.5, 0.2],
        ]],
    ]
    for (const [name, polygon] of shapes) {
        it(`${name} is found to be one`, () => {
            expect(closestRoundedRect(polygon, SAMPLING, { stopBelow: BAR }).deviation).toBeLessThan(BAR)
        })
    }

    it('and the exhaustive family check fails the domino too, where the search is not needed', () => {
        expect(boxFamilyLowerBound(DOMINO_CELL, SAMPLING).bound).toBeLessThan(BAR)
    })
})

describe('the rock as the geometry module states it', () => {
    it('is what the layer draws, so the checks above are of the committed shape', () => {
        const toCells = (p: readonly Point[]) => p.map(([x, y]) => [x / UNIT, y / UNIT] as const)
        const rock = drawn(100)
        for (const [name, drawnPoints, stated] of [['outline', rock.outline, ROCK.silhouette], ['face', rock.face, ROCK.face]] as const) {
            expect(drawnPoints.length, name).toBe(stated.length)
            toCells(stated).forEach((p, i) => {
                expect(drawnPoints[i][0], `${name}[${i}]`).toBeCloseTo(p[0], 12)
                expect(drawnPoints[i][1], `${name}[${i}]`).toBeCloseTo(p[1], 12)
            })
        }
    })
})
