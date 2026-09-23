import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { drag, readBoard } from './play'
import { readArt } from './artGeometry'

/**
 * The art as it stands, in the real build at the two ends of the real range (graphics spec
 * P0-2, row 2).
 *
 * tests/pieceGeometry.test.tsx pins the six constants at chosen cell sizes. What it cannot
 * say is which cell sizes actually ship, and that is the half of §1.1 that went stale: the
 * table was measured when the widest cell was 53px, and row 1's desktop composition took
 * it to 106. So this measures the range where it is decided -- the real layout, at the
 * phone floor and at the desktop cap -- and reads the art off the board at both ends with
 * the same reader the unit test uses.
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

/** An upright and a flat run of two free squares, not overlapping, on today's board. */
const freeRuns = async (page: Page) => {
    const { size, board } = await readBoard(page)
    const free = (i: number, j: number) => i < size && j < size && board[i][j] === null

    let upright: [number, number] | null = null
    for (let j = 0; j < size && !upright; j++) {
        for (let i = 0; i + 1 < size && !upright; i++) {
            if (free(i, j) && free(i + 1, j)) upright = [i, j]
        }
    }
    if (!upright) throw new Error('today\'s board has no free upright run')
    const [ui, uj] = upright
    const taken = (i: number, j: number) => j === uj && (i === ui || i === ui + 1)

    for (let i = 0; i < size; i++) {
        for (let j = 0; j + 1 < size; j++) {
            if (free(i, j) && free(i, j + 1) && !taken(i, j) && !taken(i, j + 1)) {
                return { upright, flat: [i, j] as [number, number] }
            }
        }
    }
    throw new Error('today\'s board has no free flat run beside the upright one')
}

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
    test(`the art at ${end.name}: every constant is its pixel value at ${end.cell}px`, async ({ page }) => {
        await page.setViewportSize(end.viewport)
        await openBoard(page)
        await page.getByRole('button', { name: /easy/i }).click()
        await expect(page.locator('[data-cell]')).toHaveCount(36)

        // The end of the range, measured where it is decided rather than assumed.
        const cell = (await page.locator('[data-cell]').first().boundingBox())!.width
        expect(cell, `${end.name} is not where §1.1 says the range ends`).toBe(end.cell)

        await watchEntries(page)
        const { upright, flat } = await freeRuns(page)
        await drag(page, upright, [upright[0] + 1, upright[1]])
        await drag(page, flat, [flat[0], flat[1] + 1])
        await expect(page.locator('[data-piece="one"]')).toHaveCount(1)
        await expect(page.locator('[data-piece="two"]')).toHaveCount(1)

        /*
         * Every piece on the board, including all of today's rocks -- not one of each. So
         * the expected lengths come from what is there: three rects and one outline per
         * piece, a pip on an upright and two on a flat, a divider per domino.
         */
        const art = await page.locator('body').evaluate(readArt)
        const { ones, twos, rocks } = art.counts
        expect({ ones, twos }, 'exactly the two dominoes this test placed').toEqual({ ones: 1, twos: 1 })
        const pieces = ones + twos + rocks

        expect(art.outline, 'outline stroke').toEqual(Array(pieces).fill(6))
        expect(art.radius, 'corner radius').toEqual(Array(3 * pieces).fill(8))
        expect(art.pip, 'pip diameter').toEqual(Array(ones + 2 * twos).fill(16))
        expect(art.divider, 'divider span').toEqual(Array(ones + twos).fill(end.cell - 32))
        expect(art.extrusion, 'extrusion depth').toEqual(Array(pieces).fill(16))

        const offsets = (await entries(page)).map(t => [
            /translateX\((-?[\d.]+)px\)/.exec(t)?.[1],
            /translateY\((-?[\d.]+)px\)/.exec(t)?.[1],
        ].map(Number))
        expect(offsets, 'entry offset, one [x, y] per domino placed').toEqual([[-26, -26], [-26, -26]])
    })
}
