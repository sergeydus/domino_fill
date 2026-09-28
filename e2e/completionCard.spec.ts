import { test, expect, type Locator, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { playSolution } from './play'
import { VISUAL_URL } from './server'
import { waitForRest } from './rest'
import { rgbBytes } from '../app/palette'
import { DIFFICULTY_NAME } from '../app/dominoFill/DifficultySlider'

/**
 * The completion card's hierarchy (graphics spec P2-3, row 15), by computed style.
 *
 * Three levels, loudest first: the outcome ("Solved!", the card-title role, bold, `success`),
 * which puzzle it was (the body role, medium), and the actions (secondary controls). Each
 * level differs from each other level in size *and* in weight, so the order reads without
 * colour, and the outcome is the largest and heaviest text on the card.
 *
 * On the component sheet, where the card is a fixture on baselines 1 and 2, and on a board
 * really solved, twice: the detail line names the puzzle the store says was solved, so it
 * cannot be a constant that happens to match the sheet.
 */

type Text = { text: string, size: number, weight: number, colour: string }

const textOf = (el: Locator): Promise<Text> => el.evaluate(node => {
    const cs = getComputedStyle(node)
    return {
        text: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
        size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), colour: cs.color,
    }
})

const rgb = (bytes: readonly number[]) => `rgb(${bytes.join(', ')})`

/** The card's three levels, read, and held to the hierarchy. Returns the detail line's text. */
const expectHierarchy = async (page: Page) => {
    const card = page.locator('[data-completion-card]')
    await expect(card).toBeVisible()
    // At rest first: the card animates in and scrolls itself into view, and a position read
    // on the way is a position from a different moment than the next one read.
    await waitForRest(page)
    await expect(card).toHaveAttribute('role', 'status')
    await expect(card).toHaveAttribute('aria-live', 'polite')

    const outcome = await textOf(card.locator('[data-completion-message]'))
    const detail = await textOf(card.locator('[data-completion-detail]'))
    const actions = await Promise.all((await card.locator('button').all()).map(textOf))
    expect(actions.length, 'the card has its actions').toBeGreaterThanOrEqual(1)

    // The levels, as the spec names them.
    expect(outcome).toMatchObject({ text: 'Solved!', size: 24, weight: 700, colour: rgb(rgbBytes('success')) })
    expect({ size: detail.size, weight: detail.weight }).toEqual({ size: 14, weight: 500 })
    for (const a of actions) expect({ text: a.text, size: a.size, weight: a.weight }).toEqual({ text: a.text, size: 16, weight: 400 })

    // Every pair of levels differs in size and in weight, not one or the other.
    const levels = [['outcome', outcome], ['detail', detail], ...actions.map(a => [`"${a.text}"`, a] as const)] as const
    for (const [i, [an, a]] of levels.entries()) {
        for (const [bn, b] of levels.slice(i + 1)) {
            if (an.startsWith('"') && bn.startsWith('"')) continue // two actions are one level
            expect(a.size, `${an} and ${bn}: size`).not.toBe(b.size)
            expect(a.weight, `${an} and ${bn}: weight`).not.toBe(b.weight)
        }
    }

    // The outcome is the loudest text on the card: no text on it is as large, or as heavy.
    const all = await card.evaluate(root => Array.from(root.querySelectorAll('*'))
        .filter(el => Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ''))
        .map(el => ({ el: el.textContent!.trim(), size: parseFloat(getComputedStyle(el).fontSize), weight: Number(getComputedStyle(el).fontWeight) })))
    for (const t of all.filter(t => t.el !== 'Solved!')) {
        expect(t.size, `"${t.el}" is as large as the outcome`).toBeLessThan(outcome.size)
        expect(t.weight, `"${t.el}" is as heavy as the outcome`).toBeLessThan(outcome.weight)
    }

    // In that order, top to bottom, the actions beneath both: read in one pass, so every
    // position is from the same moment.
    const order = await card.evaluate(root => {
        const box = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } }
        return {
            outcome: box(root.querySelector('[data-completion-message]')!),
            detail: box(root.querySelector('[data-completion-detail]')!),
            actions: Array.from(root.querySelectorAll('button')).map(b => ({ text: b.textContent!.trim(), ...box(b) })),
        }
    })
    expect(order.outcome.bottom).toBeLessThanOrEqual(order.detail.top)
    for (const a of order.actions) expect(order.detail.bottom, `"${a.text}" is beneath the detail`).toBeLessThanOrEqual(a.top)

    // The card is the panel, not a `success` surface; "Solved!" is the green on it.
    await expect(card).toHaveCSS('background-color', rgb(rgbBytes('panel')))
    return detail.text
}

test.describe('the completion card: outcome, detail, actions', () => {
    for (const cell of [38, 53]) {
        test(`on the component sheet at ${cell}px`, async ({ page }) => {
            await page.goto(`${VISUAL_URL}/visual?cell=${cell}`)
            await expect(page.locator('main[data-sheet]')).toBeVisible()
            // The sheet's store is on its first puzzle, easy.
            expect(await expectHierarchy(page)).toBe(`${DIFFICULTY_NAME.easy} · puzzle 1 of 3`)
        })
    }

    test('on a board really solved, naming the puzzle that was', async ({ page }) => {
        await openBoard(page)
        await page.locator('[data-difficulty="normal"]').click()
        await expect(page.locator('[data-difficulty="normal"]')).toHaveAttribute('aria-pressed', 'true')
        // Which puzzle the store is on, from the level selector's own label.
        const position = (await page.getByRole('group', { name: /^Puzzle \d of 3$/ }).getAttribute('aria-label'))!
        const level = /^Puzzle (\d) of 3$/.exec(position)![1]
        await playSolution(page)
        expect(await expectHierarchy(page)).toBe(`${DIFFICULTY_NAME.normal} · puzzle ${level} of 3`)
    })
})
