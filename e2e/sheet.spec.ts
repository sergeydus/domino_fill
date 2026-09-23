import { test, expect, type Browser, type Page } from '@playwright/test'
import { VISUAL_URL } from './server'
import { onDate } from './calendar'
import { waitForRest } from './rest'

/**
 * The component sheet (graphics spec P0-3, row 3).
 *
 * `/visual` renders the production components over fixtures, in a build made with
 * `DOMINO_VISUAL_SHEET=1` and served beside production by e2e/server.ts. This is what the
 * baselines of P0-4 will be taken from, so what it must guarantee is that the picture is a
 * function of the code alone: every state present, each exactly where it is supposed to be,
 * at the size asked for, and the same whatever the date.
 */

test.use({ baseURL: VISUAL_URL })

/** The sheet, in order. A specimen missing, added or doubled is a change to the baselines. */
const SPECIMENS = [
    'empty', 'domino-upright', 'domino-flat', 'rock', 'target-satisfied', 'target-over',
    'anchor', 'hint', 'focus',
    'completion-card', 'controls-game', 'controls-difficulty', 'controls-level',
    'control-archive', 'control-sound',
]

/**
 * States that appear nowhere on the sheet but in their own specimen, with how many times.
 *
 * Counted over the whole page *and* over the specimen, so a state that leaked into a second
 * specimen fails as surely as one that vanished. Candidates come as a pair because a tap
 * only anchors where there are at least two ways to finish; a single legal direction
 * places the domino at once.
 */
const ISOLATED: [selector: string, specimen: string, count: number][] = [
    ['[data-anchor]', 'anchor', 1],
    ['[data-candidate]', 'anchor', 2],
    ['[data-hinted]', 'hint', 1],
    ['[data-focus]', 'focus', 1],
    ['[data-line-state="satisfied"]', 'target-satisfied', 1],
    ['[data-line-state="over"]', 'target-over', 1],
    ['[data-completion-card]', 'completion-card', 1],
    ['[data-check]', 'controls-game', 1],
    ['[data-hint]', 'controls-game', 1],
    ['[data-undo]', 'controls-game', 1],
    ['[data-reset]', 'controls-game', 1],
    ['[data-difficulty]', 'controls-difficulty', 3],
    ['[data-level]', 'controls-level', 2],
    ['[data-open-archive]', 'control-archive', 1],
    ['[data-mute]', 'control-sound', 1],
]

const openSheet = async (page: Page, cell?: number) => {
    await page.goto(cell === undefined ? '/visual' : `/visual?cell=${cell}`)
    await expect(page.locator('main[data-sheet]')).toBeVisible()
}

const specimen = (page: Page, name: string) => page.locator(`[data-specimen="${name}"]`)

test('every specimen is on the sheet once, in order, and nothing else is', async ({ page }) => {
    await openSheet(page)
    const names = await page.locator('[data-specimen]').evaluateAll(
        els => els.map(el => el.getAttribute('data-specimen')))
    expect(names).toEqual(SPECIMENS)
})

test('each state is shown by its own specimen and nowhere else', async ({ page }) => {
    await openSheet(page)
    for (const [selector, name, count] of ISOLATED) {
        await expect(page.locator(selector), `${selector} on the sheet`).toHaveCount(count)
        await expect(specimen(page, name).locator(selector), `${selector} in ${name}`)
            .toHaveCount(count)
    }
})

test('each piece, and the empty board, is exactly what its specimen names', async ({ page }) => {
    /*
     * Pieces, the two cell tones and the neutral target are context on other boards -- a
     * satisfied line needs something on it, and every board has squares of both tones --
     * so these are counted inside the specimen that exists to show them.
     */
    await openSheet(page)
    const pieces = (name: string) => specimen(page, name).locator('[data-piece]').evaluateAll(
        els => els.map(el => el.getAttribute('data-piece')))

    expect(await pieces('domino-upright')).toEqual(['one'])
    expect(await pieces('domino-flat')).toEqual(['two'])
    expect(await pieces('rock')).toEqual(['rock'])
    expect(await pieces('empty')).toEqual([])

    // Both tones, twice each, and every line short of its target.
    const tones = await specimen(page, 'empty').locator('[data-cell]').evaluateAll(
        els => els.map(el => getComputedStyle(el).backgroundColor))
    expect(tones).toHaveLength(4)
    const counts = Object.values(tones.reduce<Record<string, number>>(
        (acc, tone) => ({ ...acc, [tone]: (acc[tone] ?? 0) + 1 }), {}))
    expect(counts, `two tones, two of each: ${tones.join(' | ')}`).toEqual([2, 2])

    const states = await specimen(page, 'empty').locator('[data-line-state]').evaluateAll(
        els => els.map(el => el.getAttribute('data-line-state')))
    expect(states).toEqual(['neutral', 'neutral', 'neutral', 'neutral'])
})

test('the cells are the size asked for, and only sizes that exist are served', async ({ page }) => {
    for (const cell of [38, 53]) {
        await openSheet(page, cell)
        const widths = await page.locator('[data-cell]').evaluateAll(
            els => [...new Set(els.map(el => el.getBoundingClientRect().width))])
        expect(widths, `every square at ?cell=${cell}`).toEqual([cell])
    }

    // Refused rather than clamped: a baseline at a size nobody asked for is of the wrong thing.
    for (const bad of ['37', '53.5', 'abc', '']) {
        const res = await page.goto(`/visual?cell=${bad}`)
        expect(res?.status(), `?cell=${bad}`).toBe(404)
    }
})

/**
 * The sheet at rest, as everything a date could change: its markup, and where every element
 * of it was laid out.
 *
 * **Not pixels.** Measured at rest, two screenshots of this sheet on the *same* date, same
 * browser, same viewport, differ in 4 of 10 pairs: a handful of anti-aliased pixels
 * (4 px, at most 13 levels of one channel) at the edge of an animated piece, with or without
 * reduced motion. A pixel comparison therefore cannot tell a date dependence from the
 * renderer's own noise -- it failed as often with the dates equal as with them apart. That
 * noise is P0-4's to measure into a diff budget. The date question is answered where a date
 * could act: text, attributes, inline style, and layout.
 */
const atRest = async (page: Page) => {
    await waitForRest(page, 'main')
    return page.locator('main').evaluate(main => ({
        markup: main.outerHTML,
        boxes: [main, ...main.querySelectorAll('*')].map(el => {
            const r = el.getBoundingClientRect()
            return [r.x, r.y, r.width, r.height].map(v => Math.round(v * 100) / 100).join(',')
        }),
    }))
}

const sheetOn = async (browser: Browser, date: string) => {
    const context = await browser.newContext({ baseURL: VISUAL_URL, viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    await page.addInitScript(onDate, Date.parse(date))
    await openSheet(page, 38)
    // The shift took: the page believes it is `date`, not today.
    expect(await page.evaluate(() => new Date().getFullYear())).toBe(new Date(date).getFullYear())
    const state = await atRest(page)
    await context.close()
    return state
}

test('the sheet is the same on two different dates', async ({ browser }) => {
    /*
     * The reason the sheet exists at all. The day's puzzle comes from the local date, so a
     * sheet taken from a live board would change overnight; this one is fixtures only.
     * Two dates years apart, in separate contexts.
     */
    const a = await sheetOn(browser, '2026-01-15T09:00:00')
    const b = await sheetOn(browser, '2031-07-04T21:30:00')
    expect(b.markup, 'the sheet\'s markup changed with the date').toBe(a.markup)
    expect(b.boxes, 'the sheet\'s layout changed with the date').toEqual(a.boxes)
})

test('the sheet loads without errors and stores nothing', async ({ page }) => {
    /*
     * Failed requests are checked as responses, where the URL is known, rather than as the
     * console's "Failed to load resource", which does not say which. The analytics beacon
     * is the one exemption, as everywhere in this suite (see openBoard.ts): it 404s against
     * a self-hosted `next start` and has nothing to do with the page.
     */
    const errors: string[] = []
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
    page.on('console', m => {
        if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) {
            errors.push(`console: ${m.text()}`)
        }
    })
    page.on('response', r => {
        if (r.status() >= 400 && !r.url().includes('/_vercel/')) errors.push(`${r.status()} ${r.url()}`)
    })
    page.on('requestfailed', r => {
        if (!r.url().includes('/_vercel/')) errors.push(`failed ${r.url()}: ${r.failure()?.errorText}`)
    })

    await openSheet(page)
    await page.waitForLoadState('networkidle')

    expect(errors).toEqual([])
    // Fixture sessions are never registered with the level store, so nothing is saved: a
    // sheet that wrote progress would leave state behind for the next page to read.
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([])
})
