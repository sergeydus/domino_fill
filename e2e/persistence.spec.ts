import { test, expect, type Page } from '@playwright/test'
import { openBoard, waitForBoard } from './openBoard'
import { drag, playSolution } from './play'
import { KEY_PREFIX } from '../app/stores/progressStorage'

/**
 * Progress survives a reload, in a real browser (spec P1-7).
 *
 * This suite is not optional cover for the unit tests — it is the only place the feature is
 * exercised against a real `localStorage` at all. Node 25 ships a `localStorage` global with
 * no working methods, which shadows jsdom's, so every unit test of persistence runs against
 * an in-memory double installed in `tests/setup.ts`. A double cannot tell us that the
 * production guards let a real browser through, that a record actually round-trips JSON, or
 * that a restored board is the one the player left. Only this can.
 */

/** Where the board holds a piece, as the DOM reports it. */
const pieces = async (page: Page) =>
    (await page.locator('[data-piece]:not([data-piece="rock"])').evaluateAll(
        els => els.map(el => `${el.getAttribute('data-piece')}@${el.getAttribute('data-at')}`)
    )).sort()

/** A free cell with a free cell below it, so one downward drag is always legal. */
const freeRun = async (page: Page) => {
    const n = Math.sqrt(await page.locator('[data-cell]').count())
    const rocks = new Set(await page.locator('[data-piece="rock"]').evaluateAll(
        els => els.map(el => el.getAttribute('data-at')!)
    ))
    for (let j = 0; j < n; j++) {
        for (let i = 0; i + 1 < n; i++) {
            if (!rocks.has(`${i},${j}`) && !rocks.has(`${i + 1},${j}`)) return { i, j }
        }
    }
    throw new Error('the served board has no free vertical run')
}

/** Reload the way a player does, keeping the origin's storage. */
const reload = async (page: Page) => {
    await page.reload()
    await waitForBoard(page)
}

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('a move is still there after a reload', async ({ page }) => {
    const { i, j } = await freeRun(page)
    await drag(page, [i, j], [i + 1, j])

    const before = await pieces(page)
    expect(before.length, 'the move landed').toBeGreaterThan(0)

    await reload(page)

    expect(await pieces(page)).toEqual(before)
})

test('the save reaches real browser storage, under its own versioned key', async ({ page }) => {
    // Named explicitly: a feature that silently no-ops is exactly what the broken Node
    // global would produce, and the unit tests cannot see it.
    const { i, j } = await freeRun(page)
    await drag(page, [i, j], [i + 1, j])

    const keys = await page.evaluate(prefix =>
        Object.keys(localStorage).filter(key => key.startsWith(prefix)), KEY_PREFIX)

    expect(keys, `nothing was written under ${KEY_PREFIX}`).not.toHaveLength(0)
    // One key per puzzle, and only the puzzle that was played.
    expect(keys).toHaveLength(1)

    const raw = await page.evaluate(key => localStorage.getItem(key), keys[0])
    const record = JSON.parse(raw!)
    expect(typeof record.savedAt, 'an absolute instant, not a day string').toBe('number')
    expect(record.board).toBeDefined()
})

test('solving carries over, and the next visit starts on the next puzzle', async ({ page }) => {
    /*
     * D10-i's remaining half, which needed persisted completion before it could mean
     * anything: coming back lands on the first puzzle you have *not* finished, rather than on
     * the one you just solved.
     *
     * Probed while writing this, because the first version of this test assumed the opposite
     * and asserted the celebration would still be on screen: after solving level 1 and
     * reloading, the storage really does hold `easy-1: true`, and the board shown is level 2,
     * empty. The behaviour is the specified one; the expectation was wrong.
     */
    await playSolution(page)
    await expect(page.locator('[role="status"]')).toContainText(/solved/i)

    await reload(page)

    await expect(page.locator('[role="status"]'), 'a fresh puzzle, not the finished one')
        .toHaveCount(0)
    expect(await pieces(page), 'the next puzzle starts empty').toEqual([])

    // And the solved one is still solved when the player goes back to it.
    await page.locator('[data-level="previous"]').click()
    await expect(page.locator('[role="status"]')).toContainText(/solved/i)
})

test('resetting clears the save, so a reload does not undo the reset', async ({ page }) => {
    const { i, j } = await freeRun(page)
    await drag(page, [i, j], [i + 1, j])
    expect((await pieces(page)).length).toBeGreaterThan(0)

    await page.locator('[data-reset]').click()
    expect(await pieces(page)).toEqual([])

    await reload(page)

    // The saved board has to follow the reset. Otherwise Reset looks like it worked and the
    // next visit quietly puts every piece back.
    expect(await pieces(page)).toEqual([])
})

test('an undo is saved too, not just a placement', async ({ page }) => {
    const { i, j } = await freeRun(page)
    await drag(page, [i, j], [i + 1, j])
    await page.locator('[data-undo]').click()
    expect(await pieces(page)).toEqual([])

    await reload(page)

    expect(await pieces(page)).toEqual([])
})

test('corrupt storage costs the save, not the game', async ({ page }) => {
    // Storage survives upgrades and is editable from a console; a player should get a fresh
    // board, not a blank screen.
    await page.evaluate(prefix => {
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith(prefix)) localStorage.setItem(key, '{ not json')
        }
    }, KEY_PREFIX)

    await reload(page)

    await expect(page.locator('.board-grid')).toBeVisible()
    expect(await pieces(page)).toEqual([])
})

test('storage that refuses to be written does not break play', async ({ page }) => {
    // Safari private mode and a full quota both throw from `setItem`. The move must still
    // land: losing the save is not a reason to lose the move.
    await page.addInitScript(() => {
        Storage.prototype.setItem = function setItem() { throw new Error('QuotaExceededError') }
    })
    await reload(page)

    const { i, j } = await freeRun(page)
    await drag(page, [i, j], [i + 1, j])

    expect((await pieces(page)).length).toBeGreaterThan(0)
})

/** Where the rocks are: a fingerprint of which puzzle is on screen. */
const rockLayout = async (page: Page) =>
    (await page.locator('[data-piece="rock"]').evaluateAll(
        els => els.map(el => el.getAttribute('data-at')!)
    )).sort().join(' ')

test('midnight brings a different puzzle, not just another request', async ({ page, context }) => {
    /*
     * The rollover trigger, driven by the browser's own clock — and now assertable all the way
     * through to the content.
     *
     * An earlier version of this test could only count requests, and said so: the served board
     * was chosen from the *server's* date, which a browser clock cannot move. Now the client
     * sends its own local day key, so moving the browser past midnight really does change
     * which puzzle comes back. That is the point of passing the day key, and this demonstrates
     * it end to end rather than inferring it from a POST.
     */
    await context.clock.install({ time: new Date('2026-09-15T12:00:00') })
    await reload(page)
    const before = await rockLayout(page)

    // `hh:mm:ss`. Probed the hard way: `'13:00'` is thirteen *minutes*, which never reaches
    // midnight and leaves the test asserting nothing.
    await context.clock.fastForward('13:00:00')

    await expect.poll(() => rockLayout(page), { timeout: 10_000 }).not.toBe(before)
})
