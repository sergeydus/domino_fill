import { test, expect, type Page } from '@playwright/test'

/**
 * The layout acceptance criteria (spec P0-3 / D3), across the viewport and zoom matrix.
 *
 * None of this is answerable outside a real browser: jsdom's `getBoundingClientRect()`
 * returns zeros, so it cannot say whether a label lines up with its row, whether the shell
 * fits, or whether anything is clipped. The unit tests in tests/geometry.test.ts check the
 * arithmetic; these check what the browser actually laid out.
 *
 * **Zoom.** Browser page zoom at factor Z scales CSS pixels against device pixels, so the
 * layout viewport in CSS px is the window divided by Z -- a 1280x800 window at 200% lays
 * out exactly as a 640x400 CSS viewport. That is what is emulated here. (Playwright's
 * `deviceScaleFactor` is device pixel ratio, which does not change CSS layout at all, and
 * CDP's page scale factor is pinch zoom, which does not change the layout viewport.)
 */

const PAGE_MARGIN_PX = 8

/** The matrix: three device sizes, then desktop at four zoom levels. */
const VIEWPORTS = [
    { name: '360x640 phone', width: 360, height: 640 },
    { name: '390x844 phone', width: 390, height: 844 },
    { name: '800x400 landscape', width: 800, height: 400 },
    { name: '1280x800 @ 50%', width: 2560, height: 1600 },
    { name: '1280x800 @ 100%', width: 1280, height: 800 },
    { name: '1280x800 @ 150%', width: 853, height: 533 },
    { name: '1280x800 @ 200%', width: 640, height: 400 },
]

const DIFFICULTIES = [
    { name: 'easy 6x6', label: /easy/i, n: 6 },
    { name: 'hard 8x8', label: /hard/i, n: 8 },
]

const openBoard = async (page: Page) => {
    await page.goto('/')
    const skip = page.getByRole('button', { name: /skip/i })
    await skip.scrollIntoViewIfNeeded()
    await skip.click()
    await expect(page.locator('[data-board-shell]')).toBeVisible()
}

const chooseDifficulty = async (page: Page, label: RegExp, n: number) => {
    await page.getByRole('button', { name: label }).click()
    await expect(page.locator('[data-cell]')).toHaveCount(n * n)
}

const box = async (page: Page, selector: string) => {
    const b = await page.locator(selector).first().boundingBox()
    if (!b) throw new Error(`${selector} has no box`)
    return b
}

const horizontalOverflow = (page: Page) => page.evaluate(() => {
    const el = document.documentElement
    return Math.max(0, el.scrollWidth - el.clientWidth)
})

/** Centres of every row label, and of the first cell in every row. */
const rowAlignment = (page: Page) => page.evaluate(() => {
    const centre = (el: Element) => {
        const r = el.getBoundingClientRect()
        return r.top + r.height / 2
    }
    const labels = [...document.querySelectorAll('[data-row-label]')].map(centre)
    const n = Math.sqrt(document.querySelectorAll('[data-cell]').length)
    const cells = Array.from({ length: n }, (_, i) =>
        centre(document.querySelector(`[data-cell="${i},0"]`)!))
    return { labels, cells }
})

const columnAlignment = (page: Page) => page.evaluate(() => {
    const centre = (el: Element) => {
        const r = el.getBoundingClientRect()
        return r.left + r.width / 2
    }
    const labels = [...document.querySelectorAll('[data-col-label]')].map(centre)
    const n = Math.sqrt(document.querySelectorAll('[data-cell]').length)
    const cells = Array.from({ length: n }, (_, j) =>
        centre(document.querySelector(`[data-cell="0,${j}"]`)!))
    return { labels, cells }
})

for (const vp of VIEWPORTS) {
    test.describe(vp.name, () => {
        test.use({ viewport: { width: vp.width, height: vp.height } })

        for (const d of DIFFICULTIES) {
            test.describe(d.name, () => {
                test.beforeEach(async ({ page }) => {
                    await openBoard(page)
                    await chooseDifficulty(page, d.label, d.n)
                })

                test('every row label is aligned with its row', async ({ page }) => {
                    const { labels, cells } = await rowAlignment(page)

                    expect(labels).toHaveLength(d.n)
                    for (let i = 0; i < d.n; i++) {
                        // 1px for sub-pixel rounding. The defect this replaces was a
                        // constant 4px offset -- the grid's border, which the labels did
                        // not clear -- so the tolerance has to be tighter than that.
                        expect(Math.abs(labels[i] - cells[i]), `row ${i}`).toBeLessThanOrEqual(1)
                    }
                })

                test('every column label is aligned with its column', async ({ page }) => {
                    const { labels, cells } = await columnAlignment(page)

                    expect(labels).toHaveLength(d.n)
                    for (let j = 0; j < d.n; j++) {
                        expect(Math.abs(labels[j] - cells[j]), `column ${j}`).toBeLessThanOrEqual(1)
                    }
                })

                test('there is exactly one gutter per axis', async ({ page }) => {
                    // The right-hand gutter used to be rendered as a duplicate of the
                    // left one, costing a whole column of width (spec P0-3).
                    await expect(page.locator('[data-row-label]')).toHaveCount(d.n)
                    await expect(page.locator('[data-col-label]')).toHaveCount(d.n)
                })

                test('the page never scrolls horizontally', async ({ page }) => {
                    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
                })

                test('the whole shell fits the viewport width, margin included', async ({ page }) => {
                    const shell = await box(page, '[data-board-shell]')

                    // The shell, not the grid: gutter + cells + border. Sizing the wrapper
                    // from the grid alone is what made a 6x6 render at 776px in a 768px
                    // budget.
                    expect(shell.x).toBeGreaterThanOrEqual(PAGE_MARGIN_PX - 1)
                    expect(shell.x + shell.width)
                        .toBeLessThanOrEqual(vp.width - PAGE_MARGIN_PX + 1)
                })

                test('no board content is clipped above the scroll origin', async ({ page }) => {
                    // A centred flex item taller than its container overflows equally in
                    // both directions, and the top half cannot be scrolled to. `m-auto`
                    // degrades to zero instead, which is the fix being asserted.
                    await page.evaluate(() => window.scrollTo(0, 0))
                    const shell = await box(page, '[data-board-shell]')
                    expect(shell.y).toBeGreaterThanOrEqual(-1)
                })

                test('the labels fit their gutter', async ({ page }) => {
                    const label = await box(page, '[data-row-label]')
                    const cell = await box(page, '[data-cell="0,0"]')
                    const fontSize = await page.locator('[data-row-label]').first()
                        .evaluate(el => parseFloat(getComputedStyle(el).fontSize))

                    // The defect: a constant `text-6xl` (60px) glyph rendered inside a
                    // 39px box at phone size, overflowing into its neighbours.
                    expect(fontSize).toBeLessThan(cell.height)
                    expect(label.width).toBeLessThan(cell.width)
                    expect(label.height).toBeCloseTo(cell.height, 0)
                })
            })
        }

        test('cells stay square', async ({ page }) => {
            await openBoard(page)
            const cell = await box(page, '[data-cell="0,0"]')
            expect(Math.abs(cell.width - cell.height)).toBeLessThanOrEqual(1)
        })

        test('the layout settles at once and does not creep', async ({ page }) => {
            await openBoard(page)
            await chooseDifficulty(page, /hard/i, 8)

            // The board is sized from the space its chrome leaves, so anything in the
            // chrome that is itself sized from the board closes a feedback loop. Measured
            // before this was fixed: the cell crept 48 -> 50 -> 51 over several frames,
            // because the piece tray drew its dominoes at the board's cell size.
            const first = (await box(page, '[data-cell="0,0"]')).height
            await page.waitForTimeout(750)
            const settled = (await box(page, '[data-cell="0,0"]')).height

            expect(settled).toBe(first)
        })
    })
}

test.describe('the phone cell-size criterion', () => {
    test.use({ viewport: { width: 360, height: 640 } })

    test('an 8x8 board has cells of at least 38 CSS px at 360 wide', async ({ page }) => {
        await openBoard(page)
        await chooseDifficulty(page, /hard/i, 8)

        const cell = await box(page, '[data-cell="0,0"]')
        // 38, not 44: `(n + 0.7)*cell + 8 <= 344` caps the cell at 38.6px. The spec works
        // the arithmetic through -- 44px is unreachable at 360 wide, because eight cells
        // alone would be 352px before any gutter or border exists.
        expect(cell.width).toBeGreaterThanOrEqual(38)
    })
})
