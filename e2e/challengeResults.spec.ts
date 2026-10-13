import { test, expect, type Page } from '@playwright/test'
import { VISUAL_URL } from './server'
import { onDate, pinDay, LATE_IN_A_MONTH } from './calendar'
import { playSolution } from './play'

/*
 * Slice 3b on screen, in a real browser: the results screen, reopened from Results, its
 * Share, its focus, and its countdown in a time zone that isn't UTC, across a
 * daylight-saving night. `/visual/daily` is the real game with the challenge on.
 */
test.use({ baseURL: VISUAL_URL })

const open = async (page: Page, pin: (page: Page) => Promise<void> = page => pinDay(page, LATE_IN_A_MONTH)) => {
    await pin(page)
    await page.addInitScript(() => localStorage.setItem('hasSeenTutorial', 'true'))
    await page.goto('/visual/daily')
    await expect(page.locator('[data-challenge-cover="ready"]')).toBeVisible({ timeout: 15_000 })
}
/** Solve today's Easy puzzle 1, and wait for its saved result. */
const solveFirst = async (page: Page) => {
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('grid')).toBeVisible()
    await playSolution(page)
    await expect(page.locator('[data-completion-card]')).toContainText(/\d+:\d\d · no hints/)
}
const results = (page: Page) => page.locator('[data-results]')
const openResults = async (page: Page) => {
    await page.getByRole('button', { name: 'Results' }).click()
    await expect(results(page)).toBeVisible()
}

test('Results reopens the day\'s results, focused at the top, and focus comes back on closing', async ({ page }) => {
    await open(page)
    await solveFirst(page)
    await expect(page.locator('[data-streak-count]')).toContainText('🔥 1')
    await openResults(page)
    await expect(page.locator('[data-results-heading]')).toBeFocused()
    await expect(page.locator('[data-results-heading]')).toHaveText('Results · 29 Sep 2026')
    await expect(page.locator('[data-results-size="easy"] li').first()).toHaveText(/^🟩 Puzzle 1: \d+:\d\d · no hints$/)
    await expect(page.locator('[data-results-streak]')).toHaveText('🔥 1-day streak')
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(results(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Results' })).toBeFocused()
})

test('finishing a size opens the results by itself, after the card shows its time', async ({ page }) => {
    await open(page)
    // Easy 2 and 3 solved already, so solving Easy 1 finishes the size.
    await page.evaluate(() => {
        const fixture = window.dailyFixture!
        const levels = fixture.root.boardsStore
        fixture.seed(levels.easyBoards!.slice(1).map(definition => ({
            puzzleId: definition.puzzleId, definitionHash: definition.definitionHash, date: levels.viewingDate!,
            ruleset: 1 as const, startedAt: 0, assisted: false, clockError: false,
            result: { kind: 'solved' as const, ms: 61_000 }, finishedAt: 61_000,
        })))
    })
    await solveFirst(page)
    // The card's time first; the results 1.5 s later.
    await expect(results(page)).toHaveCount(0)
    await expect(results(page)).toBeVisible()
    await expect(page.locator('[data-results-heading]')).toBeFocused()
    await expect(page.locator('[data-results-size="easy"] [data-results-total]')).toHaveText(/^Total 2:\d\d$/)
})

test('Tab and Shift+Tab stay inside the dialog, never reaching the page (codex)', async ({ page }) => {
    await open(page)
    await solveFirst(page)
    await openResults(page)
    const active = () => page.evaluate(() => {
        const el = document.activeElement
        return { inside: !!el?.closest('[data-results]'), body: el === document.body, name: el?.textContent?.trim() ?? '' }
    })
    const seen: string[] = []
    for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab')
        const now = await active()
        expect(now.body, `Tab ${i + 1} reached the body`).toBe(false)
        expect(now.inside, `Tab ${i + 1} left the dialog`).toBe(true)
        seen.push(now.name)
    }
    expect(seen).toEqual(['Share', 'Close', 'Share', 'Close', 'Share'])
    await page.keyboard.press('Shift+Tab')
    expect(await active()).toMatchObject({ inside: true, name: 'Close' })
    await page.keyboard.press('Shift+Tab')
    expect(await active()).toMatchObject({ inside: true, name: 'Share' })
    await page.keyboard.press('Shift+Tab')
    expect(await active()).toMatchObject({ inside: true, name: 'Close' })
})

test('with the text box shown, Tab and Shift+Tab wrap through it both ways (codex)', async ({ page }) => {
    // A clipboard that refuses, so Share shows the text to copy by hand. Before the fix,
    // Shift+Tab from Share skipped the box for Close, and reverse tabbing never reached it.
    await page.addInitScript(() => {
        Clipboard.prototype.writeText = () => Promise.reject(new DOMException('denied', 'NotAllowedError'))
    })
    await open(page)
    await solveFirst(page)
    await openResults(page)
    await page.getByRole('button', { name: 'Share' }).focus()
    await page.keyboard.press('Enter')
    const box = page.locator('[data-results-fallback]')
    await expect(box).toBeFocused()
    const focused = () => page.evaluate(() => {
        const el = document.activeElement
        if (!el?.closest('[data-results]')) return 'outside'
        return el.hasAttribute('data-results-fallback') ? 'box' : el.textContent?.trim() ?? ''
    })
    const forward: string[] = []
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); forward.push(await focused()) }
    expect(forward).toEqual(['Share', 'Close', 'box', 'Share'])
    const backward: string[] = []
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+Tab'); backward.push(await focused()) }
    expect(backward).toEqual(['box', 'Close', 'Share', 'box'])
})

test('Results keeps the keyboard across the layout change, both ways (codex)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page)
    await solveFirst(page)
    const resultsButton = page.locator('[data-open-results]')
    await resultsButton.focus()
    await expect(resultsButton).toBeFocused()

    await page.setViewportSize({ width: 360, height: 640 })
    await expect(page.locator('[data-rail]')).toHaveCount(0)
    await expect(resultsButton, 'narrowing dropped the keyboard').toBeFocused()
    await expect(resultsButton).toHaveCount(1)

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator('[data-rail]')).toHaveCount(1)
    await expect(resultsButton, 'widening dropped the keyboard').toBeFocused()
    await expect(resultsButton).toHaveCount(1)
})

test('Share puts the decided text on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: VISUAL_URL })
    await open(page)
    await solveFirst(page)
    await openResults(page)
    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.locator('[data-results-copied]')).toHaveText('Copied')
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    // Written with \n; Windows' clipboard reads it back with \r\n.
    const lines = copied.split(/\r?\n/)
    expect(lines[0]).toBe('Domino Fill · 29 Sep 2026')
    expect(lines[1]).toMatch(/^6×6 🟩⬜⬜ partial$/)
    expect(lines.slice(2, 5)).toEqual(['7×7 ⬜⬜⬜ partial', '8×8 ⬜⬜⬜ partial', '🔥 1-day streak'])
    expect(lines[5]).toBe(new URL(VISUAL_URL).host)
    expect(lines).toHaveLength(6)
})

test.describe('in New York, across the night the clocks go back', () => {
    test.use({ timezoneId: 'America/New_York' })

    test('the countdown counts that night\'s real 25 hours', async ({ page }) => {
        // 01:00 on 1 Nov 2026, Eastern daylight time; at 02:00 the clocks go back to 01:00,
        // so the next midnight is 24 hours away, not 23. A countdown to UTC's midnight, or to
        // the same clock time one day of 24 hours on, would read differently.
        await open(page, async page => { await page.addInitScript(onDate, Date.parse('2026-11-01T01:00:00-04:00')) })
        await solveFirst(page)
        await openResults(page)
        await expect(page.locator('[data-results-countdown]')).toHaveText(/^Next challenge in 23:5\d:\d\d$/)
    })
})
