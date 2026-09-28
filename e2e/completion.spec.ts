import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { drag, playSolution, solutionFor } from './play'

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

/**
 * Play everything except the winning move, then hold the pointer down over the cell that
 * will complete it.
 *
 * This is what makes the 500ms budget measurable at all. An earlier version started its
 * clock before the *whole* puzzle was played and then waited with a 500ms locator timeout,
 * so the window opened only once every move was already in — it could not have failed
 * however slow the celebration was.
 */
const playToTheBrink = async (page: Page) => {
    const placements = await solutionFor(page)
    for (const { from, to } of placements.slice(0, -1)) await drag(page, from, to)

    const last = placements[placements.length - 1]
    await page.locator(`[data-cell="${last.from[0]},${last.from[1]}"]`).hover()
    await page.mouse.down()
    await page.locator(`[data-cell="${last.to[0]},${last.to[1]}"]`).hover()
    // The pointer is now down over the releasing cell; `mouse.up()` wins the game.
}

/**
 * Release the winning move and measure, **in the page**, when the celebration is actually
 * presented: attached, finished animating, and wholly inside the viewport.
 *
 * The clock starts inside a one-shot `pointerup` listener, not when `page.evaluate` returns.
 * An earlier version set `t0` in the evaluate, which then had to return to Node before Node
 * could send the release -- so the measurement silently included a round trip. Conservative,
 * but it made the reported number not quite the thing being claimed, and on a loaded machine
 * it could fail a celebration that was in fact prompt.
 *
 * Opacity is checked because Playwright counts a fully transparent element as visible, so an
 * animation that never ran would satisfy `toBeVisible` throughout. Containment is *full*,
 * not any one-pixel intersection: a card hanging off the bottom of the screen has not been
 * presented, and at 360x640 that was really happening before the card learned to scroll
 * itself into view.
 */
const msUntilCelebrated = async (page: Page, threshold = 0.99) => {
    await page.evaluate((opacityThreshold) => {
        const w = window as unknown as { celebrated: number | null, watching: boolean }
        w.celebrated = null
        w.watching = true

        /*
         * Armed before the release, in the **capture** phase, and timed from the event's
         * own `timeStamp`.
         *
         * Both details matter and each was got wrong once. A bubble-phase listener on
         * `window` runs *after* React's root handler, so the application's entire response
         * to the winning move -- placement, completion, render -- happened before `t0` was
         * read: measured, an 800ms synchronous stall inside `onPointerUp` still reported a
         * ~300ms celebration. Capture runs before anything in the tree.
         *
         * `event.timeStamp` is the browser's timestamp for when the event was *created*,
         * on the same origin as `performance.now()`, which is earlier still than any
         * listener could observe. Between them, the clock starts at the winning move and
         * the number covers the whole response to it, not just the animation afterwards.
         */
        window.addEventListener('pointerup', (event) => {
            const t0 = event.timeStamp
            const tick = () => {
                const card = document.querySelector('[data-completion-card]')
                if (card) {
                    const style = getComputedStyle(card)
                    const rect = card.getBoundingClientRect()
                    const contained = rect.width > 0 && rect.height > 0
                        && rect.top >= 0 && rect.left >= 0
                        && rect.bottom <= window.innerHeight
                        && rect.right <= window.innerWidth
                    if (parseFloat(style.opacity) >= opacityThreshold && contained) {
                        w.celebrated = performance.now() - t0
                        w.watching = false
                        return
                    }
                }
                // Keep looking well past the budget, so a slow celebration reports its real
                // time instead of timing out with no number.
                if (performance.now() - t0 < 5_000) requestAnimationFrame(tick)
                else w.watching = false
            }
            requestAnimationFrame(tick)
        }, { once: true, capture: true })
    }, threshold)

    await page.mouse.up()

    await expect.poll(
        () => page.evaluate(() => !(window as unknown as { watching: boolean }).watching),
        { timeout: 8_000 },
    ).toBe(true)

    return page.evaluate(() => (window as unknown as { celebrated: number | null }).celebrated)
}

const card = (page: Page) => page.locator('[data-completion-card]')

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('solving the board raises the completion card', async ({ page }) => {
    await expect(card(page)).toHaveCount(0)
    await playSolution(page)

    await expect(card(page)).toBeVisible()
    await expect(card(page)).toContainText(/solved/i)
})

test('the celebration is presented within P1-4s 500ms budget', async ({ page }) => {
    /*
     * The budget, measured from the winning move rather than from the end of the game.
     *
     * Three conditions together, because any one alone is satisfiable by a card nobody can
     * see: attached, opacity finished, and *wholly* within the viewport. Measured -- the
     * card attaches at ~13ms at opacity 0.06 and finishes at ~313ms, so `toBeVisible` alone
     * would have accepted it 300ms before it was legible; and at 360x640 it sat at
     * top 532 / bottom 652 of a 640px viewport, 90% visible with its buttons clipped, which
     * a one-pixel-intersection test would have called presented.
     */
    await playToTheBrink(page)

    const ms = await msUntilCelebrated(page)

    expect(ms, 'the celebration was never presented').not.toBeNull()
    expect(ms!, `celebrated after ${Math.round(ms!)}ms`).toBeLessThan(500)
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
