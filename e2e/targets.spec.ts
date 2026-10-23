import { test, expect, type Locator, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { LATE_IN_A_MONTH, pinDay } from './calendar'
import { VISUAL_URL } from './server'
import { playSolution } from './play'

/**
 * Every control is at least 48×48 CSS px at phone sizes (UI-SPEC §3.3, UI row 3): Android's own
 * guidance for a touch target. Two exceptions, each named here and nowhere else:
 *
 *   - the board's cells, held by `SPEC.md`'s 38px floor and its tap and drag model. They aren't
 *     buttons, so the scan below never meets them; the selector says so anyway;
 *   - the archive's days, excused **in width only**: seven across must fit the sheet, so each
 *     is a seventh of its width, but 48px tall (§6.5; codex, at row 3's contract review).
 *
 * Every visible button on every surface a player reaches -- the game page with Pick a piece's
 * chips, the challenge cover, the completion card, Results, the archive and the tutorial --
 * found by the browser, not listed. At 360×640, set here, so the file means the same in every
 * project it runs in.
 */

test.use({ viewport: { width: 360, height: 640 } })

const CELL = '[data-cell]'
const DAY = '[data-archive-day]'

/** Every visible button in `scope` smaller than its target, as `label: w×h`. */
const undersized = async (scope: Locator, least: number) => {
    const found: Locator[] = []
    for (const b of await scope.locator('button').all()) if (await b.isVisible()) found.push(b)
    // A positive control: a scan that found nothing would pass everything.
    expect(found.length, 'the buttons were found').toBeGreaterThanOrEqual(least)
    const small: string[] = []
    for (const b of found) {
        const { width, height } = (await b.boundingBox())!
        const day = await b.evaluate((el, selector) => el.matches(selector), DAY)
        const cell = await b.evaluate((el, selector) => el.matches(selector), CELL)
        if (cell) continue
        // Sub-pixel layout: 47.99 is 48.
        const short = height < 47.99
        const narrow = !day && width < 47.99
        if (short || narrow) {
            const label = await b.getAttribute('aria-label') ?? (await b.innerText()).trim()
            small.push(`${label}: ${width.toFixed(1)}×${height.toFixed(1)}`)
        }
    }
    return small
}

test('the game page, and Pick a piece\'s chips', async ({ page }) => {
    await pinDay(page, LATE_IN_A_MONTH)
    await openBoard(page)
    // Difficulty 3, the arrows 2, Archive, Sound, Pick a piece, Check, Hint, Undo, Reset.
    expect(await undersized(page.locator('body'), 12)).toEqual([])
    await page.locator('[data-controls-mode]').click()
    await expect(page.locator('[data-held-piece]')).toHaveCount(2)
    expect(await undersized(page.locator('body'), 14)).toEqual([])
})

test('the archive: its days 48px tall, a seventh of its width across', async ({ page }) => {
    await pinDay(page, LATE_IN_A_MONTH)
    await openBoard(page)
    await page.locator('[data-open-archive]').click()
    const archive = page.locator('[data-archive]')
    await expect(archive.locator(DAY).first()).toBeVisible()
    expect(await undersized(archive, 10)).toEqual([])
    // The days were measured, not skipped: their height is held, and they are the narrow ones.
    const days = await archive.locator(DAY).all()
    expect(days.length).toBeGreaterThan(7)
    for (const day of days.slice(0, 7)) expect((await day.boundingBox())!.height).toBeGreaterThanOrEqual(47.99)
})

test('the tutorial', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Got it!' })).toBeVisible()
    expect(await undersized(page.locator('.fixed.inset-0').first(), 2)).toEqual([])
})

test.describe('the challenge: its cover, the completion card and Results', () => {
    test.use({ baseURL: VISUAL_URL })

    const startAt = async (page: Page) => {
        await pinDay(page, LATE_IN_A_MONTH)
        await page.addInitScript(() => localStorage.setItem('hasSeenTutorial', 'true'))
        await page.goto('/visual/daily')
        await expect(page.locator('[data-challenge-cover="ready"]')).toBeVisible({ timeout: 15_000 })
    }

    test('each, as a player meets it', async ({ page }) => {
        await startAt(page)
        expect(await undersized(page.locator('[data-challenge-cover]'), 1), 'the cover').toEqual([])

        await page.getByRole('button', { name: 'Start', exact: true }).click()
        await expect(page.getByRole('grid')).toBeVisible()
        await playSolution(page)
        const card = page.locator('[data-completion-card]')
        await expect(card).toContainText(/\d+:\d\d · no hints/)
        expect(await undersized(card, 1), 'the completion card').toEqual([])

        await page.getByRole('button', { name: 'Results' }).click()
        const results = page.locator('[data-results]')
        await expect(results).toBeVisible()
        expect(await undersized(results, 2), 'Results').toEqual([])
    })
})
