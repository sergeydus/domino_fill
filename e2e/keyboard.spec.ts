import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { readBoard } from './play'

/**
 * The keyboard half of the placement verb (spec P1-1), in a real browser.
 *
 * The state machine itself is pinned in tests/keyboard.test.ts. What needs a browser is
 * everything around it: that the grid can actually be reached and focused, that the keys
 * arrive, that the board's feedback follows the focus, and that `preventDefault` is
 * applied only when the board used the key -- so arrows still scroll the page otherwise.
 *
 * P1-8 will take on focus *structure* (roving tabindex, roles, announcements). This is the
 * state machine and its visible consequences.
 */

const grid = (page: Page) => page.locator('.board-grid')
const focusRing = (page: Page) => page.locator('[data-focus]')

const focusedCell = async (page: Page) =>
    (await focusRing(page).getAttribute('data-focus'))

/** Move the focus to a specific cell with arrow keys, from wherever it is. */
const focusTo = async (page: Page, i: number, j: number) => {
    await grid(page).focus()
    await page.keyboard.press('ArrowDown')   // lands the focus at 0,0
    await expect(focusRing(page)).toHaveAttribute('data-focus', '0,0')
    for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown')
    for (let k = 0; k < j; k++) await page.keyboard.press('ArrowRight')
    await expect(focusRing(page)).toHaveAttribute('data-focus', `${i},${j}`)
}

/** Cells free enough to place into, found rather than assumed. */
const freeRun = async (page: Page) => {
    const n = Math.sqrt(await page.locator('[data-cell]').count())
    const taken = new Set(await page.locator('[data-piece]').evaluateAll(
        els => els.flatMap(el => {
            const [i, j] = el.getAttribute('data-at')!.split(',').map(Number)
            const kind = el.getAttribute('data-piece')
            const own = [`${i},${j}`]
            if (kind === 'one') own.push(`${i + 1},${j}`)
            if (kind === 'two') own.push(`${i},${j - 1}`)
            return own
        })
    ))
    for (let i = 1; i + 1 < n; i++) {
        for (let j = 1; j + 1 < n; j++) {
            const around = [`${i},${j}`, `${i + 1},${j}`, `${i - 1},${j}`, `${i},${j - 1}`, `${i},${j + 1}`]
            if (around.every(c => !taken.has(c))) return { i, j }
        }
    }
    throw new Error('no open cell; the fixture board changed')
}

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('the board can be focused and entered from the keyboard', async ({ page }) => {
    await grid(page).focus()
    await expect(grid(page)).toBeFocused()

    // Nothing is focused inside the board until a key arrives.
    await expect(focusRing(page)).toHaveCount(0)

    await page.keyboard.press('ArrowDown')
    await expect(focusRing(page)).toHaveAttribute('data-focus', '0,0')
})

test('arrows move the focus without placing anything', async ({ page }) => {
    await focusTo(page, 2, 2)
    await expect(page.locator('[data-piece="one"]')).toHaveCount(0)
    await expect(page.locator('[data-piece="two"]')).toHaveCount(0)
})

test('the focus stops at the edge', async ({ page }) => {
    await grid(page).focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowLeft')

    expect(await focusedCell(page)).toBe('0,0')
})

test('Space offers the candidates, and an arrow places', async ({ page }) => {
    const { i, j } = await freeRun(page)
    await focusTo(page, i, j)

    await page.keyboard.press(' ')
    await expect(page.locator(`[data-anchor="${i},${j}"]`)).toBeVisible()
    await expect(page.locator('[data-candidate]').first()).toBeVisible()

    await page.keyboard.press('ArrowDown')
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
    await expect(page.locator('[data-candidate]')).toHaveCount(0)
})

test('Enter works the same as Space', async ({ page }) => {
    const { i, j } = await freeRun(page)
    await focusTo(page, i, j)

    await page.keyboard.press('Enter')
    await expect(page.locator(`[data-anchor="${i},${j}"]`)).toBeVisible()
})

test('the focus stays on the anchor after placing', async ({ page }) => {
    const { i, j } = await freeRun(page)
    await focusTo(page, i, j)
    await page.keyboard.press(' ')
    await page.keyboard.press('ArrowRight')

    await expect(page.locator(`[data-piece="two"][data-at="${i},${j + 1}"]`)).toBeVisible()
    expect(await focusedCell(page)).toBe(`${i},${j}`)
})

test('Escape leaves the offer, and the focus stays put', async ({ page }) => {
    const { i, j } = await freeRun(page)
    await focusTo(page, i, j)
    await page.keyboard.press(' ')
    await expect(page.locator('[data-candidate]').first()).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-candidate]')).toHaveCount(0)
    await expect(page.locator('[data-anchor]')).toHaveCount(0)
    expect(await focusedCell(page)).toBe(`${i},${j}`)

    // And arrows move the focus again, rather than placing.
    await page.keyboard.press('ArrowDown')
    expect(await focusedCell(page)).toBe(`${i + 1},${j}`)
    await expect(page.locator('[data-piece="one"]')).toHaveCount(0)
})

test('Space does not remove -- that is Delete and Backspace alone', async ({ page }) => {
    // Space had been delegating to the pointer's tap, which removes on an occupied cell.
    // The keyboard table gives Space exactly one job: set the anchor.
    const { i, j } = await freeRun(page)
    await focusTo(page, i, j)
    await page.keyboard.press(' ')
    await page.keyboard.press('ArrowDown')

    const placed = page.locator(`[data-piece="one"][data-at="${i},${j}"]`)
    await expect(placed).toBeVisible()

    await page.keyboard.press(' ')
    await expect(placed).toBeVisible()
    await expect(page.locator('[data-anchor]')).toHaveCount(0)
})

test('Delete removes the domino under the focus', async ({ page }) => {
    const { i, j } = await freeRun(page)
    await focusTo(page, i, j)
    await page.keyboard.press(' ')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()

    await page.keyboard.press('Delete')
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toHaveCount(0)
})

test('a whole domino can be placed and removed with no pointer input at all', async ({ page }) => {
    const { i, j } = await freeRun(page)

    await focusTo(page, i, j)
    await page.keyboard.press(' ')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()

    // From the other half, which is where a keyboard user is likely to be.
    await page.keyboard.press('ArrowDown')
    expect(await focusedCell(page)).toBe(`${i + 1},${j}`)
    await page.keyboard.press('Backspace')

    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toHaveCount(0)
    // Focus follows the removal to the pair's anchor.
    expect(await focusedCell(page)).toBe(`${i},${j}`)
})

test('arrows the board uses do not also scroll the page', async ({ page }) => {
    // The page is taller than the viewport at these sizes, so there is somewhere to scroll.
    await page.evaluate(() => window.scrollTo(0, 0))
    await focusTo(page, 2, 2)

    expect(await page.evaluate(() => window.scrollY)).toBe(0)
})

test('keys the board does not use are left to the page', async ({ page }) => {
    const scrollable = await page.evaluate(() =>
        document.documentElement.scrollHeight > document.documentElement.clientHeight)
    test.skip(!scrollable, 'the page does not scroll at this size')

    await grid(page).focus()
    await page.keyboard.press('ArrowDown')  // enters the board
    await page.keyboard.press('End')        // not a board key

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

test('a refused Space or Enter is still the board\'s: shown, and the phone page does not scroll', async ({ page }) => {
    // Phone-sized here, since this file does not run in the phone project; the page
    // overflows at this size, which is checked below rather than assumed.
    await page.setViewportSize({ width: 360, height: 640 })
    const { size, board } = await readBoard(page)
    let rock: [number, number] | null = null
    for (let i = 0; i < size && !rock; i++) for (let j = 0; j < size && !rock; j++) if (board[i][j] === -1) rock = [i, j]
    if (!rock) throw new Error('today\'s board has no rock') // every published easy-1 has at least 8

    // An occupied cell to refuse on: an upright piece placed from the keyboard.
    const { i, j } = await freeRun(page)
    await focusTo(page, i, j)
    await page.keyboard.press(' ')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()

    // Read at the window, after React's handler has run.
    await page.evaluate(() => {
        const w = window as unknown as { claimed: string[] }
        w.claimed = []
        window.addEventListener('keydown', e => w.claimed.push(`${e.shiftKey ? 'Shift+' : ''}${e.key}:${e.defaultPrevented}`))
    })
    const claimed = () => page.evaluate(() => (window as unknown as { claimed: string[] }).claimed)
    const scroll = () => page.evaluate(() => ({
        y: window.scrollY,
        room: document.documentElement.scrollHeight - window.innerHeight - window.scrollY,
    }))

    const refusals = [[rock, ' '], [rock, 'Enter'], [[i, j], ' '], [[i, j], 'Enter']] as const
    for (const [[a, b], key] of refusals) {
        // Programmatic focus puts the keyboard on the square (see BoardSquare's `onFocus`).
        await page.locator(`[data-cell="${a},${b}"]`).focus()
        const start = await scroll()
        expect(start.room, 'somewhere for Space to scroll to').toBeGreaterThan(0)
        const rejected = Number(await grid(page).getAttribute('data-rejected') ?? 0)

        await page.keyboard.press(key)
        // Refused, once, here: the grid counts every refusal, and the mark names the square.
        await expect(grid(page), `${key} on ${a},${b}`).toHaveAttribute('data-rejected', String(rejected + 1))
        await expect(page.locator('[data-refused]')).toHaveAttribute('data-refused', `${a},${b}`)
        // Keyboard scrolling is animated, so a scroll would not show at once.
        await page.waitForTimeout(600)
        expect((await scroll()).y, `${key} on ${a},${b}`).toBe(start.y)
    }
    expect(await claimed()).toEqual([' :true', 'Enter:true', ' :true', 'Enter:true'])
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()

    // A chord is still the browser's: Shift+Space is not claimed, even on a board square.
    await page.keyboard.press('Shift+Space')
    expect((await claimed()).at(-1)).toBe('Shift+ :false')
})
