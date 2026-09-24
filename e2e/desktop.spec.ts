import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { RAIL_WIDTH_PX, WIDE_BOARD_CAP_PX } from '../app/dominoFill/composition'

/**
 * The desktop composition (graphics spec P0-1, row 1).
 *
 * Measured before this row, at 1280x800: the board shell was 363px wide in a 1280px
 * viewport — 28.4% of it — and an 8x8 board's cells were 41px, because five stacked chrome
 * rows were being subtracted from the height the board had to fit in. The rest of the
 * screen was ground. That is the phone's composition handed to a machine with four times
 * the room.
 *
 * Above the breakpoint the secondary controls move beside the board instead of above and
 * below it, so they cost width — which a desktop has — instead of height, which is what
 * the board is actually short of.
 *
 * Everything here is a browser question. The breakpoint is a media query, the rail's cost
 * is a layout fact, and the cap only shows up on a display bigger than this window.
 */

/**
 * How many `data-chrome` rows the page has, in either composition.
 *
 * The same five in both, because the wide layout *moves* them rather than adding any:
 * difficulty, legend, advice, controls, navigation. The board's height budget is the sum
 * of these, so a duplicate would be subtracted twice.
 */
const CHROME_ROWS = 5

const hard = async (page: Page) => {
    await page.getByRole('button', { name: /hard/i }).click()
    await expect(page.locator('[data-cell]')).toHaveCount(64)
}

const geometry = (page: Page) => page.evaluate(() => {
    const cell = document.querySelector('[data-cell]')?.getBoundingClientRect()
    const shell = document.querySelector('[data-board-shell]')?.getBoundingClientRect()
    const stage = document.querySelector('[data-stage]')?.getBoundingClientRect()
    const doc = document.documentElement
    return {
        wide: document.querySelector('[data-stage]')?.hasAttribute('data-wide') ?? false,
        cell: cell?.width ?? 0,
        shell: shell?.width ?? 0,
        composition: stage?.width ?? 0,
        viewport: doc.clientWidth,
        overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
    }
})

test('the board gets the room a desktop actually has', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openBoard(page)
    await hard(page)

    const g = await geometry(page)
    expect(g.wide, 'the wide composition should be on at 1280x800').toBe(true)

    /*
     * The two numbers the spec commits to, at the viewport it commits to them at. Scoped
     * deliberately: "at least 60% of the width" is a reasonable demand of a 1280px window
     * and an unreasonable one of a 3440px ultrawide, where the cap below is what should be
     * doing the deciding.
     */
    expect(g.cell, `8x8 cells were 41px before this row`).toBeGreaterThanOrEqual(56)
    expect(g.composition / g.viewport, 'the composition should fill the window')
        .toBeGreaterThanOrEqual(0.6)
    expect(g.overflowX, 'nothing may scroll sideways').toBe(0)
})

test('the rail takes the controls, and the legend stays with the board', async ({ page }) => {
    /*
     * Which controls move is a product decision (graphics spec 2.3), so it is asserted
     * rather than left to whoever edits the JSX next. The legend is the interesting half:
     * it looks like chrome and is not. It explains what is *on* the board — SPEC.md P1-1
     * is explicit that it is a scoring key rather than a control — so it stays where the
     * thing it explains is.
     */
    await page.setViewportSize({ width: 1280, height: 800 })
    await openBoard(page)

    const rail = page.locator('[data-rail]')
    await expect(rail).toHaveCount(1)
    await expect(rail).toHaveCSS('width', `${RAIL_WIDTH_PX}px`)

    for (const selector of [
        '[data-difficulty]',
        '[data-level="previous"]',
        '[data-open-archive]',
        '[data-mute]',
    ]) {
        await expect(rail.locator(selector).first(), `${selector} belongs in the rail`)
            .toHaveCount(1)
    }
    for (const name of [/check/i, /hint/i, /undo/i, /reset/i]) {
        await expect(rail.getByRole('button', { name })).toHaveCount(1)
    }

    await expect(rail.locator('[data-legend]'), 'the legend is not chrome').toHaveCount(0)

    /*
     * Moved, not copied -- found by mutation, which is the only way this shows up. A
     * composition that renders the controls in the column *and* the rail puts two Resets
     * on the screen, and every assertion scoped to the rail passes while it does.
     *
     * The row count is the same invariant from the other side: `data-chrome` is what the
     * board's height budget is computed from, and a duplicated row would quietly spend it
     * twice.
     */
    for (const name of [/check/i, /hint/i, /undo/i, /reset/i, /archive/i, /^sound$/i]) {
        await expect(page.getByRole('button', { name }), `${name} appears twice`)
            .toHaveCount(1)
    }
    await expect(page.locator('[data-difficulty]')).toHaveCount(3)
    expect(await page.locator('[data-chrome]').count(), 'a chrome row was duplicated')
        .toBe(CHROME_ROWS)

    // And it is beside the board rather than merely elsewhere: same column, and its box
    // sits within the board shell's horizontal span.
    const shell = (await page.locator('[data-board-shell]').boundingBox())!
    const legend = (await page.locator('[data-legend]').boundingBox())!
    expect(legend.x).toBeGreaterThanOrEqual(shell.x - 1)
    expect(legend.x + legend.width).toBeLessThanOrEqual(shell.x + shell.width + 1)
})

test('the difficulty selector fits inside the rail, whichever option is selected', async ({ page }) => {
    /*
     * Found by row 4's desktop baseline, not by a test: the selector's content was 268px in
     * the 260px rail, and "Hard 8x8" ran 8px past the rail and off its own grey background.
     * Nothing here measured it, because every assertion above is about where a control is,
     * not whether it is inside what holds it.
     *
     * Each option in turn, because the selected one is bold and bold is wider -- the widest
     * arrangement is whichever the player happens to be on. The rail's width is a constant,
     * so one viewport answers for every desktop width.
     */
    await page.setViewportSize({ width: 1280, height: 800 })
    await openBoard(page)

    const group = page.getByRole('group', { name: 'Difficulty' })

    for (const key of ['easy', 'normal', 'hard']) {
        await page.locator(`[data-difficulty="${key}"]`).click()
        await expect(page.locator(`[data-difficulty="${key}"]`)).toHaveAttribute('aria-pressed', 'true')

        // Read afresh: a different board size moves the rail.
        const rail = (await page.locator('[data-rail]').boundingBox())!
        const box = (await group.boundingBox())!
        expect(box.x, `${key}: the selector starts left of the rail`).toBeGreaterThanOrEqual(rail.x)
        expect(box.x + box.width, `${key}: the selector is wider than the rail`)
            .toBeLessThanOrEqual(rail.x + rail.width)
        /*
         * The group stretches to the rail whatever its content, so its own box passes an
         * overflow. The options have to sit inside its *content* box: found by mutation, a
         * 250px rail pushed the last option 2px into the group's padding, which neither
         * `scrollWidth` nor the border box reports -- and the padding is 8px, the size of
         * the defect this test exists for.
         */
        const inner = await group.evaluate(el => {
            const r = el.getBoundingClientRect()
            const s = getComputedStyle(el)
            return {
                left: r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft),
                right: r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight),
            }
        })
        for (const option of await group.getByRole('button').all()) {
            const b = (await option.boundingBox())!
            const name = await option.textContent()
            expect(b.x, `${key}: "${name}" starts outside the selector`)
                .toBeGreaterThanOrEqual(inner.left)
            expect(b.x + b.width, `${key}: "${name}" runs past the selector`)
                .toBeLessThanOrEqual(inner.right)
        }
    }
})

/** Which control has the keyboard, by the attribute that identifies it. */
const focusedControl = (page: Page) => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (el === null || el === document.body) return null
    for (const name of ['data-reset', 'data-mute', 'data-check', 'data-open-archive']) {
        if (el.hasAttribute(name)) return name
    }
    return el.tagName
})

test('the keyboard keeps its place across the breakpoint', async ({ page }) => {
    /*
     * Crossing the breakpoint moves a control between the column and the rail, and React
     * reparents by unmounting and rebuilding -- so the focused node is destroyed. Measured
     * before the fix: focus fell to `<body>` in both directions. A keyboard player
     * resizing a window, or a tablet being rotated, lost their place entirely.
     *
     * Both directions, because they are different code paths in the composition and only
     * one of them was ever going to be tried by hand.
     */
    await page.setViewportSize({ width: 1280, height: 800 })
    await openBoard(page)

    await page.locator('[data-reset]').focus()
    expect(await focusedControl(page)).toBe('data-reset')

    await page.setViewportSize({ width: 1000, height: 800 })
    await expect(page.locator('[data-rail]')).toHaveCount(0)
    expect(await focusedControl(page), 'narrowing dropped the keyboard').toBe('data-reset')
    await expect(page.locator('[data-reset]'), 'and left a second Reset behind').toHaveCount(1)

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator('[data-rail]')).toHaveCount(1)
    expect(await focusedControl(page), 'widening dropped the keyboard').toBe('data-reset')
    await expect(page.locator('[data-reset]')).toHaveCount(1)

    // A second crossing with the same control focused, which is the case a naive
    // implementation loses: the remembered target is identical, React skips the render,
    // and nothing restores anything.
    await page.setViewportSize({ width: 1000, height: 800 })
    await expect(page.locator('[data-rail]')).toHaveCount(0)
    expect(await focusedControl(page), 'the second crossing dropped it').toBe('data-reset')
})

test('the rail control that moves is the one that comes back', async ({ page }) => {
    // Not merely "something is focused": the key has to identify the control, or a
    // restoration that lands on the first button of the group would pass.
    await page.setViewportSize({ width: 1000, height: 800 })
    await openBoard(page)

    await page.locator('[data-mute]').focus()
    expect(await focusedControl(page)).toBe('data-mute')

    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.locator('[data-rail]')).toHaveCount(1)
    expect(await focusedControl(page)).toBe('data-mute')
    await expect(page.locator('[data-mute]')).toHaveCount(1)
})

test('the control that comes back is the exact one, not its first sibling', async ({ page }) => {
    /*
     * Found by mutation. `data-reset` is a bare marker, so a key that dropped attribute
     * *values* still found the right button and every test passed. The difficulty selector
     * is three buttons distinguished only by their value: with the value dropped, the
     * keyboard comes back on "Easy" no matter which option it left from.
     */
    await page.setViewportSize({ width: 1280, height: 800 })
    await openBoard(page)

    await page.locator('[data-difficulty="hard"]').focus()
    await page.setViewportSize({ width: 1000, height: 800 })
    await expect(page.locator('[data-rail]')).toHaveCount(0)

    expect(await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.getAttribute('data-difficulty')))
        .toBe('hard')
})

test('a player who clicked away is not dragged back', async ({ page }) => {
    /*
     * The other half of the contract, and the reason the target is captured at the moment
     * of the change rather than remembered from the last `focusin`. Someone who has
     * clicked the page background has no focus on purpose; handing it to a control they
     * last used minutes ago is a jump they did not ask for.
     */
    await page.setViewportSize({ width: 1280, height: 800 })
    await openBoard(page)

    await page.locator('[data-reset]').focus()
    await page.mouse.click(4, 4)
    expect(await focusedControl(page), 'clicking the background should focus nothing').toBeNull()

    await page.setViewportSize({ width: 1000, height: 800 })
    await expect(page.locator('[data-rail]')).toHaveCount(0)
    expect(await focusedControl(page), 'focus was restored to a control nobody asked for')
        .toBeNull()
})

test('focus already on the board is not taken away by the rearrangement', async ({ page }) => {
    /*
     * The restoration must be able to say no. A player reading the board with the keyboard
     * has their focus on a square, and squares do not move between the compositions --
     * they are in the column in both. Resizing the window must leave them exactly where
     * they were rather than handing the keyboard to whichever button the rail shuffled.
     *
     * This is what makes the capture's answer of "nothing to restore" load-bearing: a key
     * that fell back to *some* control for anything focused, or a restore that ran
     * regardless, would drag the player off the board here and pass everywhere else.
     */
    await page.setViewportSize({ width: 1280, height: 800 })
    await openBoard(page)

    await page.locator('[data-cell="3,3"]').focus()
    expect(await page.evaluate(() =>
        document.activeElement?.getAttribute('data-cell'))).toBe('3,3')

    await page.setViewportSize({ width: 1000, height: 800 })
    await expect(page.locator('[data-rail]')).toHaveCount(0)

    expect(await page.evaluate(() =>
        document.activeElement?.getAttribute('data-cell')), 'the board lost the keyboard')
        .toBe('3,3')
})

test('the board stops growing, and the cap is what stops it', async ({ page }) => {
    /*
     * A board that grows with the window is not better at 2560px; it is a board whose
     * cells are the size of a matchbox and whose targets are a head-turn apart. Asserted
     * two ways, because either alone could pass while the cap did nothing: the shell obeys
     * the constant, and two very different displays produce the identical board — which
     * only happens if something other than the viewport is deciding.
     */
    await page.setViewportSize({ width: 1920, height: 1200 })
    await openBoard(page)
    await hard(page)
    const atLarge = await geometry(page)

    await page.setViewportSize({ width: 2560, height: 1440 })
    await expect.poll(async () => (await geometry(page)).viewport).toBe(2560)
    const atHuge = await geometry(page)

    expect(atHuge.shell).toBeLessThanOrEqual(WIDE_BOARD_CAP_PX)
    expect(atHuge.cell, 'the same board on a much larger display').toBe(atLarge.cell)
    expect(atHuge.overflowX).toBe(0)
})

test('the rail keeps its width when the board is squeezed', async ({ page }) => {
    /*
     * The one place the width reserve is reachable, and it took arithmetic to find.
     *
     * `useAvailableBoardBox` subtracts the rail from the board's width budget, but with
     * the 720px cap in force that subtraction never binds on an ordinary display: at any
     * width past the 1024px breakpoint the cap is the smaller number, so removing the
     * reserve changes nothing and the test would prove nothing.
     *
     * Horizontal safe-area insets are what make it bite. A 1024x1366 tablet in portrait
     * with 120px of inset per side leaves 768px of content width, which is under the cap,
     * so the board's budget is decided by the subtraction -- and without it the board
     * takes 712px of a 768px space and shoulders the rail off the screen.
     *
     * Insets are driven directly because Chromium cannot emulate a device's safe area;
     * `e2e/layout.spec.ts` does the same and says the same about what that proves.
     */
    await page.setViewportSize({ width: 1024, height: 1366 })
    await openBoard(page)
    await hard(page)
    await expect(page.locator('[data-rail]')).toHaveCount(1)

    const cellBefore = (await page.locator('[data-cell="0,0"]').boundingBox())!.width

    await page.evaluate(() => {
        document.documentElement.style.setProperty('--safe-left', '120px')
        document.documentElement.style.setProperty('--safe-right', '120px')
    })
    await expect
        .poll(async () => (await page.locator('[data-cell="0,0"]').boundingBox())!.width)
        .toBeLessThan(cellBefore)

    // The board gave way, the rail did not, and nothing went off the side.
    await expect(page.locator('[data-rail]')).toHaveCSS('width', `${RAIL_WIDTH_PX}px`)
    const g = await geometry(page)
    expect(g.overflowX, 'the board took width the rail needed').toBe(0)
    expect(g.composition).toBeLessThanOrEqual(g.viewport)
})

test('below the breakpoint it is one column, in the order it always had', async ({ page }) => {
    // 1000px is wide enough for a rail and not wide enough to deserve one; the point of a
    // breakpoint is that it is a decision rather than a gradient.
    await page.setViewportSize({ width: 1000, height: 800 })
    await openBoard(page)
    await hard(page)

    await expect(page.locator('[data-rail]')).toHaveCount(0)
    expect((await geometry(page)).wide).toBe(false)

    /*
     * The order, asserted in document order rather than by eye: the difficulty selector
     * above the board, the legend under it, the controls and navigation at the bottom.
     * This is the composition every layout criterion in SPEC.md was measured against, so
     * "unchanged" has to mean something a test can check.
     */
    const order = await page.evaluate(() => {
        const marks = [...document.querySelectorAll(
            '[data-difficulty], [data-board-shell], [data-legend], [data-advice], [data-level], [data-mute]')]
        return marks.map(el => el.getAttribute('data-difficulty') !== null ? 'difficulty'
            : el.hasAttribute('data-board-shell') ? 'board'
                : el.hasAttribute('data-legend') ? 'legend'
                    : el.hasAttribute('data-advice') ? 'advice'
                        : el.hasAttribute('data-mute') ? 'sound' : 'level')
    })
    expect(order.indexOf('difficulty')).toBeLessThan(order.indexOf('board'))
    expect(order.indexOf('board')).toBeLessThan(order.indexOf('legend'))
    expect(order.indexOf('legend')).toBeLessThan(order.indexOf('advice'))
    expect(order.indexOf('advice')).toBeLessThan(order.indexOf('level'))
    expect(order.indexOf('level')).toBeLessThan(order.indexOf('sound'))
})

test('a wide but short window keeps the single column', async ({ page }) => {
    /*
     * The height half of the query, which exists because the rail is the part that has to
     * fit: measured at 322px tall, it does not belong in a 600px window that also has to
     * hold a board. Without this, 1280x600 would qualify on width alone and the rail would
     * push the board below the fold.
     */
    await page.setViewportSize({ width: 1280, height: 600 })
    await openBoard(page)

    await expect(page.locator('[data-rail]')).toHaveCount(0)
    expect((await geometry(page)).wide).toBe(false)
})
