import { test, expect, type Page } from '@playwright/test'
import { BASE_URL, VISUAL_URL } from './server'
import { pinDay, LATE_IN_A_MONTH } from './calendar'

/*
 * Slice 3b, rule 14: what the Results button and the streak count cost the board, measured
 * against the public page at every viewport the layout suite uses, for every board size,
 * with 3a's criteria (codex):
 * - where the public page doesn't scroll vertically, the enabled page doesn't either;
 * - where the public page's unclamped height cell meets the 38px minimum, the enabled
 *   page's does too (some viewports are below it already, and stay as they are);
 * - where the public page already scrolls, the enabled page scrolls by no more than the
 *   chrome it adds, and the numbers are reported.
 * States: covered, and playing with Results shown, both with the widest count, "🔥 3653"
 * (the corpus has 3,653 days); and an archive day, with no clock and no Results, the count
 * still shown. The count is made by seeding the coordinator's history through the fixture:
 * no test can play 3,653 days.
 *
 * Named `*.layout.spec.ts` so only the `layout` project runs it: it sets its own viewports.
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
const ARCHIVE_DAY = '2026-09-20'

type Measure = { scroll: number, cell: number, used: number }

/** The page's vertical scroll, its unclamped height cell, and the chrome's total height. */
const measure = (page: Page, n: number): Promise<Measure> => page.evaluate(n => {
    const column = document.querySelector('[data-stage]')!.firstElementChild as HTMLElement
    let used = 0
    for (const el of column.querySelectorAll<HTMLElement>('[data-chrome]')) used += el.offsetHeight
    const inFlow = [...column.children].filter(child =>
        !['fixed', 'absolute'].includes(getComputedStyle(child).position)).length
    const gap = parseFloat(getComputedStyle(column).rowGap) || 0
    used += gap * Math.max(0, inFlow - 1)
    const height = innerHeight - used - 16
    return {
        scroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        cell: Math.floor((height - 8) / (n + 0.7)),
        used,
    }
}, n)

const settle = (page: Page) => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))))

/**
 * 3,653 consecutive played days up to yesterday, and optionally a result on today's Hard 3: a
 * board the measurement never starts. The seed goes into the history only, not storage, so a
 * Start on the seeded board would commit a fresh attempt over it (measured, on Medium 1).
 */
const seed = (page: Page, todaysResult: boolean) => page.evaluate(todaysResult => {
    const fixture = window.dailyFixture!
    const pad = (n: number) => String(n).padStart(2, '0')
    const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const today = new Date()
    const attempts = Array.from({ length: 3653 }, (_, n) => {
        const date = key(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1 - n))
        return { puzzleId: `seed|${date}`, definitionHash: 'seed', date, ruleset: 1 as const,
            startedAt: 0, assisted: false, clockError: false, result: { kind: 'solved' as const, ms: 1 }, finishedAt: 1 }
    })
    if (todaysResult) {
        const definition = fixture.root.boardsStore.hardBoards![2]
        attempts.push({ puzzleId: definition.puzzleId, definitionHash: definition.definitionHash, date: key(today),
            ruleset: 1, startedAt: 0, assisted: false, clockError: false, result: { kind: 'solved', ms: 1 }, finishedAt: 1 })
    }
    fixture.seed(attempts)
}, todaysResult)

const pickArchiveDay = async (page: Page) => {
    await page.getByRole('button', { name: 'Archive' }).click()
    await page.locator(`[data-archive-day="${ARCHIVE_DAY}"]`).click()
    await expect(page.locator('[data-archive]')).toHaveCount(0)
}

type State = 'covered' | 'playing with Results' | 'archive day'
const STATES: State[] = ['covered', 'playing with Results', 'archive day']

for (const viewport of VIEWPORTS) {
    test(`Results and the streak cost no new scrolling and no floor at ${viewport.name}`, async ({ browser }) => {
        const findings: string[] = []
        for (const state of STATES) {
            // A context per state: the attempts one state starts are stored, and would leave
            // the next state's board already in play.
            const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } })
            await context.addInitScript(() => localStorage.setItem('hasSeenTutorial', 'true'))
            const publicPage = await context.newPage()
            const enabledPage = await context.newPage()
            await pinDay(publicPage, LATE_IN_A_MONTH)
            await pinDay(enabledPage, LATE_IN_A_MONTH)
            await publicPage.goto(`${BASE_URL}/`)
            await enabledPage.goto(`${VISUAL_URL}/visual/daily`)
            await expect(publicPage.locator('[data-cell]').first()).toBeVisible({ timeout: 15_000 })
            await expect(enabledPage.locator('[data-challenge-cover="ready"]')).toBeVisible({ timeout: 15_000 })
            const todaysResult = state === 'playing with Results'
            await seed(enabledPage, todaysResult)
            // Today's result makes today a played day too: 3,654. Four digits either way.
            await expect(enabledPage.locator('[data-streak-count]')).toContainText(todaysResult ? '🔥 3654' : '🔥 3653')
            if (state === 'archive day') {
                await pickArchiveDay(publicPage)
                await pickArchiveDay(enabledPage)
                await expect(enabledPage.locator('[data-challenge-clock]')).toHaveCount(0)
            }
            for (const size of SIZES) {
                await publicPage.locator(`[data-difficulty="${size.key}"]`).click()
                await expect(publicPage.locator('[data-cell]')).toHaveCount(size.n * size.n)
                await enabledPage.locator(`[data-difficulty="${size.key}"]`).click()
                if (state === 'covered') {
                    await expect(enabledPage.locator('[data-cover-board]')).toContainText(`${size.n}×${size.n}`)
                } else if (state === 'playing with Results') {
                    await expect(enabledPage.locator('[data-cover-board]')).toContainText(`${size.n}×${size.n}`)
                    await enabledPage.getByRole('button', { name: 'Start', exact: true }).click()
                    await expect(enabledPage.locator('[data-cell]')).toHaveCount(size.n * size.n)
                    await expect(enabledPage.getByRole('button', { name: 'Results' })).toBeVisible()
                } else {
                    await expect(enabledPage.locator('[data-cell]')).toHaveCount(size.n * size.n)
                    await expect(enabledPage.getByRole('button', { name: 'Results' })).toHaveCount(0)
                }
                await settle(publicPage)
                await settle(enabledPage)
                const plain = await measure(publicPage, size.n)
                const enabled = await measure(enabledPage, size.n)
                const label = `${state}, ${size.n}x${size.n}`
                findings.push(`${label}: public scroll ${plain.scroll} cell ${plain.cell}; `
                    + `enabled scroll ${enabled.scroll} cell ${enabled.cell}; chrome +${enabled.used - plain.used}`)
                if (plain.scroll === 0) {
                    expect(enabled.scroll, `${label}: no new vertical scroll`).toBe(0)
                } else {
                    expect(enabled.scroll, `${label}: at most the added chrome more`)
                        .toBeLessThanOrEqual(plain.scroll + Math.max(0, enabled.used - plain.used) + 1)
                }
                if (plain.cell >= FLOOR) {
                    expect(enabled.cell, `${label}: the unclamped cell stays at the floor or above`)
                        .toBeGreaterThanOrEqual(FLOOR)
                }
            }
            await context.close()
        }
        // The measured margins, for the As built notes.
        console.log(`${viewport.name}\n  ${findings.join('\n  ')}`)
    })
}
