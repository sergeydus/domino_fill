import { test, expect, type Page } from '@playwright/test'
import { openBoard, waitForBoard } from './openBoard'
import { readBoard, drag } from './play'
import { onDate } from './calendar'

/**
 * Pick a piece mode, in a browser (NEXT-STEPS.md, PL1/PL2 and its implementation contract).
 *
 * The rule itself -- which position a held piece takes, the tie-break, the refusals, the
 * keyboard's Space and Enter -- is pinned in tests/pickAPiece.test.ts. What only a browser
 * shows is here: the switch beside Sound, a real right-click and the board's context menu,
 * keyboard focus and its preview, and where focus goes when the picker disappears. Touch
 * is in e2e/pickAPiece.touch.spec.ts, which runs in the touch-enabled project.
 */

const mode = (page: Page) => page.locator('[data-controls-mode]')
const picker = (page: Page) => page.locator('[data-piece-picker]')
const held = (page: Page, piece: 'upright' | 'flat') => page.locator(`[data-held-piece="${piece}"]`)
const cell = (page: Page, i: number, j: number) => page.locator(`[data-cell="${i},${j}"]`)
const upright = (page: Page, i: number, j: number) => page.locator(`[data-piece="one"][data-at="${i},${j}"]`)
const flat = (page: Page, i: number, j: number) => page.locator(`[data-piece="two"][data-at="${i},${j}"]`)
const placed = (page: Page) => page.locator('[data-piece="one"], [data-piece="two"]')

/** Today's board, as free cells. Rock layout is content, so every cell used is found. */
const freeCells = async (page: Page) => {
    const { size, board } = await readBoard(page)
    const free = (i: number, j: number) => i >= 0 && j >= 0 && i < size && j < size && board[i][j] === null
    return { size, free }
}

/** A cell where an upright piece fits both ways: free, with free cells above and below. */
const bothFitUpright = async (page: Page) => {
    const { size, free } = await freeCells(page)
    for (let i = 1; i + 1 < size; i++) {
        for (let j = 0; j < size; j++) {
            if (free(i, j) && free(i - 1, j) && free(i + 1, j)) return [i, j] as const
        }
    }
    throw new Error('today\'s board has no cell with room above and below')
}

/** Two such cells, with no cell in common between their upright placements. */
const twoBothFitUpright = async (page: Page) => {
    const { size, free } = await freeCells(page)
    const fits: [number, number][] = []
    for (let i = 1; i + 1 < size; i++) {
        for (let j = 0; j < size; j++) if (free(i, j) && free(i - 1, j) && free(i + 1, j)) fits.push([i, j])
    }
    const a = fits[0]
    const b = fits.find(([i, j]) => j !== a?.[1] || Math.abs(i - a[0]) > 1)
    if (!a || !b) throw new Error('today\'s board has no two separate cells with room above and below')
    return [a, b] as const
}

/** The preview is one box covering `i,j` and the cell below it: an upright piece there. */
const expectPreviewAt = async (page: Page, [i, j]: readonly [number, number]) => {
    const wash = page.locator('.bg-drag-wash')
    await expect(wash).toHaveCount(1)
    const top = (await cell(page, i, j).boundingBox())!
    const below = (await cell(page, i + 1, j).boundingBox())!
    await expect.poll(async () => {
        const box = (await wash.boundingBox())!
        return [box.x - top.x, box.y - top.y, box.y + box.height - (below.y + below.height)]
            .every(d => Math.abs(d) <= 1)
    }, { message: `the preview covers ${i},${j} and ${i + 1},${j}` }).toBe(true)
}

/** A bottom-row cell with a free cell above: an upright piece fits only as its bottom half. */
const bottomEdgeUpright = async (page: Page) => {
    const { size, free } = await freeCells(page)
    const i = size - 1
    for (let j = 0; j < size; j++) if (free(i, j) && free(i - 1, j)) return [i, j] as const
    throw new Error('today\'s bottom row has no free cell under a free cell')
}

const turnOn = async (page: Page) => {
    await mode(page).click()
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(picker(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
    await openBoard(page)
})

test('the switch sits beside Sound, starts off, and is remembered', async ({ page }) => {
    const row = page.locator('[data-chrome]', { has: page.locator('[data-mute]') })
    await expect(row.locator('[data-controls-mode]')).toHaveCount(1)
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'false')
    // Off: the tray is the legend, and nothing in it is a button.
    await expect(picker(page)).toHaveCount(0)
    await expect(page.locator('[data-legend] button')).toHaveCount(0)

    await turnOn(page)
    await expect(held(page, 'upright')).toHaveAttribute('aria-pressed', 'true')
    await expect(held(page, 'flat')).toHaveAttribute('aria-pressed', 'false')

    await page.reload()
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(picker(page)).toBeVisible()
    // The held piece is not remembered: a new visit holds upright again.
    await expect(held(page, 'upright')).toHaveAttribute('aria-pressed', 'true')
})

test('a click places the held piece: the tie-break, and the opposite at the bottom edge', async ({ page }) => {
    await turnOn(page)
    const [i, j] = await bothFitUpright(page)
    await cell(page, i, j).click()
    // Both fit: the clicked cell is the top half.
    await expect(upright(page, i, j)).toBeVisible()

    const [bi, bj] = await bottomEdgeUpright(page)
    await cell(page, bi, bj).click()
    // Only the position above fits: the clicked cell is the bottom half.
    await expect(upright(page, bi - 1, bj)).toBeVisible()
    await expect(placed(page)).toHaveCount(2)
})

test('the picker chooses the piece a click places', async ({ page }) => {
    await turnOn(page)
    await held(page, 'flat').click()
    await expect(held(page, 'flat')).toHaveAttribute('aria-pressed', 'true')
    const { size, free } = await freeCells(page)
    let target: [number, number] | null = null
    for (let i = 0; i < size && !target; i++) {
        for (let j = 0; j + 1 < size && !target; j++) if (free(i, j) && free(i, j + 1)) target = [i, j]
    }
    if (!target) throw new Error('today\'s board has no free flat run')
    await cell(page, ...target).click()
    // Flat, with the clicked cell its left half when the cell to its right is free.
    await expect(flat(page, target[0], target[1] + 1)).toBeVisible()
})

test('right-click switches the piece and never places or removes', async ({ page }) => {
    await turnOn(page)
    const [i, j] = await bothFitUpright(page)

    await cell(page, i, j).click({ button: 'right' })
    await expect(held(page, 'flat')).toHaveAttribute('aria-pressed', 'true')
    await expect(placed(page)).toHaveCount(0)

    // On a placed piece too: switches, and the piece stays.
    await held(page, 'upright').click()
    await cell(page, i, j).click()
    await expect(upright(page, i, j)).toBeVisible()
    await cell(page, i, j).click({ button: 'right' })
    await expect(held(page, 'flat')).toHaveAttribute('aria-pressed', 'true')
    await expect(upright(page, i, j)).toBeVisible()
    await expect(placed(page)).toHaveCount(1)
})

test('a middle click neither places nor removes: only the primary button does', async ({ page }) => {
    await turnOn(page)
    const [i, j] = await bothFitUpright(page)

    /*
     * Each middle press must reach the board, or a pass says nothing. Where the page
     * scrolls (the phone size), Chromium makes a middle press the start of autoscroll and
     * swallows the next press to end it -- measured: the left click after it arrived as a
     * lone `pointerup`. Escape ends autoscroll, so each middle click is followed by one.
     */
    await page.locator('.board-grid').evaluate(grid => {
        const w = window as unknown as { middles: number }
        w.middles = 0
        grid.addEventListener('pointerdown', e => { if ((e as PointerEvent).button === 1) w.middles++ })
    })
    const middle = async (a: number, b: number, n: number) => {
        await cell(page, a, b).click({ button: 'middle' })
        await page.keyboard.press('Escape')
        expect(await page.evaluate(() => (window as unknown as { middles: number }).middles)).toBe(n)
    }

    // On an empty cell: nothing placed, and the held piece unchanged.
    await middle(i, j, 1)
    await expect(placed(page)).toHaveCount(0)
    await expect(held(page, 'upright')).toHaveAttribute('aria-pressed', 'true')

    // On an occupied cell, either half: the piece stays.
    await cell(page, i, j).click()
    await expect(upright(page, i, j)).toBeVisible()
    await middle(i, j, 2)
    await middle(i + 1, j, 3)
    await expect(upright(page, i, j)).toBeVisible()
    await expect(placed(page)).toHaveCount(1)
})

test('the board\'s context menu is suppressed in Pick a piece mode, and only there', async ({ page }) => {
    // Read at the window, after React's own handler has run. What the default mode's right
    // button does to the board is a separate question and is not asserted here (codex).
    await page.evaluate(() => {
        const w = window as unknown as { menus: boolean[] }
        w.menus = []
        window.addEventListener('contextmenu', e => w.menus.push(e.defaultPrevented))
    })
    const menus = () => page.evaluate(() => (window as unknown as { menus: boolean[] }).menus)
    const [i, j] = await bothFitUpright(page)

    await cell(page, i, j).click({ button: 'right' })
    expect(await menus()).toEqual([false])

    await page.keyboard.press('Escape')
    await turnOn(page)
    await cell(page, i, j).click({ button: 'right' })
    expect(await menus()).toEqual([false, true])

    // Off the board, the menu is left alone even in Pick a piece mode.
    await mode(page).click({ button: 'right' })
    expect(await menus()).toEqual([false, true, false])
})

test('a drag still places what its direction makes, whatever is held', async ({ page }) => {
    await turnOn(page)
    await expect(held(page, 'upright')).toHaveAttribute('aria-pressed', 'true')
    const { size, free } = await freeCells(page)
    let run: [number, number] | null = null
    for (let i = 0; i < size && !run; i++) {
        for (let j = 0; j + 1 < size && !run; j++) if (free(i, j) && free(i, j + 1)) run = [i, j]
    }
    if (!run) throw new Error('today\'s board has no free flat run')
    await drag(page, run, [run[0], run[1] + 1])
    await expect(flat(page, run[0], run[1] + 1)).toBeVisible()
})

test('switching modes mid-gesture drops the offer and changes nothing', async ({ page }) => {
    // The default mode's tap on an open cell offers candidates and places nothing.
    const [i, j] = await bothFitUpright(page)
    await cell(page, i, j).click()
    await expect(page.locator('[data-candidate]').first()).toBeVisible()

    await mode(page).click()
    await expect(page.locator('[data-candidate]')).toHaveCount(0)
    await expect(placed(page)).toHaveCount(0)
})

test.describe('the keyboard', () => {
    const focusTo = async (page: Page, i: number, j: number) => {
        await page.locator('.board-grid').focus()
        await page.keyboard.press('ArrowDown') // lands on 0,0
        for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown')
        for (let k = 0; k < j; k++) await page.keyboard.press('ArrowRight')
        await expect(page.locator('[data-focus]')).toHaveAttribute('data-focus', `${i},${j}`)
    }

    test('focus previews the held piece; Enter places it, and Space on it refuses', async ({ page }) => {
        await turnOn(page)
        const [i, j] = await bothFitUpright(page)
        await focusTo(page, i, j)

        // The preview covers the focused cell and the one below: one box, two cells tall.
        const wash = page.locator('.bg-drag-wash')
        await expect(wash).toHaveCount(1)
        const box = (await wash.boundingBox())!
        const top = (await cell(page, i, j).boundingBox())!
        const below = (await cell(page, i + 1, j).boundingBox())!
        expect(Math.abs(box.y - top.y)).toBeLessThanOrEqual(1)
        expect(Math.abs(box.y + box.height - (below.y + below.height))).toBeLessThanOrEqual(1)

        await page.keyboard.press('Enter')
        await expect(upright(page, i, j)).toBeVisible()

        // Space on the piece just placed: refused, never removed.
        await page.keyboard.press(' ')
        await expect(upright(page, i, j)).toBeVisible()
        await expect(page.locator('[data-refused]')).toHaveCount(1)

        // Delete still removes it.
        await page.keyboard.press('Delete')
        await expect(placed(page)).toHaveCount(0)
    })

    test('with the mouse resting on one cell, the preview follows the keyboard to another', async ({ page }) => {
        await turnOn(page)
        const [a, b] = await twoBothFitUpright(page)

        // The mouse comes to rest on A: the preview is there.
        const rest = (await cell(page, ...a).boundingBox())!
        await page.mouse.move(rest.x + rest.width / 2, rest.y + rest.height / 2)
        await expectPreviewAt(page, a)

        // The keyboard goes to B with the mouse still on A: the preview goes with it, and
        // Enter places what it shows.
        await focusTo(page, ...b)
        await expectPreviewAt(page, b)
        await page.keyboard.press('Enter')
        await expect(upright(page, ...b)).toBeVisible()
        await expect(placed(page)).toHaveCount(1)
    })

    test('Tab into the board with the mouse resting elsewhere: the preview is where Space places', async ({ page }) => {
        // Tall enough that tabbing through the controls does not scroll the page. Measured at
        // 360x640: it did, the board moved out from under the resting mouse, and the test
        // passed with the fix removed -- the mouse was no longer over the square it names.
        await page.setViewportSize({ width: page.viewportSize()!.width, height: 1100 })

        /*
         * A published day, pinned before its board loads. Tab lands on the board's one tab
         * stop, 0,0 on a fresh board, so this test needs 0,0 and 1,0 free for the upright
         * piece -- and rocks are content: 2026-09-30's first easy board has one at 0,0
         * (codex), where a test on today's board would throw before it tested anything.
         * Noon UTC is that date from UTC-11 to UTC+11. `beforeEach` loaded today's board,
         * so the page is reloaded with the calendar moved; nothing was played on it.
         */
        const DAY = '2026-09-29'
        await page.addInitScript(onDate, Date.parse(`${DAY}T12:00:00Z`))
        await page.reload()
        await waitForBoard(page)
        expect(await page.evaluate(() => {
            const d = new Date()
            return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-')
        })).toBe(DAY)

        await turnOn(page)
        // The held piece is upright, so its placement at 0,0 is 0,0 and 1,0.
        const { size, free } = await freeCells(page)
        if (!free(0, 0) || !free(1, 0)) throw new Error(`${DAY}'s board has no upright room at 0,0`)
        let rest: [number, number] | null = null
        for (let i = 1; i + 1 < size && !rest; i++) {
            for (let j = 1; j < size && !rest; j++) if (free(i, j) && free(i - 1, j) && free(i + 1, j)) rest = [i, j]
        }
        if (!rest) throw new Error(`${DAY}'s board has no cell with room above and below off column 0`)

        const box = (await cell(page, ...rest).boundingBox())!
        const mouse = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        await page.mouse.move(mouse.x, mouse.y)
        await expectPreviewAt(page, rest)
        const underMouse = () => page.evaluate(({ x, y }) =>
            document.elementFromPoint(x, y)?.closest('[data-cell]')?.getAttribute('data-cell'), mouse)

        // A real Tab entry, from outside the board: no key ever reaches the board's handler.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        for (let n = 0; n < 40; n++) {
            await page.keyboard.press('Tab')
            if (await page.evaluate(() => !!document.activeElement?.closest('[data-cell]'))) break
        }
        await expect(cell(page, 0, 0)).toBeFocused()
        // The mouse is still resting on the other square, so the preview had a rival.
        expect(await underMouse()).toBe(`${rest[0]},${rest[1]}`)
        expect(await page.evaluate(() => window.scrollY)).toBe(0)

        // Before Space: the preview has followed focus.
        await expectPreviewAt(page, [0, 0])
        await page.keyboard.press(' ')
        await expect(upright(page, 0, 0)).toBeVisible()
        await expect(placed(page)).toHaveCount(1)
    })

    test('a refused Space is still the board\'s: the page does not scroll', async ({ page }) => {
        // Short enough that the page overflows at either project's width.
        await page.setViewportSize({ width: page.viewportSize()!.width, height: 420 })
        await turnOn(page)
        const [i, j] = await bothFitUpright(page)
        await focusTo(page, i, j)
        await page.keyboard.press('Enter') // a piece to refuse on
        await expect(upright(page, i, j)).toBeVisible()

        const scroll = () => page.evaluate(() => ({
            y: window.scrollY,
            room: document.documentElement.scrollHeight - window.innerHeight - window.scrollY,
        }))
        const start = await scroll()
        // There is somewhere for Space to scroll to, so a pass is not the page being full.
        expect(start.room).toBeGreaterThan(0)

        // Whether the board claimed the key, read at the window after React's handler ran.
        await page.evaluate(() => {
            const w = window as unknown as { spaces: boolean[] }
            w.spaces = []
            window.addEventListener('keydown', e => { if (e.key === ' ') w.spaces.push(e.defaultPrevented) })
        })
        await page.keyboard.press(' ')
        await expect(page.locator('[data-refused]')).toHaveCount(1)
        expect(await page.evaluate(() => (window as unknown as { spaces: boolean[] }).spaces)).toEqual([true])
        // Keyboard scrolling is animated, so a scroll would not show at once: give it time.
        await page.waitForTimeout(600)
        expect((await scroll()).y).toBe(start.y)
        await expect(upright(page, i, j)).toBeVisible()
    })
})

test('the tutorial keeps the default controls it teaches, in Pick a piece mode', async ({ page }) => {
    await turnOn(page)
    // A fresh page without `openBoard`'s script, so the tutorial shows; the mode is stored.
    const fresh = await page.context().newPage()
    await fresh.goto('/')
    await fresh.evaluate(() => localStorage.removeItem('hasSeenTutorial'))
    await fresh.reload()
    const tutorial = fresh.locator('div.fixed.inset-0')
    await expect(tutorial.locator('[data-cell="0,0"]')).toBeVisible()

    // An open cell of the 2x2: the default tap offers candidates and places nothing, where
    // Pick a piece mode would have placed the held piece.
    await tutorial.locator('[data-cell="0,0"]').click()
    await expect(tutorial.locator('[data-candidate]').first()).toBeVisible()
    await expect(tutorial.locator('[data-piece="one"], [data-piece="two"]')).toHaveCount(0)
    await fresh.close()
})

test.describe('focus when the mode changes', () => {
    test('focus on the picker moves to the switch when the picker goes', async ({ page }) => {
        await turnOn(page)
        await held(page, 'flat').focus()
        // Activated without moving focus, as a browser that does not focus a clicked button
        // (Safari) would: `click()` on the element leaves focus where it is.
        await mode(page).evaluate(el => (el as HTMLElement).click())
        await expect(picker(page)).toHaveCount(0)
        await expect(mode(page)).toBeFocused()
    })

    test('focus on a control that survives the switch stays where it is', async ({ page }) => {
        const reset = page.locator('[data-reset]')
        await reset.focus()
        await mode(page).evaluate(el => (el as HTMLElement).click())
        await expect(picker(page)).toBeVisible()
        await expect(reset).toBeFocused()
        await mode(page).evaluate(el => (el as HTMLElement).click())
        await expect(picker(page)).toHaveCount(0)
        await expect(reset).toBeFocused()
    })

    test('activating the switch from the keyboard keeps focus on it', async ({ page }) => {
        await mode(page).focus()
        await page.keyboard.press('Enter')
        await expect(mode(page)).toHaveAttribute('aria-pressed', 'true')
        await expect(mode(page)).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(mode(page)).toHaveAttribute('aria-pressed', 'false')
        await expect(mode(page)).toBeFocused()
    })
})
