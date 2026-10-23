// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { PIECE, UNIT, SKINS, type Skin } from '@/app/dominoFill/Pieces/geometry'
import Obstacle from '@/app/dominoFill/Pieces/Obstacle'
import { renderPieces, sessionAt } from './pieceFixture'
import { boxFamilyLowerBound, closestRoundedRect, deviation, type Point, type RoundedRect, type Sampling } from './roundedRect'

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
 * The silhouette is read from the rendered obstacle, as the rim the browser strokes, and
 * measured in cells: every point divided by the cell size it was drawn at.
 *
 * **Every skin** (UI-SPEC §4.4, UI row 4): what any obstacle skin must meet includes never
 * reading as a domino, so every check here runs for every skin in `SKINS`, each against a
 * reference fit found for its own silhouette. The rock is the only skin today.
 */

const BAR = 0.05
const SAMPLING: Sampling = { separation: 0.25, samples: 120 }
const SIZES = [38, 53, 75, 106]

const parse = (raw: string | null): Point[] => {
    const xy = (raw ?? '').trim().split(/[\s,]+/).map(Number)
    return Array.from({ length: xy.length / 2 }, (_, i) => [xy[2 * i], xy[2 * i + 1]] as const)
}

const SKIN_NAMES = Object.keys(SKINS) as Skin[]

/** A skin as drawn at `cell` px: its polygons, in cells. */
const drawn = (skin: Skin, cell: number) => {
    const host = document.createElement('div')
    host.innerHTML = renderToString(<Obstacle boardsStore={sessionAt(cell)} skin={skin} />)
    const rock = host.querySelector('svg')!
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
 * For each skin, the closest rounded rectangle an independent and far heavier search found for
 * its silhouette: 3,000 random starting rectangles, each refined by a pattern search, with the
 * outline sampled twice as finely (as row 8 found the first).
 *
 * A search that stops short overstates a skin's deviation, which only makes it pass more
 * easily -- and the calibration shapes below cannot see it, since they start close to their
 * answers. This can: the search must come at least as close as the witness.
 *
 * The rock's was re-derived in UI row 4, whose 4-unit sweep changed its silhouette: row 8's
 * witness, found for the 14-unit one, stood 0.1543 off the new rock, and a five-iteration
 * search passed against it (codex). This one stands 0.0675 off it, from a generating-set
 * pattern search (the axis moves and twelve random directions, the best taken; a plain
 * compass search came to 0.0679). Against it, the search with three passes fails when cut to
 * 5, 10 or 20 iterations per descent (0.0804, 0.0756, 0.0755) and passes from 40 (0.0660);
 * as written it finds 0.0653. A row that redraws a skin re-derives its witness.
 */
const WITNESSES: Partial<Record<Skin, RoundedRect>> = {
    rock: { cx: 0.5306884445322081, cy: 0.6680684087256465, a: 0.46569790757657364,
        b: 0.32219133769147434, k: 0.7813920506225188, turn: -0.2847634911726656 },
}

/** The domino's silhouette on one cell: the inset box, with the extrusion. */
const I = PIECE.inset / UNIT
const DOMINO_CELL = roundedRect(I, I, 1 - 2 * I, 1 - 2 * I + PIECE.extrusion / UNIT, PIECE.radius / UNIT)

describe('every skin has its own witness (UI row 4)', () => {
    it('so no skin is calibrated against another\'s silhouette', () => {
        expect(SKIN_NAMES.filter(skin => WITNESSES[skin] === undefined)).toEqual([])
    })

    it('and the board draws the rock in its skin', () => {
        const rocks = [...renderPieces(38).querySelectorAll('[data-piece="rock"] svg')]
        expect(rocks.map(svg => svg.getAttribute('data-skin'))).toEqual(['rock'])
    })
})

for (const skin of SKIN_NAMES) describe(`P1-2, the ${skin} skin: it deviates from a rounded rectangle by 0.05 of the cell at three points`, () => {
    it('is drawn as polygons, the rim stroking the side\'s own path', () => {
        for (const cell of SIZES) {
            const rock = drawn(skin, cell)
            expect(rock.rects, `${cell}px: a rect left in the ${skin}`).toBe(0)
            expect(rock.side, `${cell}px: side and rim disagree`).toEqual(rock.outline)
            expect(rock.facets, `${cell}px`).toHaveLength(2)
        }
    })

    it('fills the box every piece shares, and its facets stay on its face', () => {
        const { face, facets } = drawn(skin, 38)
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

    it('against the domino\'s rounded rectangle by far more than 0.05', () => {
        // The rock's own silhouette until row 8, and a member of the family below: stated on
        // its own because it is the one §1.4 is about.
        const f = deviation(drawn(skin, 38).outline, SAMPLING)
        const domino = { cx: 0.5, cy: I + (1 - 2 * I + PIECE.extrusion / UNIT) / 2, a: 0.5 - I,
            b: (1 - 2 * I + PIECE.extrusion / UNIT) / 2, k: (PIECE.radius / UNIT) / (0.5 - I), turn: 0 }
        expect(f(domino)).toBeGreaterThanOrEqual(BAR)
    })

    for (const cell of SIZES) {
        it(`at ${cell}px, against every rounded rectangle on its own bounding box -- exhaustive`, () => {
            const { bound } = boxFamilyLowerBound(drawn(skin, cell).outline, SAMPLING)
            expect(bound).toBeGreaterThanOrEqual(BAR)
        })
    }

    it('against the closest rounded rectangle a search finds, of any size, radius, place or turn', () => {
        // At the phone's cell, the one the art is designed for. The other sizes draw the same
        // shape in cells, which the family check above and tests/pieceGeometry.test.tsx's
        // linear scaling both confirm.
        const outline = drawn(skin, 38).outline
        const { deviation: closest } = closestRoundedRect(outline, SAMPLING)
        expect(closest).toBeGreaterThanOrEqual(BAR)
        // And it is really searching: it comes at least as close as this skin's witness does.
        const witness = WITNESSES[skin]
        expect(witness, `${skin} has no witness`).toBeDefined()
        expect(closest).toBeLessThanOrEqual(deviation(outline, SAMPLING)(witness!))
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

describe('each skin as the geometry module states it', () => {
    for (const skin of SKIN_NAMES) it(`the ${skin} is what \`Obstacle\` draws, so the checks above are of the committed shape`, () => {
        const toCells = (p: readonly Point[]) => p.map(([x, y]) => [x / UNIT, y / UNIT] as const)
        const rock = drawn(skin, 100)
        const shape = SKINS[skin]
        for (const [name, drawnPoints, stated] of [['rim', rock.outline, shape.silhouette], ['face', rock.face, shape.face]] as const) {
            expect(drawnPoints.length, name).toBe(stated.length)
            toCells(stated).forEach((p, i) => {
                expect(drawnPoints[i][0], `${name}[${i}]`).toBeCloseTo(p[0], 12)
                expect(drawnPoints[i][1], `${name}[${i}]`).toBeCloseTo(p[1], 12)
            })
        }
    })
})
