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

/**
 * Where today's rocks are, according to the squares -- not the overlay.
 *
 * The squares' labels are built from the store's board; the rock drawings are the thing
 * under test. Reading rocks from the drawings (as `readBoard` above does, reasonably,
 * for suites that are not about the drawings) would let a missing rock drawing corrupt the
 * test's own bookkeeping: measured, it sent a domino onto the undrawn rock, the placement
 * failed, and the test died before reaching the comparison meant to catch it -- a kill for
 * the wrong reason, and only on days the missing rock lay on the chosen run.
 */
export const rockSquares = (page: Page) => page.locator('[data-cell]').evaluateAll(els => els
    .filter(el => /, rock(,|$)/.test(el.getAttribute('aria-label') ?? ''))
    .map(el => el.getAttribute('data-cell')!)
    .sort())

/** An upright and a flat run of two free squares, not overlapping, on today's board. */
export const freeRuns = async (page: Page, rocks: readonly string[]) => {
    const size = Math.sqrt(await page.locator('[data-cell]').count())
    const rock = new Set(rocks)
    const free = (i: number, j: number) => i < size && j < size && !rock.has(`${i},${j}`)

    let upright: [number, number] | null = null
    for (let j = 0; j < size && !upright; j++) {
        for (let i = 0; i + 1 < size && !upright; i++) {
            if (free(i, j) && free(i + 1, j)) upright = [i, j]
        }
    }
    if (!upright) throw new Error('today\'s board has no free upright run')
    const [ui, uj] = upright
    const taken = (i: number, j: number) => j === uj && (i === ui || i === ui + 1)

    for (let i = 0; i < size; i++) {
        for (let j = 0; j + 1 < size; j++) {
            if (free(i, j) && free(i, j + 1) && !taken(i, j) && !taken(i, j + 1)) {
                return { upright, flat: [i, j] as [number, number] }
            }
        }
    }
    throw new Error('today\'s board has no free flat run beside the upright one')
}
