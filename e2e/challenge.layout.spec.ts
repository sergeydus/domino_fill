import { test, expect, type Page } from '@playwright/test'
import { VISUAL_URL } from './server'
import { pinDay, LATE_IN_A_MONTH } from './calendar'

/*
 * Slice 3a, rule 14: what the challenge's clock row costs the board, measured against the
 * public page at every viewport the layout suite uses, for every board size.
 *
 * A 38px-cell check alone could pass while the row made the page scroll, because
 * `squareSize` clamps the height budget to the floor (codex). So the comparison is made
 * before the clamp, on the budget itself, the same sum `useAvailableBoardBox` makes:
 * - where the public page doesn't scroll vertically, the enabled page doesn't either;
 * - where it already does, the enabled page scrolls by at most the clock row and one gap
 *   more;
 * - the unclamped height cell stays at or above 38px wherever it is today.
 * The enabled page is measured covered: rule 10 gives the cover and the revealed board
 * the same budget, and `challengeUi.spec.ts` checks the two boxes are equal.
 *
 * Named `*.layout.spec.ts` so only the `layout` project runs it: it sets its own viewports.
 *
 * **"The public page" above is `/visual/daily?challenge=off`** since the challenge went live on
 * the public page (slice 3b, rule 16): the same fixture with the challenge off, which is the
 * public page as it was. It's measured live rather than against recorded numbers, which
 * would not hold on the CI runner, whose text renders wider.
 */

const VIEWPORTS = [
    { name: '360x640 phone', width: 360, height: 640 },
    { name: '390x844 phone', width: 390, height: 844 },
    { name: '800x400 landscape', width: 800, height: 400 },
    { name: '1280x800 @ 50%', width: 2560, height: 1600 },
    { name: '1280x800 @ 100%', width: 1280, height: 800 },
    { name: '1280x800 @ 150%', width: 853, height: 533 },
    { name: '1280x800 @ 200%', width: 640, height: 400 },
]
const SIZES = [
    { key: 'easy', n: 6 },
    { key: 'normal', n: 7 },
    { key: 'hard', n: 8 },
] as const
const FLOOR = 38

type Measure = { scroll: number, cell: number, row: number }

/** The page's vertical scroll, its unclamped height cell, and the clock row's cost. */
const measure = (page: Page, n: number): Promise<Measure> => page.evaluate(n => {
    const column = document.querySelector('[data-stage]')!.firstElementChild as HTMLElement
    let used = 0
    for (const el of column.querySelectorAll<HTMLElement>('[data-chrome]')) used += el.offsetHeight
    const inFlow = [...column.children].filter(child =>
        !['fixed', 'absolute'].includes(getComputedStyle(child).position)).length
    const gap = parseFloat(getComputedStyle(column).rowGap) || 0
    used += gap * Math.max(0, inFlow - 1)
    // No safe-area insets in this browser; the page margin is 8px a side.
    const height = innerHeight - used - 16
    const clockRow = document.querySelector('[data-challenge-clock]')?.parentElement as HTMLElement | undefined
    return {
        scroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        cell: Math.floor((height - 8) / (n + 0.7)),
        row: clockRow ? clockRow.offsetHeight + gap : 0,
    }
}, n)

const settle = (page: Page) => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))))

for (const viewport of VIEWPORTS) {
    test(`the clock row costs no new scrolling and no floor at ${viewport.name}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
        await context.addInitScript(() => localStorage.setItem('hasSeenTutorial', 'true'))
        const casualPage = await context.newPage()
        const enabledPage = await context.newPage()
        await pinDay(casualPage, LATE_IN_A_MONTH)
        await pinDay(enabledPage, LATE_IN_A_MONTH)
        await casualPage.goto(`${VISUAL_URL}/visual/daily?challenge=off`)
        await enabledPage.goto(`${VISUAL_URL}/visual/daily`)
        await expect(casualPage.locator('[data-cell]').first()).toBeVisible({ timeout: 15_000 })
        await expect(enabledPage.locator('[data-challenge-cover="ready"]')).toBeVisible({ timeout: 15_000 })

        const findings: string[] = []
        for (const size of SIZES) {
            await casualPage.locator(`[data-difficulty="${size.key}"]`).click()
            await expect(casualPage.locator('[data-cell]')).toHaveCount(size.n * size.n)
            await enabledPage.locator(`[data-difficulty="${size.key}"]`).click()
            await expect(enabledPage.locator('[data-cover-board]')).toContainText(`${size.n}×${size.n}`)
            await settle(casualPage)
            await settle(enabledPage)
            const plain = await measure(casualPage, size.n)
            const enabled = await measure(enabledPage, size.n)
            findings.push(`${size.n}x${size.n}: public scroll ${plain.scroll} cell ${plain.cell}; `
                + `enabled scroll ${enabled.scroll} cell ${enabled.cell}; row ${enabled.row}`)
            expect(enabled.row, `${size.n}x${size.n}: the clock row is there`).toBeGreaterThan(0)
            if (plain.scroll === 0) {
                expect(enabled.scroll, `${size.n}x${size.n}: no new vertical scroll`).toBe(0)
            } else {
                expect(enabled.scroll, `${size.n}x${size.n}: at most the row more`)
                    .toBeLessThanOrEqual(plain.scroll + enabled.row + 1)
            }
            if (plain.cell >= FLOOR) {
                expect(enabled.cell, `${size.n}x${size.n}: the unclamped cell stays at the floor or above`)
                    .toBeGreaterThanOrEqual(FLOOR)
            }
        }
        // The measured margins, for the As built notes.
        console.log(`${viewport.name}\n  ${findings.join('\n  ')}`)
        await context.close()
    })
}
