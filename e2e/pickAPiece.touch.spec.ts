import { test, expect, type Page, type CDPSession } from '@playwright/test'
import { openBoard } from './openBoard'
import { readBoard } from './play'

/**
 * Pick a piece mode on touch (NEXT-STEPS.md, the implementation contract).
 *
 * Runs in the touch-enabled project (its name ends `touch.spec.ts`), so pointers here are
 * real touch pointers, with implicit capture and the compatibility click that follows a
 * `pointerup`. Two things only touch can show: a tap places the held piece exactly once,
 * and a long-press -- which fires `contextmenu` -- never switches the piece.
 */

let cdp: CDPSession

type Point = { x: number, y: number }

const send = (type: string, touchPoints: Point[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints } as never)

const centreOf = async (page: Page, i: number, j: number): Promise<Point> => {
    const box = (await page.locator(`[data-cell="${i},${j}"]`).boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const placed = (page: Page) => page.locator('[data-piece="one"], [data-piece="two"]')
const held = (page: Page, piece: 'upright' | 'flat') => page.locator(`[data-held-piece="${piece}"]`)

/** A cell with room above and below, so a tap has an unambiguous tie-break answer. */
const bothFit = async (page: Page) => {
    const { size, board } = await readBoard(page)
    const free = (i: number, j: number) => i >= 0 && i < size && board[i][j] === null
    for (let i = 1; i + 1 < size; i++) {
        for (let j = 0; j < size; j++) if (free(i, j) && free(i - 1, j) && free(i + 1, j)) return [i, j] as const
    }
    throw new Error('today\'s board has no cell with room above and below')
}

test.beforeEach(async ({ page }) => {
    cdp = await page.context().newCDPSession(page)
    await openBoard(page)
    await page.locator('[data-controls-mode]').tap()
    await expect(page.locator('[data-piece-picker]')).toBeVisible()
})

test('the context really is touch-enabled', async ({ page }) => {
    // Guards the file: in a desktop context everything below would pass while testing nothing.
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0)
})

test('a tap places the held piece once; the compatibility click does not remove it', async ({ page }) => {
    const [i, j] = await bothFit(page)
    const at = await centreOf(page, i, j)
    await send('touchStart', [at])
    await send('touchEnd', [])

    const piece = page.locator(`[data-piece="one"][data-at="${i},${j}"]`)
    await expect(piece).toBeVisible()
    // Long enough for a compatibility click to arrive at a cell that is now occupied, where
    // a click handler running the tap would remove what was just placed.
    await page.waitForTimeout(500)
    await expect(piece).toBeVisible()
    await expect(placed(page)).toHaveCount(1)
})

test('the picker is the switch on touch', async ({ page }) => {
    await held(page, 'flat').tap()
    await expect(held(page, 'flat')).toHaveAttribute('aria-checked', 'true')
    await expect(held(page, 'upright')).toHaveAttribute('aria-checked', 'false')
})

test('a long-press never switches the piece', async ({ page }) => {
    const [i, j] = await bothFit(page)
    await page.evaluate(() => {
        const w = window as unknown as { menus: number }
        w.menus = 0
        window.addEventListener('contextmenu', () => { w.menus++ })
    })

    // A real long-press, held well past the platform's threshold.
    const at = await centreOf(page, i, j)
    await send('touchStart', [at])
    await page.waitForTimeout(1200)
    await send('touchEnd', [])
    await expect(held(page, 'upright')).toHaveAttribute('aria-checked', 'true')

    // Whether this emulator fires `contextmenu` for a long-press is its own business, so
    // the event a long-press raises is also dispatched directly, on a cell, as a touch
    // browser would: it must not switch the piece either.
    await page.locator(`[data-cell="${i - 1},${j}"]`).dispatchEvent('contextmenu', { bubbles: true, cancelable: true })
    expect(await page.evaluate(() => (window as unknown as { menus: number }).menus)).toBeGreaterThan(0)
    await expect(held(page, 'upright')).toHaveAttribute('aria-checked', 'true')
})
