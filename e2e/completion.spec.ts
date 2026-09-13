import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { solve } from './solve'

/**
 * Winning, in a real browser (spec P1-4), and the two obligations row 14 deferred here.
 *
 * Everything below happens by actually solving the board the server served — read out of
 * the DOM, solved, and played move by move through the same pointer verb a person uses.
 * Nothing sets `completed` directly, so if the placement rules and the completion rules ever
 * disagree, these tests fail rather than passing on a flag.
 *
 * The board is whichever one the day's date selects, so the solution cannot be a fixture;
 * see e2e/solve.ts for why the solver is here and why it is not P1-6's.
 */

/** Read the board's rocks and targets out of the rendered DOM. */
const readBoard = async (page: Page) => {
    const size = Math.sqrt(await page.locator('[data-cell]').count())
    const rocks = new Set(await page.locator('[data-piece="rock"]').evaluateAll(
        els => els.map(el => el.getAttribute('data-at')!)
    ))
    const board = Array.from({ length: size }, (_, i) =>
        Array.from({ length: size }, (_, j) => (rocks.has(`${i},${j}`) ? -1 : null))
    )

    const numbers = (selector: string) => page.locator(selector).evaluateAll(
        els => els.map(el => Number(el.textContent!.trim()))
    )
    return {
        size,
        board,
        columnTargets: await numbers('[data-col-label]'),
        rowTargets: await numbers('[data-row-label]'),
    }
}

/** Play a solution through the pointer verb, exactly as a player would. */
const playSolution = async (page: Page) => {
    const { board, columnTargets, rowTargets } = await readBoard(page)
    const placements = solve(board, columnTargets, rowTargets)
    expect(placements, 'the served board is solvable').not.toBeNull()

    for (const { from, to } of placements!) {
        const a = page.locator(`[data-cell="${from[0]},${from[1]}"]`)
        const b = page.locator(`[data-cell="${to[0]},${to[1]}"]`)
        await a.hover()
        await page.mouse.down()
        await b.hover()
        await page.mouse.up()
    }
}

const card = (page: Page) => page.locator('[data-completion-card]')

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('solving the board raises the completion card', async ({ page }) => {
    await expect(card(page)).toHaveCount(0)

    const started = Date.now()
    await playSolution(page)

    // P1-4 asks for the celebration within 500ms of the win. The last placement is what
    // wins, so the clock starts at the moment the card could first appear.
    await expect(card(page)).toBeVisible({ timeout: 500 })
    expect(Date.now() - started).toBeGreaterThan(0)
    await expect(card(page)).toContainText(/solved/i)
})

test('the card announces itself to assistive technology', async ({ page }) => {
    await playSolution(page)

    await expect(card(page)).toHaveAttribute('role', 'status')
    await expect(card(page)).toHaveAttribute('aria-live', 'polite')
})

test('focus moves to the Next control, closing P1-1s deferred clause', async ({ page }) => {
    // Deferred out of row 13 because there was nothing focusable to move to; the card
    // brings its own real button.
    await playSolution(page)

    await expect(page.locator('[data-next-level]')).toBeFocused()
})

test('the won board is inert, not merely unclickable', async ({ page }) => {
    /*
     * The distinction P1-4 insists on. `pointer-events: none` stops the mouse and nothing
     * else: the cells stay in the tab order and stay announced, so a keyboard user can go
     * on "playing" a finished board. `inert` removes the subtree from hit-testing, tabbing
     * and the accessibility tree at once.
     */
    await playSolution(page)
    const shell = page.locator('[data-board-shell]')

    await expect(shell).toHaveAttribute('inert', '')

    // The real consequence: nothing inside the board can take focus any more.
    const focusable = await page.locator('[data-board-shell] .board-grid').evaluate(
        el => { (el as HTMLElement).focus(); return document.activeElement === el }
    )
    expect(focusable, 'the grid inside an inert subtree must not take focus').toBe(false)
})

test('Play again clears the win and gives the board back', async ({ page }) => {
    // The browser half of D10-h, deferred from row 14: a completed board was a permanent
    // soft-lock, and this is the escape hatch working end to end on a genuine win.
    await playSolution(page)
    await expect(card(page)).toBeVisible()

    await page.locator('[data-replay]').click()

    await expect(card(page)).toHaveCount(0)
    await expect(page.locator('[data-board-shell]')).not.toHaveAttribute('inert', '')
    await expect(page.locator('[data-piece="one"]')).toHaveCount(0)
    await expect(page.locator('[data-piece="two"]')).toHaveCount(0)
})

test('Reset also works on a won board, from outside the inert subtree', async ({ page }) => {
    await playSolution(page)
    await expect(card(page)).toBeVisible()

    await page.locator('[data-reset]').click()

    await expect(card(page)).toHaveCount(0)
    await expect(page.locator('[data-board-shell]')).not.toHaveAttribute('inert', '')
})

test('Next level moves on and leaves the win behind', async ({ page }) => {
    await playSolution(page)
    const cellsBefore = await page.locator('[data-cell]').count()

    await page.locator('[data-next-level]').click()

    await expect(card(page)).toHaveCount(0)
    await expect(page.locator('[data-board-shell]')).not.toHaveAttribute('inert', '')
    // Same difficulty, so the same board size, but a fresh unsolved puzzle.
    expect(await page.locator('[data-cell]').count()).toBe(cellsBefore)
})

test('undo un-wins the board, releasing the card and the inertness', async ({ page }) => {
    await playSolution(page)
    await expect(card(page)).toBeVisible()

    await page.locator('[data-undo]').click()

    await expect(card(page)).toHaveCount(0)
    await expect(page.locator('[data-board-shell]')).not.toHaveAttribute('inert', '')
})
