import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { readBoard } from './play'

/**
 * A refusal said in words, in a browser (keyboard polish, section 3 of its contract in
 * NEXT-STEPS).
 *
 * Which reason each path stores is pinned in tests/refusalReasons.test.ts. What only a page
 * shows is here: the reason in the row under the board, in red; the one hidden announcer
 * that says it, and says Check and Hint; and the separation of the two, so that text coming
 * back into view is never announced a second time.
 *
 * The tests prove what the announcer holds, not what a screen reader says: a polite live
 * region may drop a message that arrives fast behind another. Speech is the manual check
 * in the contract's "Acceptance".
 */

const row = (page: Page) => page.locator('[data-advice]')
const announcer = (page: Page) => page.locator('[data-announcer]')
const cell = (page: Page, [i, j]: readonly [number, number]) => page.locator(`[data-cell="${i},${j}"]`)

const aRock = async (page: Page) => {
    const { size, board } = await readBoard(page)
    for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) if (board[i][j] === -1) return [i, j] as const
    throw new Error('today\'s board has no rock') // every published easy-1 has at least 8
}

/** A free square whose right-hand neighbour is also on the board, for a handled arrow. */
const aFreeSquare = async (page: Page) => {
    const { size, board } = await readBoard(page)
    for (let i = 0; i < size; i++) for (let j = 0; j + 1 < size; j++) if (board[i][j] === null) return [i, j] as const
    throw new Error('today\'s board has no free square')
}

/** Put the keyboard on a square: programmatic focus does (BoardSquare's `onFocus`). */
const focusOn = (page: Page, at: readonly [number, number]) => cell(page, at).focus()

/**
 * Tag the announcer's current message, so a later read can tell a new message from the same
 * one left in place. A repeat is only an announcement if the node is new.
 */
const tagMessage = (page: Page) => announcer(page).evaluate(el => {
    for (const child of Array.from(el.children)) child.setAttribute('data-seen', '')
})

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('the announcer is one polite status region, always there, and the visible row is not live', async ({ page }) => {
    await expect(announcer(page)).toHaveCount(1)
    await expect(announcer(page)).toHaveAttribute('role', 'status')
    await expect(announcer(page)).toHaveAttribute('aria-live', 'polite')
    await expect(announcer(page)).toHaveAttribute('aria-atomic', 'true')
    await expect(announcer(page)).toHaveText('')
    // Hidden to the eye, not to assistive technology.
    await expect(announcer(page)).not.toHaveAttribute('aria-hidden', /.*/)
    expect(await announcer(page).evaluate(el => el.getBoundingClientRect().width <= 1)).toBe(true)

    for (const attribute of ['role', 'aria-live', 'aria-atomic']) {
        await expect(row(page)).not.toHaveAttribute(attribute, /.*/)
    }
    // And the only live region on the page with advice in it.
    await expect(page.locator('[aria-live] [data-advice], [data-advice] [aria-live]')).toHaveCount(0)
})

test('a refusal, by key and by pointer, shows its reason in red and says it once', async ({ page }) => {
    const rock = await aRock(page)

    await focusOn(page, rock)
    await page.keyboard.press(' ')
    const reason = row(page).locator('[data-refusal-reason]')
    await expect(reason).toHaveText('That square is a rock.')
    await expect(reason).toHaveAttribute('data-refusal-reason', 'rock')
    await expect(reason).toHaveClass(/\btext-problem\b/)
    await expect(announcer(page)).toHaveText('That square is a rock.')
    // Said by the announcer, so not read a second time from the row.
    await expect(reason).toHaveAttribute('aria-hidden', 'true')

    // The same refusal again is a new message, not the old one left standing.
    await tagMessage(page)
    await page.keyboard.press('Enter')
    await expect(announcer(page)).toHaveText('That square is a rock.')
    await expect(announcer(page).locator('[data-seen]')).toHaveCount(0)

    // The pointer's refusal is said the same way.
    await tagMessage(page)
    await cell(page, rock).click()
    await expect(reason).toHaveText('That square is a rock.')
    await expect(announcer(page).locator('[data-seen]')).toHaveCount(0)
    await expect(announcer(page)).toHaveText('That square is a rock.')
})

test('the reason goes with the cross, from the row and from the announcer', async ({ page }) => {
    const rock = await aRock(page)
    const free = await aFreeSquare(page)
    await focusOn(page, rock)
    await page.keyboard.press(' ')
    await expect(page.locator('[data-refused]')).toHaveCount(1)
    await expect(announcer(page)).not.toHaveText('')

    // A handled key that refuses nothing: the cross goes, and the reason with it.
    await focusOn(page, free)
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[data-refused]')).toHaveCount(0)
    await expect(row(page).locator('[data-refusal-reason]')).toHaveCount(0)
    await expect(announcer(page)).toHaveText('')
})

test('Check\'s answer is announced once: a refusal covers it, and it comes back unannounced', async ({ page }) => {
    const rock = await aRock(page)
    const free = await aFreeSquare(page)

    await page.locator('[data-check]').click()
    const answer = await row(page).locator('[data-advice-kind]').textContent()
    expect(answer).toBeTruthy()
    await expect(announcer(page)).toHaveText(answer!)
    // Being said, it is hidden in the row; the announcer is the one copy.
    await expect(row(page).locator('[data-advice-kind]')).toHaveAttribute('aria-hidden', 'true')

    await focusOn(page, rock)
    await page.keyboard.press(' ')
    await expect(row(page)).toHaveText('That square is a rock.')
    await expect(announcer(page)).toHaveText('That square is a rock.')

    // From here, record every change the announcer goes through.
    await announcer(page).evaluate(el => {
        const w = window as unknown as { heard: string[] }
        w.heard = []
        new MutationObserver(records => {
            for (const r of records) for (const node of Array.from(r.addedNodes)) w.heard.push(node.textContent ?? '')
        }).observe(el, { childList: true, subtree: true, characterData: true })
    })

    await focusOn(page, free)
    await page.keyboard.press('ArrowRight')
    // Back in the row, for the eye and for reading, and nothing new in the announcer.
    await expect(row(page).locator('[data-advice-kind]')).toHaveText(answer!)
    await expect(row(page).locator('[data-advice-kind]')).not.toHaveAttribute('aria-hidden', /.*/)
    await expect(announcer(page)).toHaveText('')
    expect(await page.evaluate(() => (window as unknown as { heard: string[] }).heard)).toEqual([])
})

test('Pick a piece mode says its refusals the same way, by key and by pointer', async ({ page }) => {
    // Which piece a "no room" names is the unit tests': a square with no room depends on
    // the day's rocks, and a test that finds none would pass having tested nothing.
    const rock = await aRock(page)
    await page.locator('[data-controls-mode]').click()
    await expect(page.locator('[data-piece-picker]')).toBeVisible()

    await focusOn(page, rock)
    await page.keyboard.press(' ')
    await expect(row(page).locator('[data-refusal-reason]')).toHaveText('That square is a rock.')
    await expect(announcer(page)).toHaveText('That square is a rock.')

    await tagMessage(page)
    await cell(page, rock).click()
    await expect(announcer(page).locator('[data-seen]')).toHaveCount(0)
    await expect(announcer(page)).toHaveText('That square is a rock.')
})
