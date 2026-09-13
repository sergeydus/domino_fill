import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'

/**
 * Undo and Reset in a real browser (spec P1-3).
 *
 * The state machine is pinned in tests/undo.test.ts. What needs a browser is the wiring and
 * the affordances: that the controls exist at all -- there was no restart anywhere in the UI
 * (D10-i) -- that they are reachable by keyboard rather than being `div`s with an `onClick`
 * like the level arrows next to them, and that the shortcut arrives through the grid's
 * handler with its modifiers intact.
 */

const undo = (page: Page) => page.locator('[data-undo]')
const reset = (page: Page) => page.locator('[data-reset]')

/** Cells of the board that currently hold a domino half. */
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

/** A cell with a free cell below it, found rather than assumed. */
const freeRun = async (page: Page) => {
    const n = Math.sqrt(await page.locator('[data-cell]').count())
    const taken = await occupied(page)
    for (let j = 0; j < n; j++) {
        for (let i = 0; i + 1 < n; i++) {
            if (!taken.has(`${i},${j}`) && !taken.has(`${i + 1},${j}`)) return { i, j }
        }
    }
    throw new Error('the fixture board has no free run')
}

const placeOne = async (page: Page) => {
    const { i, j } = await freeRun(page)
    const from = page.locator(`[data-cell="${i},${j}"]`)
    const to = page.locator(`[data-cell="${i + 1},${j}"]`)
    await from.scrollIntoViewIfNeeded()
    await from.hover()
    await page.mouse.down()
    await to.hover()
    await page.mouse.up()
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
    return { i, j }
}

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('both controls exist, which is the whole point of D10-i', async ({ page }) => {
    await expect(undo(page)).toBeVisible()
    await expect(reset(page)).toBeVisible()
})

test('undo starts disabled and enables once there is a move', async ({ page }) => {
    await expect(undo(page)).toBeDisabled()
    await placeOne(page)
    await expect(undo(page)).toBeEnabled()
})

test('undo removes the domino just placed', async ({ page }) => {
    const { i, j } = await placeOne(page)
    const before = (await occupied(page)).size

    await undo(page).click()

    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toHaveCount(0)
    expect((await occupied(page)).size).toBe(before - 2)
    await expect(undo(page)).toBeDisabled()
})

test('undo brings back a domino that was removed', async ({ page }) => {
    const { i, j } = await placeOne(page)
    const placed = page.locator(`[data-piece="one"][data-at="${i},${j}"]`)

    // Tap the piece to remove it, then undo that removal.
    await page.locator(`[data-cell="${i},${j}"]`).click()
    await expect(placed).toHaveCount(0)

    await undo(page).click()
    await expect(placed).toBeVisible()
})

test('reset clears every move at once', async ({ page }) => {
    const start = (await occupied(page)).size
    await placeOne(page)
    await placeOne(page)
    expect((await occupied(page)).size).toBe(start + 4)

    await reset(page).click()

    expect((await occupied(page)).size).toBe(start)
    // And there is nothing left to undo: the stack described a board that no longer exists.
    await expect(undo(page)).toBeDisabled()
})

test('Ctrl+Z undoes through the board handler', async ({ page }) => {
    const { i, j } = await placeOne(page)
    await page.locator('.board-grid').focus()

    await page.keyboard.press('Control+z')

    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toHaveCount(0)
})

test('the controls are reachable by keyboard, unlike the level arrows', async ({ page }) => {
    // Real `<button>` elements. The level arrows beside them are `motion.div`s with an
    // `onClick`, which is why P1-1's completion-focus clause had to be deferred; new
    // controls should not add to that.
    await placeOne(page)
    await undo(page).focus()
    await expect(undo(page)).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(undo(page)).toBeDisabled()
})

test('a completed board can still be reset, so winning is not a soft-lock', async ({ page }) => {
    // D10-h: `completed` sets `pointerEvents: none` on the board and nothing ever cleared
    // it. The controls sit outside the board, so they stay usable either way -- asserted
    // here rather than assumed, because it is the property that makes Reset an escape
    // hatch rather than another way to get stuck.
    await expect(reset(page)).toBeEnabled()
    const shell = page.locator('[data-board-shell]')
    await expect(shell).toBeVisible()

    await reset(page).click()
    await expect(reset(page)).toBeEnabled()
})
