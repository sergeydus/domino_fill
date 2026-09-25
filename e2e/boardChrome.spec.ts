import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { waitForRest } from './rest'
import { VISUAL_URL } from './server'
import { BOARD_CORNER_PX } from '../app/dominoFill/ClientBoard'
import { LABEL_COLORS, LABEL_TIE } from '../app/dominoFill/lineLabel'
import type { LineState } from '../app/stores/boardRules'

/**
 * The board's chrome, as P1-3 (graphics row 9) requires it: the frame's inner radius and the
 * corner squares' radius agree by construction, and each target is tied to its line by a
 * relationship that can be measured.
 *
 * Both are geometry the browser decides, so they are read from the browser: at the phone
 * floor and the desktop cap on the real board, and on the component sheet, which is the one
 * place every label state is on screen at once.
 */

const ENDS = [
    { name: 'the phone floor', viewport: { width: 360, height: 640 }, cell: 38 },
    { name: 'the desktop cap', viewport: { width: 2560, height: 1440 }, cell: 106 },
] as const

/** Every board shell on the page: its frame's radii and width, and its corner squares'. */
const corners = (page: Page) => page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-board-shell]'), shell => {
        const frame = getComputedStyle(shell.querySelector('[data-board-frame]')!)
        const cells = shell.querySelectorAll('[data-cell]')
        const n = Math.round(Math.sqrt(cells.length))
        const cell = (at: string) => getComputedStyle(shell.querySelector(`[data-cell="${at}"]`)!)
        const px = (v: string) => parseFloat(v)
        return {
            border: [frame.borderTopWidth, frame.borderRightWidth, frame.borderBottomWidth, frame.borderLeftWidth].map(px),
            frame: [frame.borderTopLeftRadius, frame.borderTopRightRadius, frame.borderBottomRightRadius, frame.borderBottomLeftRadius].map(px),
            squares: [
                cell('0,0').borderTopLeftRadius, cell(`0,${n - 1}`).borderTopRightRadius,
                cell(`${n - 1},${n - 1}`).borderBottomRightRadius, cell(`${n - 1},0`).borderBottomLeftRadius,
            ].map(px),
        }
    }))

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
    test(`P1-3 at ${end.name}: the frame and the corner squares share one radius`, async ({ page }) => {
        await page.setViewportSize(end.viewport)
        await openBoard(page)
        const cell = (await page.locator('[data-cell]').first().boundingBox())!.width
        expect(cell).toBe(end.cell)

        const [board] = await corners(page)
        // The frame's outer radius is the corner plus its own width, on every side, so its
        // inner edge is the squares' curve.
        for (let k = 0; k < 4; k++) {
            expect(board.squares[k]).toBe(BOARD_CORNER_PX)
            expect(board.frame[k] - board.border[k]).toBe(board.squares[k])
        }

        /*
         * "By construction" is a claim about where the number comes from, and two literals
         * that agree today pass everything above. So the token is moved, in the page, and
         * both must follow it: a frame or a square with its own number would stay put.
         */
        await page.locator('[data-board-shell]').evaluate(el => el.style.setProperty('--board-corner', '20px'))
        const [moved] = await corners(page)
        for (let k = 0; k < 4; k++) {
            expect(moved.squares[k]).toBe(20)
            expect(moved.frame[k] - moved.border[k]).toBe(20)
        }
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
        // All three states are here, each tick in the colour the state is defined by.
        const seen = new Set(all.map(l => l.state))
        expect([...seen].sort()).toEqual(['neutral', 'over', 'satisfied'])
        for (const l of all) expect(l.tick, l.name).toBe(rgb(LABEL_COLORS[l.state as LineState]))
    })
}
