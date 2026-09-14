import { expect, type Page } from '@playwright/test'
import { solve } from './solve'

/**
 * Driving a real board through the pointer verb, shared by the suites that need a board in
 * a particular *state* rather than a board at rest.
 *
 * These read the puzzle out of the DOM and solve it, because the board on screen is whichever
 * one the day's date selects -- no fixture can name it. See e2e/solve.ts for why the solver
 * lives in the tests and why it is not P1-6's.
 */

/** Read the board's rocks and targets out of the rendered DOM. */
export const readBoard = async (page: Page) => {
    const size = Math.sqrt(await page.locator('[data-cell]').count())
    const rocks = new Set(await page.locator('[data-piece="rock"]').evaluateAll(
        els => els.map(el => el.getAttribute('data-at')!)
    ))
    const board = Array.from({ length: size }, (_, i) =>
        Array.from({ length: size }, (_, j) => (rocks.has(`${i},${j}`) ? -1 : null))
    )

    const numbers = (selector: string) => page.locator(selector).evaluateAll(
        els => els.map(el => Number(el.textContent!.trim()))
    )
    return {
        size,
        board,
        columnTargets: await numbers('[data-col-label]'),
        rowTargets: await numbers('[data-row-label]'),
    }
}

export const drag = async (page: Page, from: readonly [number, number], to: readonly [number, number]) => {
    await page.locator(`[data-cell="${from[0]},${from[1]}"]`).hover()
    await page.mouse.down()
    await page.locator(`[data-cell="${to[0]},${to[1]}"]`).hover()
    await page.mouse.up()
}

/** Play a solution through the pointer verb, exactly as a player would. */
export const playSolution = async (page: Page) => {
    for (const { from, to } of await solutionFor(page)) await drag(page, from, to)
}

export const solutionFor = async (page: Page) => {
    const { board, columnTargets, rowTargets } = await readBoard(page)
    const placements = solve(board, columnTargets, rowTargets)
    expect(placements, 'the served board is solvable').not.toBeNull()
    return placements!
}

