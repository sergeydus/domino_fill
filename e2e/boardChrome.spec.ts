import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { waitForRest } from './rest'
import { VISUAL_URL } from './server'
import { BOARD_CORNER_PX } from '../app/dominoFill/ClientBoard'
import { LABEL_COLORS, LABEL_TIE } from '../app/dominoFill/lineLabel'
import type { LineState } from '../app/stores/boardRules'
import { PALETTE, cssVar, type Token } from '../app/palette'
import { UNIT, WELL } from '../app/dominoFill/Pieces/geometry'

/**
 * The board's chrome, as P1-3 (graphics row 9) requires it, and UI row 4 redrew it (UI-SPEC
 * §4.1): a tray of wells, the tray's inner radius and the corner wells' agreeing by
 * construction, and each target tied to its line by a relationship that can be measured.
 *
 * Both are geometry the browser decides, so they are read from the browser: at the phone
 * floor and the desktop cap on the real board, and on the component sheet, which is the one
 * place every label state is on screen at once.
 */

const ENDS = [
    { name: 'the phone floor', viewport: { width: 360, height: 640 }, cell: 38 },
    { name: 'the desktop cap', viewport: { width: 2560, height: 1440 }, cell: 106 },
] as const

/**
 * Every board shell on the page: its tray's radii, width and inner box; each corner well's
 * outer radius and box; and every cell's box, radii and paint beside its well's (UI row 4).
 */
const corners = (page: Page) => page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-board-shell]'), shell => {
        const frameEl = shell.querySelector<HTMLElement>('[data-board-frame]')!
        const frame = getComputedStyle(frameEl)
        const cells = shell.querySelectorAll('[data-cell]')
        const n = Math.round(Math.sqrt(cells.length))
        const well = (at: string) => shell.querySelector(`[data-cell="${at}"] [data-well]`)!
        const px = (v: string) => parseFloat(v)
        const box = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
        const outer = frameEl.getBoundingClientRect()
        const border = [frame.borderTopWidth, frame.borderRightWidth, frame.borderBottomWidth, frame.borderLeftWidth].map(px)
        const at = [['0,0', 'TopLeft'], [`0,${n - 1}`, 'TopRight'], [`${n - 1},${n - 1}`, 'BottomRight'], [`${n - 1},0`, 'BottomLeft']] as const
        return {
            border,
            frame: [frame.borderTopLeftRadius, frame.borderTopRightRadius, frame.borderBottomRightRadius, frame.borderBottomLeftRadius].map(px),
            // The tray's inner edge: inside its border, where the wells sit.
            inner: { left: outer.left + border[3], top: outer.top + border[0], right: outer.right - border[1], bottom: outer.bottom - border[2] },
            wells: at.map(([cell, corner]) => ({
                radius: px(getComputedStyle(well(cell)).getPropertyValue(`border-${corner.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1)}-radius`)),
                box: box(well(cell)),
            })),
            cells: Array.from(cells, c => {
                const cs = getComputedStyle(c)
                const w = c.querySelector('[data-well]')!
                return {
                    at: c.getAttribute('data-cell')!,
                    box: box(c),
                    well: box(w),
                    radii: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(px),
                    paint: cs.backgroundColor,
                    tray: getComputedStyle(frameEl).backgroundColor,
                }
            }),
        }
    }))

type Shell = Awaited<ReturnType<typeof corners>>[number]

/**
 * UI-SPEC §4.1's wells, held to `WELL`: each inside its cell's box, inset `WELL.inset` units a
 * side, so `2 * inset` of the tray shows between neighbours; the cell's own box square and
 * unpainted, so the tray is what shows there; and the corner wells concentric with the tray.
 */
const expectWells = (board: Shell, cell: number, corner: number) => {
    const inset = cell * WELL.inset / UNIT
    expect(board.cells.length, 'no cells read').toBeGreaterThan(0)
    for (const c of board.cells) {
        // The cell's box: square, unrounded, unpainted -- the pointer's target (rule 3).
        expect(c.radii, `${c.at}: the cell's box is rounded`).toEqual([0, 0, 0, 0])
        expect(c.paint, `${c.at}: the cell's box is painted`).toBe('rgba(0, 0, 0, 0)')
        expect(c.tray, 'the tray is unpainted').not.toBe('rgba(0, 0, 0, 0)')
        // The well, inset on every side.
        for (const [side, d] of [['left', c.well.left - c.box.left], ['top', c.well.top - c.box.top],
            ['right', c.box.right - c.well.right], ['bottom', c.box.bottom - c.well.bottom]] as const) {
            expect(Math.abs(d - inset), `${c.at}: the well's ${side} inset`).toBeLessThanOrEqual(0.5)
        }
    }
    // The tray between two neighbours: a gap of twice the inset.
    const of = (at: string) => board.cells.find(c => c.at === at)!
    expect(Math.abs((of('0,1').well.left - of('0,0').well.right) - 2 * inset), 'the gap across').toBeLessThanOrEqual(0.5)
    expect(Math.abs((of('1,0').well.top - of('0,0').well.bottom) - 2 * inset), 'the gap down').toBeLessThanOrEqual(0.5)
    expect(of('0,1').well.left - of('0,0').well.right, 'no gap: the tray does not show').toBeGreaterThan(0)
    // The corner wells: their outer radius the tray's inner one less the inset, and the arc's
    // centre the tray's, so the gap stays even round the curve.
    const { inner } = board
    const centres = [
        [inner.left + corner, inner.top + corner], [inner.right - corner, inner.top + corner],
        [inner.right - corner, inner.bottom - corner], [inner.left + corner, inner.bottom - corner],
    ]
    board.wells.forEach(({ radius, box }, k) => {
        expect(Math.abs(radius - (corner - inset)), `corner ${k}: radius`).toBeLessThanOrEqual(0.01)
        const centre = [
            k === 0 || k === 3 ? box.left + radius : box.right - radius,
            k < 2 ? box.top + radius : box.bottom - radius,
        ]
        expect(Math.abs(centre[0] - centres[k][0]), `corner ${k}: not concentric across`).toBeLessThanOrEqual(0.5)
        expect(Math.abs(centre[1] - centres[k][1]), `corner ${k}: not concentric down`).toBeLessThanOrEqual(0.5)
    })
}

/**
 * Every label on the page, with its tie and its line: where the tick is, where the line's
 * centre and the frame's outer edge are, and the two colours.
 */
const ties = (page: Page) => page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-board-shell]')).flatMap(shell => {
        const frame = shell.querySelector('[data-board-frame]')!.getBoundingClientRect()
        const cell = shell.querySelector('[data-cell="0,0"]')!.getBoundingClientRect().width
        const read = (label: HTMLElement, axis: 'col' | 'row', index: number) => {
            const tie = label.querySelector<HTMLElement>('[data-label-tie]')
            const line = shell.querySelector(axis === 'col' ? `[data-cell="0,${index}"]` : `[data-cell="${index},0"]`)!
                .getBoundingClientRect()
            const t = tie?.getBoundingClientRect()
            return {
                name: `${axis} ${index}`,
                state: label.getAttribute('data-line-state'),
                cell,
                tie: t && { x: t.x, y: t.y, width: t.width, height: t.height },
                lineCentre: axis === 'col' ? line.x + line.width / 2 : line.y + line.height / 2,
                frameEdge: axis === 'col' ? frame.top : frame.left,
                label: getComputedStyle(label).color,
                tick: tie && getComputedStyle(tie).backgroundColor,
                hidden: tie?.getAttribute('aria-hidden'),
            }
        }
        return [
            ...Array.from(shell.querySelectorAll<HTMLElement>('[data-col-label]'), (l, i) => read(l, 'col', i)),
            ...Array.from(shell.querySelectorAll<HTMLElement>('[data-row-label]'), (l, i) => read(l, 'row', i)),
        ]
    }))

type Tie = Awaited<ReturnType<typeof ties>>[number]

const rgb = (hex: string) => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

/**
 * The light value a label paints in a state. `LABEL_COLORS` holds references to tokens since
 * UI row 1 (`var(--success)`), so the token is read back from the reference; the sheet runs
 * in the light scheme, so it is the light value the page computes.
 */
const labelColour = (state: LineState) => {
    const token = (Object.keys(PALETTE) as Token[]).find(t => cssVar(t) === LABEL_COLORS[state])
    if (token === undefined) throw new Error(`${LABEL_COLORS[state]} names no token`)
    return rgb(PALETTE[token])
}

/** The tie, held to what `LABEL_TIE` says it is. */
const expectTied = (all: Tie[]) => {
    expect(all.length, 'no labels to check').toBeGreaterThan(0)
    for (const l of all) {
        expect(l.tie, `${l.name} has no tie`).toBeTruthy()
        const t = l.tie!
        const col = l.name.startsWith('col')
        // Centred on the line, to within half a pixel.
        const centre = col ? t.x + t.width / 2 : t.y + t.height / 2
        expect(Math.abs(centre - l.lineCentre), `${l.name}: off its line`).toBeLessThanOrEqual(0.5)
        // Its far end on the frame's outer edge: touching it, not near it.
        const end = col ? t.y + t.height : t.x + t.width
        expect(Math.abs(end - l.frameEdge), `${l.name}: does not reach the frame`).toBeLessThanOrEqual(0.5)
        // Its size, as the fractions of the cell it is written in.
        const [along, across] = col ? [t.height, t.width] : [t.width, t.height]
        expect(along, `${l.name} length`).toBeCloseTo(LABEL_TIE.length * l.cell, 1)
        expect(across, `${l.name} width`).toBeCloseTo(LABEL_TIE.width * l.cell, 1)
        // And the label's own colour, whatever the state.
        expect(l.tick, `${l.name}: not the label's colour`).toBe(l.label)
        expect(l.hidden).toBe('true')
    }
}

for (const end of ENDS) {
    test(`UI row 4 at ${end.name}: a tray of wells, the corner wells concentric with the tray`, async ({ page }) => {
        await page.setViewportSize(end.viewport)
        await openBoard(page)
        const cell = (await page.locator('[data-cell]').first().boundingBox())!.width
        expect(cell).toBe(end.cell)

        const [board] = await corners(page)
        // The tray's outer radius is the corner plus its own width, on every side: 22px
        // (UI-SPEC §3.3), where the frame's was 16.
        for (let k = 0; k < 4; k++) expect(board.frame[k]).toBe(BOARD_CORNER_PX + board.border[k])
        expect(board.frame).toEqual([22, 22, 22, 22])
        expectWells(board, cell, BOARD_CORNER_PX)

        /*
         * "By construction" is a claim about where the number comes from, and two literals
         * that agree today pass everything above. So the token is moved, in the page, and
         * both must follow it: a tray or a well with its own number would stay put.
         */
        await page.locator('[data-board-shell]').evaluate(el => el.style.setProperty('--board-corner', '20px'))
        const [moved] = await corners(page)
        for (let k = 0; k < 4; k++) expect(moved.frame[k] - moved.border[k]).toBe(20)
        expectWells(moved, cell, 20)
    })

    test(`P1-3 at ${end.name}: every target is tied to its line`, async ({ page }) => {
        await page.setViewportSize(end.viewport)
        await openBoard(page)
        await waitForRest(page)
        expectTied(await ties(page))
    })
}

for (const cell of [38, 53]) {
    test(`P1-3 on the sheet at ${cell}px: the tie holds in every label state, in that state's colour`, async ({ page }) => {
        await page.goto(`${VISUAL_URL}/visual?cell=${cell}`)
        await expect(page.locator('main[data-sheet]')).toBeVisible()
        await waitForRest(page, 'main')
        const all = await ties(page)
        expectTied(all)
        // All four states are here (`reached` since UI row 4), each tick in the colour the
        // state is defined by: the satisfied tick `success`, though its pill's number is
        // `onSuccess`, which on the ground would be a white tick.
        const seen = new Set(all.map(l => l.state))
        expect([...seen].sort()).toEqual(['neutral', 'over', 'reached', 'satisfied'])
        for (const l of all) expect(l.tick, l.name).toBe(labelColour(l.state as LineState))
    })
}
