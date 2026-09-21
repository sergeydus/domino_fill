import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { drag, playSolution, solutionFor } from './play'

/**
 * Check and Hint in a browser (spec P1-5, row 18e).
 *
 * The rules are pinned in `tests/advice.test.ts` and the wiring in
 * `tests/adviceSession.test.ts`. What only a browser can show:
 *
 *   - the production solver runs **in the client**, on a real 6x6 to 8x8 corpus board,
 *     fast enough to answer a button press. Every unit test of it runs in Node;
 *   - both controls are reachable and operable from the keyboard alone, and the answer
 *     reaches assistive technology through a live region rather than only by being visible;
 *   - pressing Hint leaves the board alone, checked against the DOM rather than the store.
 */

const advice = (page: Page) => page.locator('[data-advice]')

/** Where the board holds a piece, as the DOM reports it. */
const pieces = async (page: Page) =>
    (await page.locator('[data-piece]:not([data-piece="rock"])').evaluateAll(
        els => els.map(el => `${el.getAttribute('data-piece')}@${el.getAttribute('data-at')}`)
    )).sort()

/** A free cell with a free cell below it, so one downward drag is always legal. */
const freeRun = async (page: Page) => {
    const n = Math.sqrt(await page.locator('[data-cell]').count())
    const rocks = new Set(await page.locator('[data-piece="rock"]').evaluateAll(
        els => els.map(el => el.getAttribute('data-at')!)
    ))
    for (let j = 0; j < n; j++) {
        for (let i = 0; i + 1 < n; i++) {
            if (!rocks.has(`${i},${j}`) && !rocks.has(`${i + 1},${j}`)) return { i, j }
        }
    }
    throw new Error('the served board has no free vertical run')
}

test.beforeEach(async ({ page }) => { await openBoard(page) })

test.describe('Check', () => {
    test('answers for an untouched board', async ({ page }) => {
        // The solver, in the browser, over the day's real puzzle.
        await page.locator('[data-check]').click()
        await expect(advice(page)).toContainText('can still be finished')
        await expect(page.locator('[data-advice-kind]')).toHaveAttribute('data-advice-kind', 'on-track')
    })

    test('says nothing until it is asked', async ({ page }) => {
        // The region exists from the start -- a live region that appears together with its
        // text is a well-known way to have nothing announced -- but it is empty.
        await expect(advice(page)).toBeAttached()
        await expect(advice(page)).toHaveText('')
    })

    test('announces politely, so it cannot interrupt a move', async ({ page }) => {
        await expect(advice(page)).toHaveAttribute('role', 'status')
        await expect(advice(page)).toHaveAttribute('aria-live', 'polite')
        await expect(advice(page)).toHaveAttribute('aria-atomic', 'true')
    })
})

test.describe('Hint', () => {
    test('marks a cell and does not fill it', async ({ page }) => {
        const before = await pieces(page)

        await page.locator('[data-hint]').click()
        await expect(page.locator('[data-hinted]')).toHaveCount(1)

        // Read from the DOM, not from the store: the guarantee is about the board the
        // player is looking at.
        expect(await pieces(page)).toEqual(before)
        const marked = await page.locator('[data-hinted]').getAttribute('data-cell')
        expect(await page.locator(`[data-cell="${marked}"] [data-piece]`).count()).toBe(0)
    })

    test('says where, in rows and columns the player can count', async ({ page }) => {
        await page.locator('[data-hint]').click()
        await expect(advice(page)).toContainText(/Row \d+, column \d+ holds/)
        // Never a bare pip value: "1" is a quiz, "the top half of an upright domino" is not.
        await expect(advice(page)).toContainText(/half of a/)
    })

    test('the mark goes away when the player plays', async ({ page }) => {
        await page.locator('[data-hint]').click()
        await expect(page.locator('[data-hinted]')).toHaveCount(1)

        const { i, j } = await freeRun(page)
        await drag(page, [i, j], [i + 1, j])

        // Otherwise it keeps pointing at a square that is no longer empty.
        await expect(page.locator('[data-hinted]')).toHaveCount(0)
        await expect(advice(page)).toHaveText('')
    })

    test('undo clears the answer too', async ({ page }) => {
        const { i, j } = await freeRun(page)
        await drag(page, [i, j], [i + 1, j])
        await page.locator('[data-check]').click()
        await expect(advice(page)).not.toHaveText('')

        await page.locator('[data-undo]').click()
        await expect(advice(page)).toHaveText('')
    })
})

test.describe('a position that cannot be finished', () => {
    /*
     * The case the feature exists for, on a real corpus board rather than a 2x2 fixture.
     * The solver has to recognise an unsolvable 6x6 *and* walk the undo stack back over
     * it, in the browser, inside a button press -- which is the one claim no unit test in
     * Node can make.
     *
     * The wrong move is found rather than hardcoded: the served board depends on the date,
     * so the solution is read from the page and a legal placement that is not part of it
     * is chosen.
     */
    const wrongMove = async (page: Page) => {
        const solution = await solutionFor(page)
        const inSolution = new Set(solution.map(
            ({ from, to }) => `${from[0]},${from[1]}-${to[0]},${to[1]}`))
        const n = Math.sqrt(await page.locator('[data-cell]').count())
        const rocks = new Set(await page.locator('[data-piece="rock"]').evaluateAll(
            els => els.map(el => el.getAttribute('data-at')!)))

        for (let i = 0; i + 1 < n; i++) {
            for (let j = 0; j < n; j++) {
                if (rocks.has(`${i},${j}`) || rocks.has(`${i + 1},${j}`)) continue
                if (inSolution.has(`${i},${j}-${i + 1},${j}`)) continue
                return { from: [i, j] as const, to: [i + 1, j] as const }
            }
        }
        throw new Error('every legal vertical placement is part of the solution')
    }

    test('Check says so, and how far back to undo', async ({ page }) => {
        const { from, to } = await wrongMove(page)
        await drag(page, from, to)

        await page.locator('[data-check]').click()

        await expect(page.locator('[data-advice-kind]'))
            .toHaveAttribute('data-advice-kind', 'wrong')
        // One move in, one move back. Actionable advice, not "something is wrong".
        await expect(advice(page)).toContainText('Undo 1 move to')
    })

    test('Hint says a piece is wrong instead of pointing at a cell', async ({ page }) => {
        const { from, to } = await wrongMove(page)
        await drag(page, from, to)

        await page.locator('[data-hint]').click()

        await expect(page.locator('[data-advice-kind]'))
            .toHaveAttribute('data-advice-kind', 'wrong')
        // Nothing is forced on a board that cannot be finished, so nothing is marked.
        await expect(page.locator('[data-hinted]')).toHaveCount(0)
    })

    test('undoing that far really does reach a position Check likes', async ({ page }) => {
        // The advice is only worth giving if following it works.
        const { from, to } = await wrongMove(page)
        await drag(page, from, to)
        await page.locator('[data-check]').click()
        await expect(advice(page)).toContainText('Undo 1 move to')

        await page.locator('[data-undo]').click()
        await page.locator('[data-check]').click()

        await expect(advice(page)).toContainText('can still be finished')
    })
})

test.describe('from the keyboard alone', () => {
    /*
     * P1-8's standing complaint about this codebase is that the level arrows are
     * `motion.div`s with an `onClick` -- unreachable by keyboard and invisible to assistive
     * technology. New controls do not get to join that pile, so this walks to them with Tab
     * and presses them with Enter and Space, with no pointer involved at all.
     */
    const focusControl = async (page: Page, selector: string) => {
        for (let i = 0; i < 40; i++) {
            if (await page.locator(selector).evaluate(el => el === document.activeElement)) return
            await page.keyboard.press('Tab')
        }
        throw new Error(`${selector} was never reached by Tab`)
    }

    test('Check is reachable by Tab and fires on Enter', async ({ page }) => {
        await focusControl(page, '[data-check]')
        await page.keyboard.press('Enter')
        await expect(advice(page)).toContainText('can still be finished')
    })

    test('Hint is reachable by Tab and fires on Space', async ({ page }) => {
        await focusControl(page, '[data-hint]')
        await page.keyboard.press(' ')
        await expect(page.locator('[data-hinted]')).toHaveCount(1)
    })

    test('the controls are real buttons, named by their text', async ({ page }) => {
        // `getByRole` fails if they are divs with click handlers, which is the point.
        await expect(page.getByRole('button', { name: 'Check' })).toBeEnabled()
        await expect(page.getByRole('button', { name: 'Hint' })).toBeEnabled()
    })
})

test.describe('a finished board', () => {
    test('offers neither control', async ({ page }) => {
        /*
         * Nothing either of them could say. A control that answers "this is already done"
         * is a control that wasted a press -- and the board is inert at this point anyway,
         * so a hint would point at a square that cannot be filled.
         */
        await playSolution(page)

        await expect(page.locator('[data-check]')).toBeDisabled()
        await expect(page.locator('[data-hint]')).toBeDisabled()
    })
})
