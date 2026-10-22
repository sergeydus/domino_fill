import { test, expect, type Page } from '@playwright/test'
import { openBoard } from '../e2e/openBoard'
import { drag, freeRuns, rockSquares } from '../e2e/play'
import { onDate } from '../e2e/calendar'
import { waitForRest } from '../e2e/rest'
import { VISUAL_URL } from '../e2e/server'

/**
 * The four baselines, in each theme (graphics spec P0-4, row 4; UI row 1).
 *
 *   1-2. The component sheet at 38 and 53px: every piece, cell, label, selection state and
 *        control, from fixtures, so nothing about them depends on the day.
 *   3-4. The ordinary game at 360x640 and 1280x800, mid-play -- two dominoes down, not a
 *        board mid-celebration. These do depend on the day, so the day is fixed.
 *
 * Each is taken twice since UI row 1: with the system light, under the name it always had,
 * and with the system dark, under that name with `-dark`. So the light four are the same
 * files, and a row that moves a light pixel has to move one of them.
 *
 * Geometry, tokens, accessibility state and motion each have their own assertions
 * elsewhere; a screenshot is never the only thing standing behind a row. What these catch is
 * everything *between* those assertions -- the picture as a whole.
 */

/**
 * The day the full-page baselines show. Fixed, in UTC, and read by the page in UTC
 * (`timezoneId` in the config), so every runner agrees which puzzle it is. Mid-morning, so
 * no rollover logic is anywhere near midnight while the page is open.
 */
const DAY = '2026-10-15T10:00:00Z'

/** Two dominoes down, wherever the day's board has room: the board mid-play. */
const midPlay = async (page: Page) => {
    const { upright, flat } = await freeRuns(page, await rockSquares(page))
    await drag(page, upright, [upright[0] + 1, upright[1]])
    await drag(page, flat, [flat[0], flat[1] + 1])
    await expect(page.locator('[data-piece="one"]')).toHaveCount(1)
    await expect(page.locator('[data-piece="two"]')).toHaveCount(1)
    // Off the board, so no square is left highlighted under a resting pointer.
    await page.mouse.move(0, 0)
}

/** The light shots keep their names; the dark ones add `-dark`. */
const SCHEMES = [['light', ''], ['dark', '-dark']] as const

for (const [scheme, suffix] of SCHEMES) {
    test.describe(`with the system ${scheme}`, () => {
        test.use({ colorScheme: scheme })

        for (const cell of [38, 53]) {
            test(`the component sheet at ${cell}px`, async ({ page }) => {
                await page.setViewportSize({ width: 1280, height: 800 })
                await page.goto(`${VISUAL_URL}/visual?cell=${cell}`)
                await expect(page.locator('main[data-sheet]')).toBeVisible()
                await waitForRest(page, 'main')
                await expect(page).toHaveScreenshot(`sheet-${cell}${suffix}.png`, { fullPage: true })
            })
        }

        for (const [name, viewport] of [
            ['phone', { width: 360, height: 640 }],
            ['desktop', { width: 1280, height: 800 }],
        ] as const) {
            test(`the game on a ${name}, mid-play`, async ({ page }) => {
                await page.setViewportSize(viewport)
                await page.addInitScript(onDate, Date.parse(DAY))
                await openBoard(page)
                // The shift took: the page believes it is that day, and so serves that puzzle.
                expect(await page.evaluate(() => new Date().toISOString().slice(0, 10))).toBe(DAY.slice(0, 10))

                await midPlay(page)
                await waitForRest(page)
                await expect(page).toHaveScreenshot(`${name}${suffix}.png`, { fullPage: true })
            })
        }
    })
}
