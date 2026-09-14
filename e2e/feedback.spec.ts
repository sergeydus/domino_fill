import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { playSolution } from './play'

/**
 * Honest feedback in a real browser (spec P1-5, D10-f and D10-g).
 *
 * The rules are pinned in tests/lineFeedback.test.ts and tests/rejection.test.ts. What needs
 * a browser is that the state reaches the screen: that a label carries a shape and not only
 * a colour, that the computed contrast is what the palette promises, and that a refused move
 * visibly moves the board.
 */

const occupied = async (page: Page) => {
    const pieces = await page.locator('[data-piece]').evaluateAll(
        els => els.map(el => ({ kind: el.getAttribute('data-piece')!, at: el.getAttribute('data-at')! }))
    )
    const cells = new Set<string>()
    for (const { kind, at } of pieces) {
        const [i, j] = at.split(',').map(Number)
        cells.add(`${i},${j}`)
        if (kind === 'one') cells.add(`${i + 1},${j}`)
        if (kind === 'two') cells.add(`${i},${j - 1}`)
    }
    return cells
}

/** A cell with a free cell below it. */
const freeRun = async (page: Page) => {
    const n = Math.sqrt(await page.locator('[data-cell]').count())
    const taken = await occupied(page)
    for (let j = 0; j < n; j++) {
        for (let i = 0; i + 1 < n; i++) {
            if (!taken.has(`${i},${j}`) && !taken.has(`${i + 1},${j}`)) return { i, j }
        }
    }
    throw new Error('the fixture board has no free run')
}

/** A cell that already holds a domino half, to drag onto. */
const occupiedNeighbourDrag = async (page: Page) => {
    const { i, j } = await freeRun(page)
    const from = page.locator(`[data-cell="${i},${j}"]`)
    const to = page.locator(`[data-cell="${i + 1},${j}"]`)
    await from.hover()
    await page.mouse.down()
    await to.hover()
    await page.mouse.up()
    return { i, j }
}

/**
 * A free cell in the top row with a free cell beneath it.
 *
 * The keyboard can walk to it along row 0 without caring what it crosses -- focus moves over
 * rocks -- and once anchored there, Up aims off the board and is refused by a rule that
 * cannot depend on the day's puzzle. (An earlier version of this test assumed `0,0` itself;
 * probed, it is a rock on the board the date currently selects, so Space was refused before
 * any anchor existed.)
 */
const topRowAnchor = async (page: Page) => {
    const n = Math.sqrt(await page.locator('[data-cell]').count())
    const taken = await occupied(page)
    for (let j = 0; j < n; j++) {
        if (!taken.has(`0,${j}`) && !taken.has(`1,${j}`)) return j
    }
    throw new Error('the served board has no free cell in row 0 with a free cell below it')
}

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('every label starts neutral and says so in the DOM', async ({ page }) => {
    const labels = page.locator('[data-col-label], [data-row-label]')
    const states = await labels.evaluateAll(els => els.map(el => el.getAttribute('data-line-state')))

    expect(states.length).toBeGreaterThan(0)
    // A fresh board may legitimately have a satisfied line if a target is 0 and the line is
    // all rocks, so this asserts the attribute exists and is one of the three, not that it
    // is neutral everywhere.
    for (const state of states) expect(['neutral', 'satisfied', 'over']).toContain(state)
})

test('label state reaches the screen as contrast, not just as colour', async ({ page }) => {
    /*
     * D10-g's third defect. Measured against the `#e8e7e7` board: the old neutral was
     * 1.86:1 and the old green 1.66:1 -- the state colour being the least legible thing on
     * screen. Recomputed here from what the browser actually painted, so a CSS change that
     * darkens the background is caught too.
     */
    const contrast = await page.locator('[data-col-label]').first().evaluate(el => {
        const luminance = (rgb: string) => {
            const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map(Number)
            const channel = (v: number) => {
                const c = v / 255
                return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
            }
            return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
        }
        // Walk up for the first non-transparent background actually behind the text.
        let node: HTMLElement | null = el as HTMLElement
        let background = 'rgb(255, 255, 255)'
        while (node) {
            const bg = getComputedStyle(node).backgroundColor
            if (bg && !bg.includes('rgba(0, 0, 0, 0)')) { background = bg; break }
            node = node.parentElement
        }
        const [hi, lo] = [luminance(getComputedStyle(el).color), luminance(background)]
            .sort((a, b) => b - a)
        return (hi + 0.05) / (lo + 0.05)
    })

    expect(contrast).toBeGreaterThanOrEqual(4.5)
})

test('a satisfied line is struck through, so colour is not the only channel', async ({ page }) => {
    /*
     * This used to walk the labels and assert *inside* `if (state === 'satisfied')`, which
     * meant it asserted nothing at all unless the served puzzle happened to start with a
     * finished line -- a test that quietly does not run rather than one that passes.
     *
     * A satisfied line is now produced rather than hoped for: solving the board finishes
     * every line by definition. The solver is the test fixture from e2e/solve.ts, not a
     * player-facing one (see the note there).
     */
    await playSolution(page)

    const satisfied = page.locator('[data-line-state="satisfied"]')
    const n = await satisfied.count()
    // A solved board has every line complete, so this is the whole label set, not a subset.
    expect(n, 'solving the board satisfies every line').toBeGreaterThan(0)

    for (let k = 0; k < n; k++) {
        const label = satisfied.nth(k)
        await expect(label).toHaveCSS('text-decoration-line', 'line-through')
        // The shape is not the only extra channel: a screen reader reaches neither colour
        // nor strikethrough, so the state is in the accessible name too.
        await expect(label).toHaveAttribute('aria-label', /complete/i)
    }

    // And a neutral label carries neither shape, so the channels actually distinguish.
    const neutral = page.locator('[data-line-state="neutral"]')
    for (let k = 0; k < await neutral.count(); k++) {
        await expect(neutral.nth(k)).not.toHaveCSS('text-decoration-line', 'line-through')
        await expect(neutral.nth(k)).toHaveCSS('outline-style', 'none')
    }
})

test('an overshot line is ringed, which is a different shape from a finished one', async ({ page }) => {
    /*
     * Overshooting needs horizontal pieces, and the arithmetic is why: a vertical domino
     * contributes 1 pip to its column and 0 to the next, so a six-cell column holding three
     * of them reaches 3 -- it cannot pass a target above that. A horizontal domino puts a
     * whole 2 into one row, so laying them along a single row climbs fast enough to pass any
     * shipped target. (An earlier version placed verticals and skipped itself for lack of an
     * overshoot, which is the test quietly not running rather than passing.)
     */
    const n = Math.sqrt(await page.locator('[data-cell]').count())
    const taken = await occupied(page)
    const over = page.locator('[data-line-state="over"]')

    for (let i = 0; i < n; i++) {
        for (let j = 0; j + 1 < n; j += 2) {
            if (taken.has(`${i},${j}`) || taken.has(`${i},${j + 1}`)) continue
            await page.locator(`[data-cell="${i},${j}"]`).hover()
            await page.mouse.down()
            await page.locator(`[data-cell="${i},${j + 1}"]`).hover()
            await page.mouse.up()
            if (await over.count() > 0) {
                await expect(over.first()).toHaveCSS('outline-style', 'solid')
                // And it is a different shape from satisfied, not merely a different colour.
                await expect(over.first()).not.toHaveCSS('text-decoration-line', 'line-through')
                return
            }
        }
    }

    throw new Error('filling rows with flat pieces never passed a target; the fixture changed')
})

test('the board is still at rest on load, and does not shake at nothing', async ({ page }) => {
    /*
     * Guards a regression that broke eleven other tests before it was caught.
     *
     * `lastOutcome` starts as `'none'` -- honest, since nothing has happened -- but a view
     * reading that as "rejected" shakes the board on load. Measured at the time:
     * `translateX(-5.64px)` while the page was settling, which knocked every column label
     * about 5px out of line with its column and made the layout suite fail on a board that
     * was laid out correctly.
     */
    const grid = page.locator('.board-grid')
    await expect(grid).not.toHaveAttribute('data-rejected', /.+/)

    const transform = await grid.evaluate(el => getComputedStyle(el).transform)
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform)
})

test('a refused move visibly moves the board', async ({ page }) => {
    /*
     * D10-f's other half: a rejected placement did nothing at all -- no sound, no movement,
     * no message -- so a refused move and a missed tap looked identical.
     *
     * The earlier version of this test only read `data-rejected`, which comes straight from
     * the session's counter: deleting the animation call entirely would have left it green.
     * It now watches the grid's real transform across frames, so what is asserted is that
     * the board *moved*.
     */
    const { i, j } = await occupiedNeighbourDrag(page)
    const grid = page.locator('.board-grid')

    await expect(grid).not.toHaveAttribute('data-rejected', /.+/)

    // Sample the painted transform every frame, starting before the refusal.
    await page.evaluate(() => {
        const el = document.querySelector('.board-grid')!
        const w = window as unknown as { frames: string[], watching: boolean }
        w.frames = []
        w.watching = true
        const started = performance.now()
        const sample = () => {
            w.frames.push(getComputedStyle(el).transform)
            if (performance.now() - started < 1500) requestAnimationFrame(sample)
            else w.watching = false
        }
        requestAnimationFrame(sample)
    })

    // Drag onto the half just placed: legal target, occupied cell, refused.
    await page.locator(`[data-cell="${i},${j}"]`).hover()
    await page.mouse.down()
    await page.locator(`[data-cell="${i + 1},${j}"]`).hover()
    await page.mouse.up()

    await expect(grid).toHaveAttribute('data-rejected', /\d+/)

    await expect.poll(
        () => page.evaluate(() => (window as unknown as { watching: boolean }).watching),
        { timeout: 5_000 }
    ).toBe(false)

    const frames: string[] = await page.evaluate(() => (window as unknown as { frames: string[] }).frames)
    const still = (t: string) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'

    expect(frames.some(t => !still(t)), `the grid never moved; sampled ${frames.length} frames`).toBe(true)
    // And it comes back: a shake that parks the board off-centre is a layout bug, which is
    // exactly what the at-rest regression was.
    expect(still(frames[frames.length - 1]), `ended at ${frames[frames.length - 1]}`).toBe(true)
})

test('a refusal does not steal focus from the board', async ({ page }) => {
    /*
     * The other half of the at-rest regression. The shake was first done by bumping a `key`,
     * which remounts the grid -- and the grid is the focusable element, so the remount blew
     * focus away, `onBlur` cancelled the gesture, and a keyboard player's pending anchor
     * disappeared before the arrow that would have used it.
     *
     * The earlier version of this test never performed a refusal at all: it made a
     * successful placement, focused the grid itself, and then checked that the grid was
     * focused. The refusal below is deterministic and needs no knowledge of the served
     * board -- anchoring on the top-left cell and pressing Up aims off the board, which the
     * rules refuse while deliberately keeping the anchor.
     */
    const j = await topRowAnchor(page)
    const grid = page.locator('.board-grid')
    await grid.focus()

    // Entering the board is itself the first keypress; it lands on [0,0].
    await page.keyboard.press('ArrowDown')
    for (let step = 0; step < j; step++) await page.keyboard.press('ArrowRight')
    await expect(page.locator(`[data-focus="0,${j}"]`)).toHaveCount(1)

    await page.keyboard.press(' ')
    await expect(page.locator(`[data-anchor="0,${j}"]`)).toHaveCount(1)

    const candidatesBefore = await page.locator('[data-candidate]').count()
    expect(candidatesBefore, 'the anchor offered somewhere to go').toBeGreaterThan(0)

    await page.keyboard.press('ArrowUp')   // off the top edge: refused

    await expect(grid).toHaveAttribute('data-rejected', /\d+/)
    // Focus, the anchor and the offer all survive the shake.
    await expect(grid).toBeFocused()
    await expect(page.locator(`[data-anchor="0,${j}"]`)).toHaveCount(1)
    expect(await page.locator('[data-candidate]').count()).toBe(candidatesBefore)
})

test('the board squares no longer take clicks of their own', async ({ page }) => {
    // The click handler that played `snap.mp3` on every square, accepted or not, is gone.
    const handlers = await page.locator('[data-cell]').first().evaluate(
        el => typeof (el as HTMLElement).onclick
    )
    expect(handlers).toBe('object')   // null, i.e. no inline handler
})
