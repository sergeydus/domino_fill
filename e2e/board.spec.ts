import { test, expect, type Page } from '@playwright/test'

/**
 * Where a click on the board lands (spec P0-4 / D4).
 *
 * This needs a real browser and is not answerable in jsdom. The bug is a *hit-testing*
 * bug: a domino's SVG is 16px taller than its cell and shifted up, and its outline rect
 * was painted with `fill="transparent"` -- a paint value, not `none` -- so under the
 * default `pointer-events: visiblePainted` the overlay swallowed clicks aimed at the
 * empty cell above it. jsdom has no hit-testing at all: `fireEvent` dispatches straight
 * at whichever node the test names, so the wrong node is never *chosen* and the defect
 * cannot appear.
 */

const overlay = (page: Page) => page.locator('div.fixed.inset-0')

/** Dismiss the tutorial so the real board is reachable. */
const openBoard = async (page: Page) => {
    await page.goto('/')
    const skip = page.getByRole('button', { name: /skip/i })
    await skip.scrollIntoViewIfNeeded()
    await skip.click()
    await expect(overlay(page)).toBeHidden()
    await expect(page.locator('[data-cell="0,0"]')).toBeVisible()
}

/**
 * Every cell that currently holds something, as "i,j".
 *
 * One element is rendered per *domino*, not per cell -- `data-at` marks the half carrying
 * the pips -- so both halves are expanded here. An upright piece at (i,j) also covers
 * (i+1,j); a flat piece at (i,j) also covers (i,j-1). Counting elements instead would
 * silently treat the second half of every domino as free.
 */
const occupied = async (page: Page) => {
    const pieces = await page.locator('[data-piece]').evaluateAll(
        els => els.map(el => ({ kind: el.getAttribute('data-piece')!, at: el.getAttribute('data-at')! }))
    )
    const cells = new Set<string>()
    for (const { kind, at } of pieces) {
        const [i, j] = at.split(',').map(Number)
        cells.add(`${i},${j}`)
        if (kind === 'one') cells.add(`${i + 1},${j}`)
        if (kind === 'two') cells.add(`${i},${j - 1}`)
    }
    return cells
}

const boardSize = (page: Page) => page.locator('[data-cell]').count()

/**
 * Find a cell (i,j) that is free, has a free cell below it -- room for an upright domino
 * -- and `above` free cells stacked on top of it. Rock layout is content, so the tests
 * locate their spot rather than hardcoding one.
 */
const freeColumnRun = async (page: Page, above = 1) => {
    const n = Math.sqrt(await boardSize(page))
    const taken = await occupied(page)
    const free = (i: number, j: number) => !taken.has(`${i},${j}`)

    for (let j = 0; j < n; j++) {
        for (let i = above; i + 1 < n; i++) {
            const run = Array.from({ length: above + 2 }, (_, k) => i - above + k)
            if (run.every(r => free(r, j))) return { i, j }
        }
    }
    throw new Error(`no column has ${above + 2} adjacent free cells; the fixture board changed`)
}

/**
 * The cell's box in viewport coordinates, scrolled into view first.
 *
 * `page.mouse` takes raw viewport coordinates and does not scroll, so a box measured
 * below the fold points at nothing. Measured after the scroll, never before.
 */
const cellBox = async (page: Page, i: number, j: number) => {
    const cell = page.locator(`[data-cell="${i},${j}"]`)
    await cell.scrollIntoViewIfNeeded()
    const box = await cell.boundingBox()
    if (!box) throw new Error(`cell ${i},${j} has no box`)
    return box
}

/** Place an upright domino occupying (i,j) and (i+1,j). */
const placeUpright = async (page: Page, i: number, j: number) => {
    const box = await cellBox(page, i, j)
    // Lower half of the cell: `highlightedPair` then prefers the neighbour *below*.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.75)
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
}

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('a domino can be placed and removed by clicking it', async ({ page }) => {
    const { i, j } = await freeColumnRun(page)
    await placeUpright(page, i, j)

    // Removal used to be the overlay's own click handler. With the overlay inert it has
    // to be routed from the cell underneath, so this guards the fix as much as the bug.
    const box = await cellBox(page, i, j)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toHaveCount(0)
})

test('clicking just above a domino does not delete it (D4)', async ({ page }) => {
    const { i, j } = await freeColumnRun(page)
    await placeUpright(page, i, j)

    const above = await cellBox(page, i - 1, j)
    // 4px inside the bottom edge of the cell ABOVE the domino. The domino's outline rect
    // reaches 12px into this cell, so before the fix this point hit the overlay and the
    // handler deleted the domino the player was trying to build on top of.
    await page.mouse.click(above.x + above.width / 2, above.y + above.height - 4)

    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
})

test('clicking just above a domino places a piece there', async ({ page }) => {
    // Two free cells above, not one: the lower half of (i-1,j) resolves downward first,
    // and with (i,j) taken it falls back to (i-2,j) -- which has to exist and be free.
    const { i, j } = await freeColumnRun(page, 2)
    await placeUpright(page, i, j)
    const before = (await occupied(page)).size

    const above = await cellBox(page, i - 1, j)
    await page.mouse.click(above.x + above.width / 2, above.y + above.height - 4)

    // Not merely "nothing was destroyed": the click must also do what it was aimed at.
    expect((await occupied(page)).size).toBe(before + 2)
    await expect(page.locator(`[data-piece="one"][data-at="${i - 2},${j}"]`)).toBeVisible()
})

test('the piece overlay does not take pointer events', async ({ page }) => {
    // Defence in depth, and stated as such: with the overlay's own click handler gone,
    // restoring `pointer-events: auto` here does NOT bring D4 back -- measured. The
    // behavioural tests above stay green either way, so this asserts the property
    // directly. It matters for what comes next: P1-2 moves hit-testing onto the cells,
    // and a layer that takes pointer events would sit on top of every one of them.
    const layer = page.locator('div.absolute.z-20').first()
    await expect(layer).toHaveCSS('pointer-events', 'none')
})

test('the decorative outline rects are unpainted', async ({ page }) => {
    const { i, j } = await freeColumnRun(page)
    await placeUpright(page, i, j)

    // `fill="none"` rather than `"transparent"`: the latter is rgba(0,0,0,0), which still
    // hit-tests under `visiblePainted`. Belt and braces with the inert layer above -- the
    // same components are also rendered in the piece tray, outside that layer.
    const fills = await page.locator(`[data-piece="one"][data-at="${i},${j}"] rect[stroke="black"]`)
        .evaluateAll(els => els.map(el => el.getAttribute('fill')))
    expect(fills.length).toBeGreaterThan(0)
    expect(fills).not.toContain('transparent')
})

test('the piece tray is still selectable', async ({ page }) => {
    // The tray renders the same SVGs outside the inert layer, so `fill="none"` reaches
    // them too. Selecting the flat piece there must still work.
    await page.locator('[data-select-piece="2"]').click()

    const { i, j } = await freeColumnRun(page)
    const cell = await cellBox(page, i, j)
    // Right half of the cell: `highlightedPair` then prefers the neighbour to the right,
    // so the 2 lands at (i, j+1).
    await page.mouse.click(cell.x + cell.width * 0.75, cell.y + cell.height / 2)
    await expect(page.locator(`[data-piece="two"][data-at="${i},${j + 1}"]`)).toBeVisible()
})
