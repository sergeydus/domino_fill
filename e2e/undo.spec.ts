import { test, expect, type Page } from '@playwright/test'
import { openBoard, waitForBoard } from './openBoard'
import { playSolution } from './play'

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

test('reset clears every move at once, as one step Undo can take back', async ({ page }) => {
    const start = (await occupied(page)).size
    await placeOne(page)
    await placeOne(page)
    const played = await occupied(page)
    expect(played.size).toBe(start + 4)

    await reset(page).click()
    expect((await occupied(page)).size).toBe(start)

    // Changed on purpose (Undoable Reset): this asserted Undo disabled here, when Reset
    // emptied the history too. Now Undo puts every piece back, and focus stays on it.
    await expect(undo(page)).toBeEnabled()
    await undo(page).click()
    expect(await occupied(page)).toEqual(played)
    await expect(undo(page)).toBeFocused()
})

test.describe('Undoable Reset (its contract in NEXT-STEPS)', () => {
    test('Ctrl/Cmd+Z on the board undoes a Reset, and focus lands on the square it remembered', async ({ page }) => {
        // A piece placed from the keyboard, so the keyboard has a square for Reset to remember.
        const { i, j } = await freeRun(page)
        await page.locator(`[data-cell="${i},${j}"]`).focus()
        await page.keyboard.press(' ')
        await page.keyboard.press('ArrowDown')
        await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()

        await reset(page).click()
        await expect(page.locator('[data-piece="one"], [data-piece="two"]')).toHaveCount(0)

        // Back onto the board on another square, then the shortcut.
        const other = i === 0 && j === 0 ? '0,1' : '0,0'
        await page.locator(`[data-cell="${other}"]`).focus()
        await page.keyboard.press('Control+z')
        await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
        // Browser focus and the keyboard's square move together.
        await expect(page.locator(`[data-cell="${i},${j}"]`)).toBeFocused()
        await expect(page.locator(`[data-focus="${i},${j}"]`)).toHaveCount(1)
    })

    test('Play again, then Undo: the solved board and its card come back, with no second win', async ({ page }) => {
        // Count what the win sets off: its 25ms vibration and its sound.
        await page.evaluate(() => {
            const w = window as unknown as { wins: string[] }
            w.wins = []
            const nav = navigator as unknown as { vibrate?: (pattern: unknown) => boolean }
            const vibrate = nav.vibrate?.bind(navigator)
            nav.vibrate = (pattern: unknown) => {
                if (pattern === 25) w.wins.push('vibrate')
                return vibrate ? vibrate(pattern) : true
            }
            const play = HTMLMediaElement.prototype.play
            HTMLMediaElement.prototype.play = function () {
                if (this.src.includes('win')) w.wins.push('sound')
                return play.call(this)
            }
        })
        const count = (kind: string) => page.evaluate(k => (window as unknown as { wins: string[] }).wins.filter(w => w === k).length, kind)

        await playSolution(page)
        const card = page.locator('[data-completion-card]')
        await expect(card).toBeVisible()
        expect(await count('vibrate'), 'the win, once').toBe(1)
        // The sound is counted from here: the audio pool also plays every sound, the win's
        // included, silently on the first press to unlock it on iOS (feedback.ts), so the
        // total so far is not the number of wins.
        const sounds = await count('sound')
        const solved = await occupied(page)

        await page.locator('[data-replay]').click()
        await expect(card).toHaveCount(0)
        await undo(page).click()

        await expect(card).toBeVisible()
        expect(await occupied(page)).toEqual(solved)
        // Give a stray reaction time to fire, then count again.
        await page.waitForTimeout(300)
        expect(await count('vibrate'), 'not vibrated a second time').toBe(1)
        expect(await count('sound'), 'not sounded a second time').toBe(sounds)
    })

    test('a reload keeps what Reset and Undo left on the board, and not the history', async ({ page }) => {
        const start = await occupied(page)
        await placeOne(page)
        const played = await occupied(page)

        await reset(page).click()
        await page.reload()
        await waitForBoard(page)
        expect(await occupied(page), 'the Reset was saved').toEqual(start)
        await expect(undo(page), 'the history was not').toBeDisabled()

        await placeOne(page)
        const again = await occupied(page)
        await reset(page).click()
        await undo(page).click()
        expect(await occupied(page)).toEqual(again)
        await page.reload()
        await waitForBoard(page)
        expect(await occupied(page), 'the Undo was saved').toEqual(again)
        await expect(undo(page)).toBeDisabled()
        expect(played.size).toBe(start.size + 2)
    })
})

test('Ctrl+Z undoes through the board handler', async ({ page }) => {
    const { i, j } = await placeOne(page)
    await page.locator('.board-grid').focus()

    await page.keyboard.press('Control+z')

    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toHaveCount(0)
})

test('Ctrl+Shift+Z is not undo, because there is no redo', async ({ page }) => {
    // The redo chord on every platform that has one. Consuming it as a second undo would
    // take away another move just as the player asked for one back.
    const { i, j } = await placeOne(page)
    const placed = page.locator(`[data-piece="one"][data-at="${i},${j}"]`)
    await page.locator('.board-grid').focus()

    await page.keyboard.press('Control+Shift+z')
    await expect(placed).toBeVisible()

    await page.keyboard.press('Alt+Control+z')
    await expect(placed).toBeVisible()

    // ...and the unmodified chord still works, so the guard did not disable undo outright.
    await page.keyboard.press('Control+z')
    await expect(placed).toHaveCount(0)
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

/*
 * There is deliberately no browser test here for resetting a *completed* board.
 *
 * An earlier version claimed one and did not have it: it never completed the board, never
 * observed `completed`, and never asserted the shell was disabled -- it clicked an enabled
 * Reset on an ordinary board and called that a soft-lock test. Vacuous, and worse than
 * nothing, because it read as coverage.
 *
 * Completing a board here needs a solution to a shipped puzzle, which is a solver the
 * project does not have until P1-6. The contract -- shell inert, Reset outside it and
 * still enabled, clicking it clears completion and restores interaction -- is pinned in
 * tests/completedBoard.test.tsx against a genuinely completed session.
 *
 * **Deferred to row 15 (P1-4).** That row builds the completion path and its own Next
 * control, so a browser test that actually wins a game belongs with it.
 */
