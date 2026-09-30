import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { readBoard } from './play'
import { KEY_INSTRUCTIONS, guideText } from '../app/dominoFill/keyGuide'

/**
 * The key guide and the board's full instructions, in a browser (keyboard polish, section 2
 * of its contract in NEXT-STEPS).
 *
 * The wording is pinned in tests/keyGuide.test.ts. Here: when the guide shows (the keyboard
 * on the board, and nothing else to say), that it moves nothing (one line at 360px, and the
 * board keeps its size), and that the instructions are the grid's description from the
 * start, per mode. The markup, not the speech: whether a screen reader reads a grid's
 * description as focus lands on a cell is the contract's manual check.
 */

const guide = (page: Page) => page.locator('[data-key-guide]')
const row = (page: Page) => page.locator('[data-advice]')
const grid = (page: Page) => page.locator('[role="grid"]')
const cell = (page: Page, [i, j]: readonly [number, number]) => page.locator(`[data-cell="${i},${j}"]`)
const pickMode = async (page: Page) => {
    await page.locator('[data-controls-mode]').click()
    await expect(page.locator('[data-piece-picker]')).toBeVisible()
}

const squares = async (page: Page) => {
    const { size, board } = await readBoard(page)
    let rock: [number, number] | null = null
    let free: [number, number] | null = null
    for (let i = 0; i < size; i++) {
        for (let j = 0; j + 1 < size; j++) {
            if (!rock && board[i][j] === -1) rock = [i, j]
            if (!free && board[i][j] === null) free = [i, j]
        }
    }
    if (!rock || !free) throw new Error('today\'s board has no rock or no free square off the last column')
    return { rock, free }
}

/** The keyboard on a square, drawn: programmatic focus, then a key the board handles. */
const keyboardOn = async (page: Page, at: readonly [number, number]) => {
    await cell(page, at).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
}

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('the guide is the mode\'s, and shows only while the keyboard is on the board', async ({ page }) => {
    const { free } = await squares(page)
    await expect(guide(page)).toHaveCount(0)

    await keyboardOn(page, free)
    await expect(guide(page)).toHaveText(guideText('drag'))
    // Its equivalent for a screen reader is the grid's description, so it is not read twice.
    await expect(guide(page)).toHaveAttribute('aria-hidden', 'true')
    await expect(guide(page).locator('strong')).toHaveText(['Space', 'arrow', 'Delete'])

    // A press hides it, as it hides the focus marker. Released off the board, so that it
    // places nothing and offers nothing: a silent cancellation, not a move.
    const box = (await cell(page, free).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await expect(guide(page)).toHaveCount(0)
    await page.mouse.move(1, 1)
    await page.mouse.up()
    await expect(guide(page)).toHaveCount(0)

    // So does focus leaving the board.
    await keyboardOn(page, free)
    await expect(guide(page)).toHaveCount(1)
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-cell]:focus')).toHaveCount(0)
    await expect(guide(page)).toHaveCount(0)

    await pickMode(page)
    await keyboardOn(page, free)
    await expect(guide(page)).toHaveText(guideText('pick'))
})

test('a refusal\'s reason and a Check answer take the row; the guide comes back after', async ({ page }) => {
    const { rock, free } = await squares(page)
    await keyboardOn(page, free)
    await expect(guide(page)).toHaveCount(1)

    await cell(page, rock).focus()
    await page.keyboard.press(' ')
    await expect(row(page)).toHaveText('That square is a rock.')
    await expect(guide(page)).toHaveCount(0)

    // A handled key clears the refusal, and with nothing else to say, the guide is back.
    await keyboardOn(page, free)
    await expect(guide(page)).toHaveText(guideText('drag'))

    await page.locator('[data-check]').click()
    await keyboardOn(page, free)
    await expect(row(page).locator('[data-advice-kind]')).toBeVisible()
    await expect(guide(page)).toHaveCount(0)
})

/** Take the keyboard off the board, so the guide goes. */
const blur = async (page: Page) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await expect(guide(page)).toHaveCount(0)
}

test('one line at 360px, in both modes', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    const { free } = await squares(page)
    for (const mode of ['drag', 'pick'] as const) {
        if (mode === 'pick') await pickMode(page)
        await blur(page)
        await keyboardOn(page, free)
        await expect(guide(page)).toHaveText(guideText(mode))
        // Every fragment of the span starts within half a line of the first. Not a count of
        // rects -- Chrome returns one per text run and child, six for the default mode's line
        // on a single line.
        const { spread, line } = await guide(page).evaluate(el => {
            const tops = Array.from(el.getClientRects(), r => r.top)
            return { spread: Math.max(...tops) - Math.min(...tops), line: parseFloat(getComputedStyle(el).lineHeight) }
        })
        expect(spread, `${mode}: its fragments' tops`).toBeLessThan(line / 2)
    }
})

/*
 * Two sizes, because only one of them could show a change. At 360x640 the board is limited by
 * the width, and a taller row only lengthens the page: a guide that grew the row passed a size
 * check there (mutation-tested). At 1280x800 the board is limited by the height, so a row that
 * grows takes it from the board -- the chips' shorter row gave it 36px there.
 */
for (const viewport of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    test(`appearing moves nothing at ${viewport.width}x${viewport.height}: the row's height and the board's size`, async ({ page }) => {
        await page.setViewportSize(viewport)
        const { free } = await squares(page)
        const frame = page.locator('[data-board-frame]')
        const sizes = async () => {
            const box = (await frame.boundingBox())!
            const rowHeight = (await row(page).boundingBox())!.height
            return [box.width, box.height, rowHeight].map(n => Math.round(n * 10) / 10)
        }

        /*
         * Read once the layout has settled. Switching to Pick a piece gives the board the
         * height the legend's taller row took (530 to 566px here), a frame or more after the
         * picker shows; read at once, "before" was the old board.
         */
        const settled = async () => {
            let last = ''
            await expect.poll(async () => {
                const now = JSON.stringify(await sizes())
                const same = now === last
                last = now
                return same
            }, { intervals: [250], message: 'the layout settles' }).toBe(true)
            return JSON.parse(last) as number[]
        }

        for (const mode of ['drag', 'pick'] as const) {
            if (mode === 'pick') await pickMode(page)
            await blur(page)
            const before = await settled()
            await keyboardOn(page, free)
            await expect(guide(page)).toHaveText(guideText(mode))
            await expect.poll(sizes, { message: `${mode}: the board and the row with the guide` }).toEqual(before)
        }
    })
}

test('the grid is described by the full instructions from the start, per mode', async ({ page }) => {
    const description = async () => {
        const id = await grid(page).getAttribute('aria-describedby')
        expect(id, 'the grid names a description').toBeTruthy()
        const el = page.locator(`[id="${id}"]`)
        await expect(el).toHaveCount(1)
        return el
    }

    // Before any focus: it has to be there when focus arrives, not appear with it.
    const drag = await description()
    await expect(drag).toHaveText(KEY_INSTRUCTIONS.drag)
    // Hidden to the eye, and not to assistive technology.
    expect(await drag.evaluate(el => el.getBoundingClientRect().width <= 1)).toBe(true)
    await expect(drag).not.toHaveAttribute('aria-hidden', /.*/)
    await expect(drag).not.toHaveAttribute('hidden', /.*/)

    await pickMode(page)
    await expect(await description()).toHaveText(KEY_INSTRUCTIONS.pick)
})
