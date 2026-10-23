import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { drag, freeRuns, rockSquares } from './play'
import { readArt } from './artGeometry'
import { waitForRest } from './rest'
import { VISUAL_URL } from './server'
import { PIECE, ROCK, UNIT, fraction, points } from '../app/dominoFill/Pieces/geometry'
import { MOTION } from '../app/dominoFill/motion'
import { rgbBytes, type Token } from '../app/palette'

/**
 * The art in the real build at the two ends of the real range (graphics spec P0-2, row 2;
 * ratios since P0-6, row 6).
 *
 * tests/pieceGeometry.test.tsx pins the constants at chosen cell sizes. What it cannot
 * say is which cell sizes actually ship, and that is the half of §1.1 that went stale: the
 * table was measured when the widest cell was 53px, and row 1's desktop composition took
 * it to 106. So this measures the range where it is decided -- the real layout, at the
 * phone floor and at the desktop cap -- and reads the art off the board at both ends with
 * the same reader the unit test uses.
 *
 * Row 2 asserted pixels: a 6px outline at both ends, which was the defect. Since row 6
 * every constant is a fraction of the cell, so at each end it must be that fraction of the
 * cell measured there -- since UI row 4, 0.76px of rim at 38 and 2.12px at 106 (P1-1's
 * outline was 3.42px and 9.54px).
 *
 * Fixture-derived throughout: the dominoes go wherever today's board has room, and the
 * rocks are today's own. What that is known to cover, precisely:
 *
 *   - **A rock on every day, by construction.** The corpus validator holds each slot to an
 *     exact rock count, the smallest of which is 4.
 *   - **Room for both dominoes on every published day, by measurement only.** The same
 *     search, run over the corpus files at row 2, succeeds on all 10,959 easy boards --
 *     every level of all 3,653 published days. The generator promises nothing of the
 *     kind for puzzles appended later. If one ever has no room, `freeRuns` throws -- a
 *     loud failure on that day, never a skip.
 */

const ENDS = [
    { name: 'the phone floor', viewport: { width: 360, height: 640 }, cell: 38 },
    { name: 'the desktop cap', viewport: { width: 2560, height: 1440 }, cell: 106 },
] as const

/**
 * The transform each domino is inserted with -- the entry animation's first frame.
 *
 * Caught by a `MutationObserver`, whose callback runs at the microtask checkpoint after the
 * insertion and so before any animation frame can move it. After that the offset is gone:
 * at rest every piece sits at zero, which is why this cannot be read at the end.
 */
const watchEntries = (page: Page) => page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { __entries: string[] }).__entries = seen
    new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node instanceof HTMLElement && node.matches('[data-piece="one"], [data-piece="two"]')) {
                    seen.push(node.style.transform)
                }
            }
        }
    }).observe(document.body, { childList: true, subtree: true })
})

const entries = (page: Page) =>
    page.evaluate(() => (window as unknown as { __entries: string[] }).__entries)

for (const end of ENDS) {
    test(`the art at ${end.name}: every constant is its fraction of the ${end.cell}px cell`, async ({ page }) => {
        await page.setViewportSize(end.viewport)
        await openBoard(page)
        await page.getByRole('button', { name: /easy/i }).click()
        await expect(page.locator('[data-cell]')).toHaveCount(36)

        // The end of the range, measured where it is decided rather than assumed.
        const cell = (await page.locator('[data-cell]').first().boundingBox())!.width
        expect(cell, `${end.name} is not where §1.1 says the range ends`).toBe(end.cell)

        const labelled = await rockSquares(page)
        expect(labelled.length, 'the board has no rock squares to compare against').toBeGreaterThan(0)

        await watchEntries(page)
        const { upright, flat } = await freeRuns(page, labelled)
        await drag(page, upright, [upright[0] + 1, upright[1]])
        await drag(page, flat, [flat[0], flat[1] + 1])
        await expect(page.locator('[data-piece="one"]')).toHaveCount(1)
        await expect(page.locator('[data-piece="two"]')).toHaveCount(1)

        /*
         * Every piece on the board, including all of today's rocks -- not one of each. So
         * the expected lengths come from what is there: one rim per piece, three rects
         * per domino (a rock has none since P1-2 made it a polygon), a pip on an upright and
         * two on a flat, a divider per domino.
         */
        const art = await page.locator('body').evaluate(readArt)
        const { ones, twos, rocks } = art.counts
        expect({ ones, twos }, 'exactly the two dominoes this test placed').toEqual({ ones: 1, twos: 1 })
        const pieces = ones + twos + rocks

        /*
         * Which rocks there *should* be, from a source the overlay does not control.
         *
         * `rocks` above is counted from the overlay, and so are the lengths it sets -- so a
         * rock whose drawing vanished would shrink both together and pass. The squares'
         * labels are built from the store's board, not from the overlay, so they say
         * independently where the rocks are. Compared as positions rather than as a count:
         * a rock drawn on the wrong square is as wrong as a missing one.
         */
        const drawn = await page.locator('[data-piece="rock"]').evaluateAll(
            els => els.map(el => el.getAttribute('data-at')!).sort())
        expect(drawn, 'the rocks drawn are not the rocks on the board').toEqual(labelled)

        /** Every instance is `units` of the drawing, as a fraction of this cell. */
        const each = (values: number[], length: number, units: number, label: string, digits = 6) => {
            expect(values, `${label}: one per instance`).toHaveLength(length)
            for (const value of values) expect(value, label).toBeCloseTo(fraction(units) * end.cell, digits)
        }
        each(art.rim, pieces, PIECE.rim, 'rim stroke')
        each(art.radius, 3 * (ones + twos), PIECE.radius, 'corner radius')
        each(art.pip, ones + 2 * twos, 2 * PIECE.pipRadius, 'pip diameter')
        each(art.divider, ones + twos, UNIT - 2 * PIECE.dividerInset, 'divider span')
        each(art.extrusion, pieces, PIECE.extrusion, 'extrusion depth')
        // The lift and the entry offset are CSS lengths read back from inline styles, which
        // Chromium serialises to six significant digits: 18.6415px of an 18.641509...px entry
        // at 38. Three places is that precision, not a looser claim; the drawing's own
        // attributes above are read as written and held to six.
        each(art.lift, pieces, PIECE.extrusion, 'lift out of the cell', 3)

        /*
         * P1-1: the art may not change what `pointerUp` resolves (graphics row 7).
         *
         * The pointer resolves a square with `elementFromPoint` (touch.spec.ts says why), so
         * that is what is asked, of every square on the board, with every kind of piece on
         * it: at its centre, 2px inside the middle of each edge, and 2px inside each corner.
         * The edges are where the art reaches -- every piece stands up out of its cell by its
         * extrusion, over the bottom of the square above -- and a piece that took the pointer
         * there would turn a press on one square into a press on another. The corners were 5px
         * in until UI row 4, because the board's four outer squares were rounded by 12px and
         * 2px inside that corner was outside the square itself, art or none. Since row 4 the
         * square's box is square and its well is rounded instead, so the corners are probed
         * 2px in, as the edges are: a box rounded at the tray's 18px loses them, where at 5px
         * the probe sat 0.38px outside the arc and Chromium still resolved the square
         * (measured: the mutation that left the rounding on the box passed at 5px).
         */
        const misses = await page.evaluate(() => {
            const wrong: string[] = []
            for (const square of document.querySelectorAll<HTMLElement>('[data-cell]')) {
                const r = square.getBoundingClientRect()
                const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2]
                const probes = [[cx, cy],
                    [cx, r.top + 2], [cx, r.bottom - 2], [r.left + 2, cy], [r.right - 2, cy],
                    [r.left + 2, r.top + 2], [r.right - 2, r.top + 2],
                    [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]]
                for (const [x, y] of probes) {
                    const hit = document.elementFromPoint(x, y)?.closest('[data-cell]')?.getAttribute('data-cell')
                    if (hit !== square.dataset.cell) wrong.push(`${square.dataset.cell} at ${x},${y} -> ${hit}`)
                }
            }
            return { wrong, squares: document.querySelectorAll('[data-cell]').length }
        })
        expect(misses.squares, 'every square of the easy board was probed').toBe(36)
        expect(misses.wrong, 'a press on a square resolved to another').toEqual([])

        const offsets = (await entries(page)).flatMap(t => [
            /translateX\((-?[\d.e+-]+)px\)/.exec(t)?.[1],
            /translateY\((-?[\d.e+-]+)px\)/.exec(t)?.[1],
        ].map(v => -Number(v)))
        each(offsets, 4, UNIT * MOTION.entry.offset / Math.SQRT2, 'entry offset, x and y per domino placed', 3)
    })

    test(`the rocks at ${end.name}: the faceted silhouette, in the rock's tones`, async ({ page }) => {
        /*
         * P1-2 (graphics row 8). tests/rock.test.tsx measures the silhouette from a server
         * render; this is the real build, with every one of today's rocks, at both ends of
         * the range. Each must draw the committed path -- the side filled with it, the rim
         * stroking it in the face tone (UI row 4) -- in the four rock tones, and no rect. And Chromium's own
         * geometry is asked what the unit test computed: three points the old rounded
         * rectangle covered -- two of its corners and the notch in the new crown -- are
         * outside the rock's fill.
         */
        await page.setViewportSize(end.viewport)
        await openBoard(page)
        await page.getByRole('button', { name: /easy/i }).click()
        await expect(page.locator('[data-cell]')).toHaveCount(36)

        const EMPTIED: [number, number][] = [[12, 12], [88, 12], [42, 38]]
        const rocks = await page.locator('[data-piece="rock"] svg').evaluateAll((svgs, emptied) => svgs.map(svg => {
            const outline = svg.querySelector('[data-outline]') as SVGPolygonElement
            const fills = Array.from(svg.querySelectorAll<SVGPolygonElement>('polygon:not([data-outline])'))
            const box = outline.getBBox()
            const point = new DOMPoint()
            return {
                width: svg.getBoundingClientRect().width,
                rects: svg.querySelectorAll('rect').length,
                outline: outline.getAttribute('points'),
                side: fills[0]?.getAttribute('points'),
                fills: fills.map(p => getComputedStyle(p).fill),
                stroke: getComputedStyle(outline).stroke,
                box: [box.x, box.y, box.width, box.height],
                inFill: emptied.map(([x, y]) => { point.x = x; point.y = y; return fills[0].isPointInFill(point) }),
            }
        }), EMPTIED)

        const rgb = (token: Token) => `rgb(${rgbBytes(token).join(', ')})`
        const xs = ROCK.silhouette.map(p => p[0])
        const ys = ROCK.silhouette.map(p => p[1])
        expect(rocks.length, 'no rocks on the board').toBeGreaterThan(0)
        for (const rock of rocks) {
            expect(rock.width).toBe(end.cell)
            expect(rock.rects).toBe(0)
            expect(rock.outline).toBe(points(ROCK.silhouette))
            expect(rock.side).toBe(points(ROCK.silhouette))
            expect(rock.fills).toEqual((['rockSide', 'rockFace', 'rockLit', 'rockShade'] as const).map(rgb))
            expect(rock.stroke).toBe(rgb('rockFace'))
            expect(rock.box).toEqual([Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)])
            expect(rock.inFill, 'a corner or the notch is filled').toEqual([false, false, false])
        }
    })
}

/**
 * Every piece on the component sheet, as the browser draws it in the current scheme (UI row 4):
 * its rim, read as computed, and what the silhouette exposes; and what a silhouette can touch,
 * the wells and the tray, with the tile face the rock's rim also clears.
 *
 * Self-contained, as a function Playwright ships into the page must be.
 */
const readSilhouettes = (page: Page) => page.evaluate(() => {
    const parse = (c: string) => {
        const m = /rgba?\(([^)]+)\)/.exec(c)
        if (m === null) return null
        const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number)
        return { rgb: p.slice(0, 3), alpha: p.length > 3 ? p[3] : 1 }
    }
    const tones = (selector: string, property: 'backgroundColor' | 'fill') =>
        [...new Set(Array.from(document.querySelectorAll(selector), el => getComputedStyle(el)[property]))]
    const pieces = Array.from(document.querySelectorAll<HTMLElement>('[data-specimen] [data-piece]'), piece => {
        const svg = piece.querySelector('svg')!
        const rims = Array.from(svg.querySelectorAll<SVGGeometryElement>('[data-outline]'))
        const [side, face] = Array.from(svg.querySelectorAll<SVGGeometryElement>('rect:not([data-outline]), polygon:not([data-outline])'))
        const rim = rims[0]
        const cs = rim && getComputedStyle(rim)
        // Effective opacity: the stroke colour's alpha, its stroke-opacity, and the opacity of
        // the rim and every ancestor up to the piece; nothing at all if it isn't displayed.
        let opacity = 1
        for (let el: Element | null = rim ?? null; el !== null && el !== piece.parentElement; el = el.parentElement) {
            opacity *= parseFloat(getComputedStyle(el).opacity)
        }
        const shown = cs !== undefined && cs.display !== 'none' && cs.visibility === 'visible'
        const effective = cs === undefined || !shown ? 0 : (parse(cs.stroke)?.alpha ?? 0) * parseFloat(cs.strokeOpacity) * opacity
        // Closed: a rect, a polygon, or a path of one subpath that ends in Z.
        const d = rim?.getAttribute('d') ?? ''
        const closed = rim !== undefined && (['rect', 'polygon'].includes(rim.tagName.toLowerCase())
            || (rim.tagName.toLowerCase() === 'path' && /^\s*[Mm][^Mm]*[Zz]\s*$/.test(d)))
        // Round the whole silhouette: points along the side's and the face's outlines all
        // fall in the rim's fill or stroke.
        const missed: string[] = []
        if (rim !== undefined) {
            for (const [name, shape] of [['side', side], ['face', face]] as const) {
                const length = shape.getTotalLength()
                for (let i = 0; i < 64; i++) {
                    const p = shape.getPointAtLength((i * length) / 64)
                    const point = new DOMPoint(p.x, p.y)
                    if (!rim.isPointInFill(point) && !rim.isPointInStroke(point)) missed.push(`${name} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                }
            }
        }
        const [a, b, r] = [side.getBBox(), face.getBBox(), rim?.getBBox()]
        const union = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x + a.width, b.x + b.width), Math.max(a.y + a.height, b.y + b.height)]
        const box = r && [r.x, r.y, r.x + r.width, r.y + r.height]
        return {
            name: `${piece.closest('[data-specimen]')!.getAttribute('data-specimen')} ${piece.getAttribute('data-piece')}@${piece.getAttribute('data-at')}`,
            kind: piece.getAttribute('data-piece')!,
            rims: rims.length,
            effective,
            width: cs ? parseFloat(cs.strokeWidth) : 0,
            fill: cs?.fill,
            dash: cs?.strokeDasharray,
            closed,
            missed,
            boxOff: box ? Math.max(...box.map((v, i) => Math.abs(v - union[i]))) : Infinity,
            stroke: cs?.stroke,
            side: getComputedStyle(side).fill,
            face: getComputedStyle(face).fill,
        }
    })
    return {
        pieces,
        wells: tones('[data-specimen] [data-well]', 'backgroundColor'),
        trays: tones('[data-specimen] [data-board-frame]', 'backgroundColor'),
        faces: tones('[data-specimen] [data-piece="one"] svg rect:nth-of-type(2), [data-specimen] [data-piece="two"] svg rect:nth-of-type(2)', 'fill'),
    }
})

/** WCAG contrast of two computed `rgb()` colours. */
const ratio = (a: string, b: string) => {
    const lum = (c: string) => {
        const [r, g, bl] = /rgba?\(([^)]+)\)/.exec(c)![1].split(/[\s,/]+/).filter(Boolean).slice(0, 3).map(Number)
        const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(bl)
    }
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
}

for (const scheme of ['light', 'dark'] as const) {
    for (const cell of [38, 53]) {
        test(`UI row 4, ${scheme}, at ${cell}px: every silhouette's rim is drawn as the rule says, and what it exposes clears 3:1`, async ({ page }) => {
            /*
             * UI-SPEC §3.1's silhouette rule. Where a tone fails at the edge, a continuous rim
             * encloses the whole silhouette: the light domino's, the rock's in both themes. The
             * dark domino has none. Contrast alone can't hold that (codex): a dark rim in the
             * face's own colour clears every pair, and a rim removed leaves every token pair
             * unchanged. So the drawing itself is checked -- present, closed, unbroken, round
             * the side and the face, or absent -- and then what it exposes, as computed.
             */
            await page.emulateMedia({ colorScheme: scheme })
            await page.goto(`${VISUAL_URL}/visual?cell=${cell}`)
            await expect(page.locator('main[data-sheet]')).toBeVisible()
            await waitForRest(page, 'main')
            const { pieces, wells, trays, faces } = await readSilhouettes(page)

            const kinds = new Set(pieces.map(p => p.kind))
            expect([...kinds].sort(), 'the sheet holds every kind of piece').toEqual(['one', 'rock', 'two'])
            expect(wells, 'both well tones').toHaveLength(2)
            expect(trays, 'one tray tone').toHaveLength(1)
            expect(faces, 'one tile face').toHaveLength(1)

            for (const p of pieces) {
                const rimmed = p.kind === 'rock' || scheme === 'light'
                if (rimmed) {
                    // Present: exactly one, fully painted, 2 units wide, unfilled.
                    expect(p.rims, `${p.name}: a rim`).toBe(1)
                    expect(p.effective, `${p.name}: the rim's effective opacity`).toBe(1)
                    expect(p.width, `${p.name}: the rim's width`).toBe(PIECE.rim)
                    expect(p.fill, `${p.name}: the rim is filled`).toBe('none')
                    // Closed and unbroken.
                    expect(p.closed, `${p.name}: the rim is not one closed shape`).toBe(true)
                    expect(p.dash, `${p.name}: the rim is dashed`).toBe('none')
                    // Round the whole silhouette, side and face.
                    expect(p.missed, `${p.name}: outside the rim`).toEqual([])
                    expect(p.boxOff, `${p.name}: the rim's box is not the silhouette's`).toBeLessThanOrEqual(0.5)
                } else {
                    // The dark domino: no painted rim, in any colour.
                    expect(p.effective === 0 || p.width === 0, `${p.name}: the dark domino has a rim`).toBe(true)
                }

                // What the silhouette exposes: the rim where one is painted, else the side and face.
                const exposed = rimmed ? [p.stroke!] : [p.side, p.face]
                const grounds = [...wells, ...trays, ...(p.kind === 'rock' ? faces : [])]
                for (const tone of exposed) {
                    for (const ground of grounds) {
                        expect(ratio(tone, ground), `${p.name}: ${tone} on ${ground}`).toBeGreaterThanOrEqual(3)
                    }
                }
            }
        })
    }
}
