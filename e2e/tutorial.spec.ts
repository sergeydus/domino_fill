import { test, expect, type Page } from '@playwright/test'

/**
 * The tutorial's escape hatch, at phone size (spec P1-9, carried in from P0-9a).
 *
 * None of this is answerable in jsdom: it has no layout, so it cannot tell whether the
 * modal overflows horizontally, whether its content scrolls when taller than the viewport,
 * or whether Skip is actually reachable rather than merely present in the DOM.
 */

const overlay = (page: Page) => page.locator('div.fixed.inset-0')
const skip = (page: Page) => page.getByRole('button', { name: /skip/i })

/** Horizontal overflow of the document, in CSS px. */
const horizontalOverflow = (page: Page) =>
    page.evaluate(() => {
        const el = document.documentElement
        return Math.max(0, el.scrollWidth - el.clientWidth)
    })

test.beforeEach(async ({ page }) => {
    // A fresh context has no `hasSeenTutorial`, so the tutorial shows on first paint.
    await page.goto('/')
    await expect(overlay(page)).toBeVisible()
})

test('the tutorial is shown to a first-time player', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /how to play/i })).toBeVisible()
})

test('the page does not scroll horizontally', async ({ page }) => {
    // 1px of tolerance for sub-pixel rounding; a real overflow is whole cells wide.
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
})

test('the modal itself does not overflow horizontally', async ({ page }) => {
    // Needed in addition to the document check above, not instead of it: the overlay is
    // `overflow-auto`, so an oversized card scrolls WITHIN the overlay and never reaches
    // documentElement.scrollWidth. Measured: a 900px card leaves the document at 360 while
    // pushing the overlay's scrollWidth to 380.
    const { scrollWidth, clientWidth } = await overlay(page).evaluate(el => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
    }))
    expect(scrollWidth - clientWidth).toBeLessThanOrEqual(1)
})

test('the tutorial board fits the viewport', async ({ page }) => {
    const board = overlay(page).locator('[style*="width"]').first()
    const box = await board.boundingBox()
    const width = page.viewportSize()!.width

    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(-1)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
})

test('Skip is reachable and dismisses the tutorial', async ({ page }) => {
    const button = skip(page)

    // `scrollIntoViewIfNeeded` is the point of the test: on a short viewport the button
    // starts below the fold, and it must be possible to reach it by scrolling the modal.
    await button.scrollIntoViewIfNeeded()
    await expect(button).toBeInViewport()
    await expect(button).toBeEnabled()

    await button.click()
    await expect(overlay(page)).toBeHidden()
})

test('the tutorial stays dismissed across a reload', async ({ page }) => {
    await skip(page).scrollIntoViewIfNeeded()
    await skip(page).click()
    await expect(overlay(page)).toBeHidden()

    await page.reload()
    await expect(overlay(page)).toBeHidden()
    await expect(page.getByRole('heading', { name: /how to play/i })).toBeHidden()
})

test('the modal scrolls rather than clipping its content', async ({ page }) => {
    const scrollable = await overlay(page).evaluate(el => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        overflowY: getComputedStyle(el).overflowY,
    }))

    if (scrollable.scrollHeight > scrollable.clientHeight) {
        // Taller than the viewport: it must be scrollable, or the bottom is unreachable.
        expect(['auto', 'scroll']).toContain(scrollable.overflowY)
    }

    // Either way the last control must be reachable, which is what actually matters.
    await skip(page).scrollIntoViewIfNeeded()
    await expect(skip(page)).toBeInViewport()
})

test('"Got it!" is gated on solving, but is not the only way out', async ({ page }) => {
    const gotIt = page.getByRole('button', { name: /got it/i })
    await gotIt.scrollIntoViewIfNeeded()
    await expect(gotIt).toBeDisabled()
    await expect(skip(page)).toBeEnabled()
})

test('the stated rule is about pip totals, not domino counts', async ({ page }) => {
    const text = await overlay(page).innerText()
    expect(text).not.toMatch(/how many domino/i)
    expect(text).toMatch(/total of the values/i)
})
