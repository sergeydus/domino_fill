import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { rgbBytes } from '../app/palette'

/**
 * The game looks the same however the operating system is set (spec P2-3, row 20c).
 *
 * P2-3 called the old state "worse than either" option, and it was worse in a way worth
 * pinning rather than merely deleting: `prefers-color-scheme: dark` flipped `body`'s
 * inherited text to `#ededed` while every surface stayed hardcoded light, so the advice
 * strip -- the whole deliverable of P1-5 -- became near-white text on the `#e8e7e7` page
 * at **1.05:1**. Turning on dark mode did not darken the game; it deleted the sentence
 * telling you why your board could not be finished.
 *
 * These run in both schemes because that is the only way to see it: every unit test and
 * every other browser test runs in one scheme and passes either way.
 */

const rgb = (value: string): [number, number, number] => {
    const parts = value.match(/\d+(\.\d+)?/g)?.map(Number) ?? []
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

/** WCAG relative luminance, and the contrast ratio built from it. */
const luminance = ([r, g, b]: [number, number, number]) => {
    const linear = [r, g, b].map(v => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(rgb(a)), luminance(rgb(b))]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** The colours that decide whether the game is readable, as the browser computes them. */
const palette = (page: Page) => page.evaluate(() => {
    const of = (selector: string, property: string) => {
        const el = document.querySelector(selector)
        return el ? getComputedStyle(el).getPropertyValue(property) : 'MISSING'
    }
    // The page's own ground, found by role rather than by tag position: Next inserts its
    // route announcer as a div in <body>, which an earlier probe matched by mistake.
    const shell = document.querySelector('[data-board-shell]')!.closest('div.min-h-svh')!
    return {
        ground: getComputedStyle(shell).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        adviceText: of('[data-advice]', 'color'),
        cell: of('[data-cell="0,0"]', 'background-color'),
        target: of('[data-row-label="0"]', 'color'),
        control: of('[data-undo]', 'background-color'),
    }
})

for (const scheme of ['light', 'dark'] as const) {
    test.describe(`with the system set to ${scheme}`, () => {
        test.beforeEach(async ({ page }) => {
            await page.emulateMedia({ colorScheme: scheme })
            await openBoard(page)
        })

        test('the advice the game gives is legible', async ({ page }) => {
            // The regression this row exists for: 1.05:1 in dark, 14.53:1 in light.
            const { adviceText, ground } = await palette(page)
            expect(contrast(adviceText, ground),
                `advice ${adviceText} on ${ground}`).toBeGreaterThanOrEqual(4.5)
        })

        test('the page ground is the board\'s ground, not a second one behind it', async ({ page }) => {
            /*
             * `body` and the page used to disagree -- `--background: #ffffff` under a
             * hardcoded `bg-[#e8e7e7]` -- so the variable was decorative and the literal
             * was what anyone saw. One source now, and `body` shows through to the same
             * colour rather than flashing a different one before the page paints.
             */
            const { ground, bodyBackground } = await palette(page)
            // The palette's ground, read from the token: typed out as `#e8e7e7`'s bytes
            // until graphics P1-3 moved it, which is the kind of copy row 5 removed.
            expect(rgb(ground)).toEqual(rgbBytes('ground'))
            expect(rgb(bodyBackground)).toEqual(rgb(ground))
        })

        test('and the page declares itself light, so the browser does not darken it', async ({ page }) => {
            // Without this a UA may auto-darken scrollbars and form controls over a page
            // that is staying light regardless.
            await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
        })
    })
}

test('the two schemes render identically', async ({ page }) => {
    /*
     * Stated as one assertion rather than inferred from the pairs above: after P2-3 the
     * system setting changes nothing at all, which is the honest position for a game whose
     * every colour is measured against one ground. A future real dark palette would fail
     * this test, which is the right way for it to arrive -- deliberately, with the
     * contrast pairs re-measured, not by a stylesheet block nobody checked.
     */
    await page.emulateMedia({ colorScheme: 'light' })
    await openBoard(page)
    const light = await palette(page)

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.reload()
    await page.locator('[data-board-shell]').waitFor()
    const dark = await palette(page)

    expect(dark).toEqual(light)
})
