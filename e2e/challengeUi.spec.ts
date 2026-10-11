import { test, expect, type Page } from '@playwright/test'
import { BASE_URL, VISUAL_URL } from './server'
import { pinDay, pinDayAcrossReloads, LATE_IN_A_MONTH } from './calendar'
import { playSolution } from './play'

/*
 * Slice 3a on screen, in a real browser: `/visual/daily` is the real game with the Daily
 * Challenge switched on (rule 20), the real corpus, coordinator and storage. Each test pins
 * the day before the page loads, and starts from a fresh context, so from no attempts.
 *
 * Times are read from the page and compared on the same page only: never across pages.
 */
test.use({ baseURL: VISUAL_URL })

const open = async (page: Page, date = LATE_IN_A_MONTH, pin = pinDay) => {
    await pin(page, date)
    await page.addInitScript(() => localStorage.setItem('hasSeenTutorial', 'true'))
    await page.goto('/visual/daily')
    await expect(page.locator('[data-challenge-cover="ready"]')).toBeVisible({ timeout: 15_000 })
}
const start = async (page: Page) => {
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('grid')).toBeVisible()
}
const clock = (page: Page) => page.locator('[data-challenge-clock]')
/** The clock's reading in whole seconds, from its leading `m:ss` or `h:mm:ss`. */
const seconds = async (page: Page) => {
    const text = (await clock(page).textContent()) ?? ''
    const match = /^(?:(\d+):)?(\d+):(\d\d)/.exec(text)
    if (!match) throw new Error(`no time in the clock line: ${text}`)
    return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

test('a covered board puts nothing of the puzzle on the page, nor in the accessibility tree', async ({ page }) => {
    await open(page)
    await expect(page.locator('[data-cell]')).toHaveCount(0)
    await expect(page.locator('[data-row-label], [data-col-label], [data-piece="rock"]')).toHaveCount(0)
    await expect(page.getByRole('grid')).toHaveCount(0)
    const tree = await page.locator('body').ariaSnapshot()
    expect(tree).not.toMatch(/grid|Domino board|rock/i)
    expect(tree).toMatch(/button "Start"/)
    await expect(clock(page)).toHaveText('0:00')
    for (const name of ['Check', 'Hint', 'Undo', 'Reset']) {
        await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
    }
})

test('Start from the keyboard reveals the board and puts the keyboard on it', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Start', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('grid')).toBeVisible()
    await expect.poll(() => page.evaluate(() =>
        document.querySelector('[role="grid"]')?.contains(document.activeElement) ?? false)).toBe(true)
})

test('Start swaps the cover for a board of exactly its size, and nothing else moves', async ({ page }) => {
    await open(page)
    const coverBox = await page.locator('[data-challenge-cover]').boundingBox()
    const legendBefore = await page.locator('[data-legend]').boundingBox()
    await start(page)
    const shellBox = await page.locator('[data-board-shell]').boundingBox()
    const legendAfter = await page.locator('[data-legend]').boundingBox()
    expect(coverBox).not.toBeNull()
    for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(shellBox![key] - coverBox![key]), `board ${key}`).toBeLessThanOrEqual(0.5)
        expect(Math.abs(legendAfter![key] - legendBefore![key]), `legend ${key}`).toBeLessThanOrEqual(0.5)
    }
})

test('the clock runs, survives a reload without restarting, and a solve shows its time', async ({ page }) => {
    // One offset for the whole test: \`pinDay\` would send the clock back to noon on reload.
    await open(page, LATE_IN_A_MONTH, pinDayAcrossReloads)
    await start(page)
    await expect(clock(page)).toHaveAttribute('data-running', 'true')
    await expect.poll(() => seconds(page), { timeout: 5_000 }).toBeGreaterThanOrEqual(2)
    const before = await seconds(page)
    await page.reload()
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 15_000 })
    expect(await seconds(page), 'resumed, not restarted').toBeGreaterThanOrEqual(before)
    await playSolution(page)
    const card = page.locator('[data-completion-card]')
    await expect(card).toContainText(/\d+:\d\d · no hints/)
    await expect(clock(page)).toHaveText(/^\d+:\d\d · no hints$/)
})

test('a hint keeps the clock running and marks the result', async ({ page }) => {
    await open(page)
    await start(page)
    await page.getByRole('button', { name: 'Hint', exact: true }).click()
    await expect(clock(page)).toHaveText(/^\d+:\d\d · hints used$/)
    await expect(clock(page)).toHaveAttribute('data-running', 'true')
    await playSolution(page)
    await expect(page.locator('[data-completion-card]')).toContainText(/\d+:\d\d · hints used/)
})

test('Next board crosses sizes, and Practice is labelled with the result beside it', async ({ page }) => {
    await open(page)
    await page.locator('[data-level="next"]').click()
    await page.locator('[data-level="next"]').click()
    await expect(page.locator('[data-cover-board]')).toContainText('Easy · 6×6 · puzzle 3 of 3')
    await start(page)
    await playSolution(page)
    const card = page.locator('[data-completion-card]')
    await expect(card).toContainText(/no hints/)
    await card.getByRole('button', { name: 'Practice' }).click()
    await expect(card).toHaveCount(0)
    await expect(clock(page)).toHaveText(/^Practice · \d+:\d\d · Your result: \d+:\d\d · no hints$/)
    await expect(clock(page)).toHaveAttribute('data-running', 'true')
    // Practice cleared the board; solving it again freezes the Practice time and brings
    // the card back, with the way on.
    await playSolution(page)
    await expect(card.getByRole('button', { name: 'Next board' })).toBeVisible()
    await card.getByRole('button', { name: 'Next board' }).click()
    await expect(page.locator('[data-difficulty="normal"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-cover-board]')).toContainText('Medium · 7×7 · puzzle 1 of 3')
})

test('yesterday\'s board says it ends at midnight, on the cover and the clock', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Archive' }).click()
    await page.locator('[data-archive-day="2026-09-28"]').click()
    await expect(page.locator('[data-cover-day]')).toHaveText('Yesterday\'s challenge · ends at midnight')
    await start(page)
    await expect(clock(page)).toHaveText(/ · ends at midnight$/)
})

test('the public page stays casual: no cover, no clock', async ({ page }) => {
    await pinDay(page, LATE_IN_A_MONTH)
    await page.addInitScript(() => localStorage.setItem('hasSeenTutorial', 'true'))
    await page.goto(`${BASE_URL}/`)
    await expect(page.getByRole('grid')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-challenge-cover]')).toHaveCount(0)
    await expect(clock(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled()
})
