import { test, expect, type Locator, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { drag, playSolution } from './play'
import { LATE_IN_A_MONTH, pinDay } from './calendar'

/**
 * Honest feedback in a real browser (spec P1-5, D10-f and D10-g).
 *
 * The rules are pinned in tests/lineFeedback.test.ts and tests/rejection.test.ts. What needs
 * a browser is that the state reaches the screen: that a label carries a shape and not only
 * a colour, that the computed contrast is what the palette promises, and that a refused move
 * visibly moves the board.
 *
 * Since UI row 4 the shapes are a filled pill (satisfied), a ringed one (over) and a bar
 * (reached, the target met with cells still open), where satisfied was struck through.
 */

/** What a label draws, as the browser computes it: its pill's fill and ring, and a bar. */
const channels = (label: Locator) => label.evaluate(el => {
    const pill = el.querySelector<HTMLElement>('[data-label-pill]')!
    const cs = getComputedStyle(pill)
    const bar = el.querySelector<HTMLElement>('[data-label-bar]')
    const barBox = bar?.getBoundingClientRect()
    return {
        filled: cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
        ringed: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
        bar: barBox !== undefined && barBox.width > 0 && barBox.height > 0,
        struck: getComputedStyle(el).textDecorationLine !== 'none' || cs.textDecorationLine !== 'none',
    }
})

const SHAPES = {
    neutral: { filled: false, ringed: false, bar: false, struck: false },
    reached: { filled: false, ringed: false, bar: true, struck: false },
    satisfied: { filled: true, ringed: false, bar: false, struck: false },
    over: { filled: false, ringed: true, bar: false, struck: false },
} as const

/** Every label's state, columns then rows, in order. */
const allStates = (page: Page) => page.locator('[data-col-label], [data-row-label]').evaluateAll(
    els => els.map(el => `${el.hasAttribute('data-col-label') ? 'col' : 'row'} ${el.getAttribute('data-col-label') ?? el.getAttribute('data-row-label')}: ${el.getAttribute('data-line-state')}`))

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
    // A fresh board may legitimately have a reached line -- a target of 0, with a cell open
    // (UI row 4) -- or a satisfied one, a 0 line of rocks only, so this asserts the attribute
    // exists and is one of the four, not that it is neutral everywhere.
    for (const state of states) expect(['neutral', 'reached', 'satisfied', 'over']).toContain(state)
})

test.describe('a target of 0, and a line that reaches its target (UI row 4)', () => {
    test.beforeEach(async ({ page }) => {
        // The pinned day's board, reloaded: its second row's target is 0, with cells open.
        await pinDay(page, LATE_IN_A_MONTH)
        await openBoard(page)
    })

    test('on the pinned day, the 0 row is reached at load, and shows and says it', async ({ page }) => {
        const zero = page.locator('[data-row-label="1"]')
        await expect(zero).toHaveText('0')
        await expect(zero).toHaveAttribute('data-line-state', 'reached')
        expect(await channels(zero)).toEqual(SHAPES.reached)
        await expect(zero).toHaveAttribute('aria-label', 'Row 2, target 0, target reached')
    })

    test('a placement that meets a target with cells open shows reached, and Undo takes it back', async ({ page }) => {
        /*
         * Found on the board rather than written down: a column whose target is 1 with three
         * free cells takes an upright -- 1 over 0 -- and is left reached with a cell open; or
         * else a row whose target is 2 with three free cells takes a flat domino, 0 then 2.
         */
        const read = await page.evaluate(() => ({
            columns: Array.from(document.querySelectorAll('[data-col-label]'), el => Number(el.textContent)),
            rows: Array.from(document.querySelectorAll('[data-row-label]'), el => Number(el.textContent)),
            rocks: Array.from(document.querySelectorAll('[data-piece="rock"]'), el => el.getAttribute('data-at')!),
        }))
        const n = read.columns.length
        const free = (i: number, j: number) => !read.rocks.includes(`${i},${j}`)
        let move: { line: string, from: [number, number], to: [number, number] } | null = null
        for (let j = 0; j < n && move === null; j++) {
            const open = Array.from({ length: n }, (_, i) => i).filter(i => free(i, j))
            const top = open.find(i => free(i + 1, j) && i + 1 < n)
            if (read.columns[j] === 1 && open.length >= 3 && top !== undefined) move = { line: `[data-col-label="${j}"]`, from: [top, j], to: [top + 1, j] }
        }
        for (let i = 0; i < n && move === null; i++) {
            const open = Array.from({ length: n }, (_, j) => j).filter(j => free(i, j))
            const left = open.find(j => free(i, j + 1) && j + 1 < n)
            if (read.rows[i] === 2 && open.length >= 3 && left !== undefined) move = { line: `[data-row-label="${i}"]`, from: [i, left], to: [i, left + 1] }
        }
        expect(move, 'the pinned board has no line to reach in one move').not.toBeNull()

        const line = page.locator(move!.line)
        const before = await allStates(page)
        await expect(line).toHaveAttribute('data-line-state', 'neutral')

        await drag(page, move!.from, move!.to)
        await expect(line).toHaveAttribute('data-line-state', 'reached')
        expect(await channels(line)).toEqual(SHAPES.reached)

        await page.locator('[data-undo]').click()
        await expect(line).toHaveAttribute('data-line-state', 'neutral')
        expect(await channels(line)).toEqual(SHAPES.neutral)
        expect(await allStates(page), 'Undo restores every label').toEqual(before)
    })
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

test('a satisfied line is a filled pill, so colour is not the only channel', async ({ page }) => {
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
        expect(await channels(label)).toEqual(SHAPES.satisfied)
        // The shape is not the only extra channel: a screen reader reaches neither colour
        // nor a pill, so the state is in the accessible name too.
        await expect(label).toHaveAttribute('aria-label', /complete/i)
    }

    // And a neutral label carries no shape, so the channels actually distinguish.
    const neutral = page.locator('[data-line-state="neutral"]')
    for (let k = 0; k < await neutral.count(); k++) {
        expect(await channels(neutral.nth(k))).toEqual(SHAPES.neutral)
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
                // Ringed and not filled: a different shape from satisfied, not merely a
                // different colour.
                expect(await channels(over.first())).toEqual(SHAPES.over)
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
    /*
     * Focus, the anchor and the offer all survive the shake.
     *
     * Focus now sits on the *cell* rather than on the grid container -- that is the point
     * of P1-8's roving tabindex, and it is what makes a screen reader announce each square
     * as the player arrows onto it. The property this test is about is unchanged: focus is
     * still inside the board and still on the square the player is working from.
     */
    await expect(page.locator(`[data-cell="0,${j}"]`)).toBeFocused()
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
