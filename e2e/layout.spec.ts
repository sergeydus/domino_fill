import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'

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

/**
 * The worst text overflow across every label, per element, in CSS px.
 *
 * Compared element by element: row labels are gutter-wide and cell-tall, column labels the
 * other way round, so a min/max taken across the two axes together compares boxes that
 * were never meant to match and means nothing.
 */
const labelOverflow = (page: Page, text?: string) => page.evaluate((forced) => {
    let x = 0, y = 0
    for (const el of document.querySelectorAll('[data-col-label],[data-row-label]')) {
        const e = el as HTMLElement
        if (forced) e.textContent = forced
        x = Math.max(x, e.scrollWidth - e.clientWidth)
        y = Math.max(y, e.scrollHeight - e.clientHeight)
    }
    return { x, y }
}, text)

/** Move to a level by clicking the next arrow, from level 1. */
const goToLevel = async (page: Page, level: number) => {
    for (let k = 1; k < level; k++) await page.locator('[data-level="next"]').click()
}

/** The two-digit targets the shipped content actually contains are 10, 11 and 13. */
const WIDEST_LABEL = '13'

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

                test('no label text overflows its box', async ({ page }) => {
                    // The *text*, not the box. An earlier version of this test compared
                    // the label element against the cell and the font size against the
                    // cell height, and passed while the glyphs were overflowing: the
                    // element is sized by inline style, so measuring it only restates the
                    // style. `scrollWidth/scrollHeight` is what the content actually
                    // needs. It caught a real 1px overflow -- a font's content area is
                    // ~1.3x its em box, so `line-height: 1` shrinks the line box without
                    // shrinking the glyphs.
                    expect(await labelOverflow(page)).toEqual({ x: 0, y: 0 })
                })
            })
        }

        test('cells stay square', async ({ page }) => {
            await openBoard(page)
            const cell = await box(page, '[data-cell="0,0"]')
            expect(Math.abs(cell.width - cell.height)).toBeLessThanOrEqual(1)
        })

        test('the widest label the game can produce still fits', async ({ page }) => {
            await openBoard(page)
            await chooseDifficulty(page, /hard/i, 8)

            // Driven rather than found: the shipped content rotates daily, so whether a
            // two-digit target is on screen depends on the date. Sums reach 13, and 13 is
            // what the 0.7-cell gutter has to hold.
            expect(await labelOverflow(page, WIDEST_LABEL)).toEqual({ x: 0, y: 0 })
        })

        test('no label overflows on any shipped level', async ({ page }) => {
            await openBoard(page)
            for (const d of DIFFICULTIES) {
                await chooseDifficulty(page, d.label, d.n)
                for (let level = 1; level <= 3; level++) {
                    await goToLevel(page, level)
                    expect(await labelOverflow(page), `${d.name} level ${level}`)
                        .toEqual({ x: 0, y: 0 })
                }
            }
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

test.describe('safe-area insets', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    /*
     * Chromium cannot emulate a device's safe area, so these drive the `--safe-*`
     * variables the page reads. That is a test of the plumbing -- that the insets are
     * subtracted from the budget and kept clear by the padding -- not of any device's
     * actual values. Stated plainly because the distinction matters: nothing here proves
     * how a real iPhone reports its notch.
     */
    const applyInsets = (page: Page, insets: Record<string, string>) => page.evaluate((i) => {
        for (const [name, value] of Object.entries(i)) {
            document.documentElement.style.setProperty(name, value)
        }
    }, insets)

    test('the page asks for the whole screen, which is what makes env() non-zero', async ({ page }) => {
        await openBoard(page)
        const content = await page.locator('meta[name="viewport"]').getAttribute('content')
        expect(content).toContain('viewport-fit=cover')
    })

    test('a horizontal inset alone shrinks the board', async ({ page }) => {
        // 390x844 is width-bound, so left/right is the axis that can bite here.
        await openBoard(page)
        await chooseDifficulty(page, /hard/i, 8)
        const before = (await box(page, '[data-cell="0,0"]')).width

        await applyInsets(page, { '--safe-left': '32px', '--safe-right': '32px' })
        await expect
            .poll(async () => (await box(page, '[data-cell="0,0"]')).width)
            .toBeLessThan(before)
    })

    test('the shell stays clear of the inset area', async ({ page }) => {
        await openBoard(page)
        await chooseDifficulty(page, /hard/i, 8)
        await applyInsets(page, { '--safe-left': '32px', '--safe-right': '32px' })

        /*
         * Polled on the *right* edge, which is the last thing to settle. The padding
         * applies the moment the variable changes, so the left edge is already in place
         * while the board is still the old width -- polling on the left alone passed
         * early and then read a right edge 62px over the limit. Intermittent, and mine,
         * not the layout's.
         */
        const right = 390 - 32 - PAGE_MARGIN_PX + 1
        await expect.poll(async () => {
            const shell = await box(page, '[data-board-shell]')
            return Math.round(shell.x + shell.width)
        }).toBeLessThanOrEqual(right)

        const shell = await box(page, '[data-board-shell]')
        expect(shell.x).toBeGreaterThanOrEqual(32 + PAGE_MARGIN_PX - 1)
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
    })

    test('no inset means no change', async ({ page }) => {
        await openBoard(page)
        await chooseDifficulty(page, /hard/i, 8)
        const before = (await box(page, '[data-cell="0,0"]')).width

        await applyInsets(page, {
            '--safe-top': '0px', '--safe-bottom': '0px',
            '--safe-left': '0px', '--safe-right': '0px',
        })
        await page.waitForTimeout(400)

        expect((await box(page, '[data-cell="0,0"]')).width).toBe(before)
    })
})

test.describe('safe-area insets, vertical', () => {
    // A separate viewport because the axis under test has to be the binding one: at
    // 390x844 the width binds, so a top/bottom inset changes nothing there and a test
    // that applied all four at once would have passed with vertical handling deleted.
    // Verified: removing only the top/bottom subtraction passed all four of the tests
    // above. 1280x800 is height-bound for an 8x8 board.
    test.use({ viewport: { width: 1280, height: 800 } })

    const TOP = 47
    const BOTTOM = 34

    test('a vertical inset alone shrinks the board', async ({ page }) => {
        await openBoard(page)
        await chooseDifficulty(page, /hard/i, 8)
        const before = (await box(page, '[data-cell="0,0"]')).height

        await page.evaluate(([top, bottom]) => {
            document.documentElement.style.setProperty('--safe-top', `${top}px`)
            document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`)
        }, [TOP, BOTTOM])

        await expect
            .poll(async () => (await box(page, '[data-cell="0,0"]')).height)
            .toBeLessThan(before)
    })

    test('a vertical inset costs exactly as much as a shorter window', async ({ page }) => {
        // The strong form: budgeted, not merely "smaller". An inset of n px has to cost
        // the same as n px of missing viewport -- which is a claim about the arithmetic,
        // not about the style that produced it.
        await openBoard(page)
        await chooseDifficulty(page, /hard/i, 8)
        await page.evaluate(([top, bottom]) => {
            document.documentElement.style.setProperty('--safe-top', `${top}px`)
            document.documentElement.style.setProperty('--safe-bottom', `${bottom}px`)
        }, [TOP, BOTTOM])
        await page.waitForTimeout(400)
        const withInset = (await box(page, '[data-cell="0,0"]')).height

        await page.setViewportSize({ width: 1280, height: 800 - TOP - BOTTOM })
        await page.evaluate(() => {
            document.documentElement.style.removeProperty('--safe-top')
            document.documentElement.style.removeProperty('--safe-bottom')
        })
        await page.waitForTimeout(400)
        const shorterWindow = (await box(page, '[data-cell="0,0"]')).height

        expect(withInset).toBe(shorterWindow)
    })
})
