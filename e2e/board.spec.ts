import { test, expect, type Page } from '@playwright/test'
import { instrument, waitForReady } from './openBoard'

/**
 * Where a click on the board lands (spec P0-4 / D4).
 *
 * This needs a real browser and is not answerable in jsdom. The bug is a *hit-testing*
 * bug: a domino's SVG is 16px taller than its cell and shifted up, and its outline rect
 * was painted with `fill="transparent"` -- a paint value, not `none` -- so under the
 * default `pointer-events: visiblePainted` the overlay swallowed clicks aimed at the
 * empty cell above it. jsdom has no hit-testing at all: `fireEvent` dispatches straight
 * at whichever node the test names, so the wrong node is never *chosen* and the defect
 * cannot appear.
 */

const overlay = (page: Page) => page.locator('div.fixed.inset-0')

/** Dismiss the tutorial so the real board is reachable. */
const openBoard = async (page: Page) => {
    await instrument(page)
    await page.goto('/')
    // Skip lives inside the tutorial, which renders only once the board has loaded, so
    // waiting on it waits on the same startup as every other spec -- and unlike
    // `[data-board-shell]` it is unambiguous while two boards are mounted.
    await waitForReady(page, page.getByRole('button', { name: /skip/i }), 'The tutorial')
    const skip = page.getByRole('button', { name: /skip/i })
    await skip.scrollIntoViewIfNeeded()
    await skip.click()
    await expect(overlay(page)).toBeHidden()
    await expect(page.locator('[data-cell="0,0"]')).toBeVisible()
}

/**
 * Every cell that currently holds something, as "i,j".
 *
 * One element is rendered per *domino*, not per cell -- `data-at` marks the half carrying
 * the pips -- so both halves are expanded here. An upright piece at (i,j) also covers
 * (i+1,j); a flat piece at (i,j) also covers (i,j-1). Counting elements instead would
 * silently treat the second half of every domino as free.
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

const boardSize = (page: Page) => page.locator('[data-cell]').count()

/**
 * Find a cell (i,j) that is free, has a free cell below it -- room for an upright domino
 * -- and `above` free cells stacked on top of it. Rock layout is content, so the tests
 * locate their spot rather than hardcoding one.
 */
const freeColumnRun = async (page: Page, above = 1) => {
    const n = Math.sqrt(await boardSize(page))
    const taken = await occupied(page)
    const free = (i: number, j: number) => !taken.has(`${i},${j}`)

    for (let j = 0; j < n; j++) {
        for (let i = above; i + 1 < n; i++) {
            const run = Array.from({ length: above + 2 }, (_, k) => i - above + k)
            if (run.every(r => free(r, j))) return { i, j }
        }
    }
    throw new Error(`no column has ${above + 2} adjacent free cells; the fixture board changed`)
}

/**
 * Two horizontally adjacent free cells, for placing a flat piece.
 *
 * Separate from `freeColumnRun` because that one guarantees a *column* run and says nothing
 * about the cell to the right. A test that used it for a horizontal drag was relying on the
 * served board happening to have `j+1` free as well -- which it did until the date rolled
 * over and the day's puzzle changed, at which point the drag placed nothing and the test
 * failed on a board that was behaving perfectly.
 */
const freeRowPair = async (page: Page) => {
    const n = Math.sqrt(await boardSize(page))
    const taken = await occupied(page)

    for (let i = 0; i < n; i++) {
        for (let j = 0; j + 1 < n; j++) {
            if (!taken.has(`${i},${j}`) && !taken.has(`${i},${j + 1}`)) return { i, j }
        }
    }
    throw new Error('no row has two adjacent free cells; the fixture board changed')
}

/**
 * The cell's box in viewport coordinates, scrolled into view first.
 *
 * `page.mouse` takes raw viewport coordinates and does not scroll, so a box measured
 * below the fold points at nothing. Measured after the scroll, never before.
 */
const cellBox = async (page: Page, i: number, j: number) => {
    const cell = page.locator(`[data-cell="${i},${j}"]`)
    await cell.scrollIntoViewIfNeeded()
    const box = await cell.boundingBox()
    if (!box) throw new Error(`cell ${i},${j} has no box`)
    return box
}

/** The centre of a cell, in viewport coordinates. */
const centreOf = async (page: Page, i: number, j: number) => {
    const box = await cellBox(page, i, j)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Drag from one cell to another with the mouse: press, move, release.
 *
 * The verb is a drag now (P1-1) -- the direction decides the orientation -- so a bare
 * click no longer places anything except where exactly one direction is legal.
 */
const dragCells = async (page: Page, from: [number, number], to: [number, number]) => {
    const a = await centreOf(page, from[0], from[1])
    const b = await centreOf(page, to[0], to[1])
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y)
    await page.mouse.up()
}

/** Tap a cell: press and release without moving. */
const tapCell = async (page: Page, i: number, j: number) => {
    const c = await centreOf(page, i, j)
    await page.mouse.move(c.x, c.y)
    await page.mouse.down()
    await page.mouse.up()
}

/** Place an upright domino occupying (i,j) and (i+1,j), by dragging downward. */
const placeUpright = async (page: Page, i: number, j: number) => {
    await dragCells(page, [i, j], [i + 1, j])
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
}

test.beforeEach(async ({ page }) => { await openBoard(page) })

test('a domino can be placed and removed by clicking it', async ({ page }) => {
    const { i, j } = await freeColumnRun(page)
    await placeUpright(page, i, j)

    // Removal used to be the overlay's own click handler. With the overlay inert it has
    // to be routed from the cell underneath, so this guards the fix as much as the bug.
    await tapCell(page, i, j)
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toHaveCount(0)
})

test('clicking just above a domino does not delete it (D4)', async ({ page }) => {
    const { i, j } = await freeColumnRun(page)
    await placeUpright(page, i, j)

    const above = await cellBox(page, i - 1, j)
    // 4px inside the bottom edge of the cell ABOVE the domino. The domino's outline rect
    // reaches 12px into this cell, so before the fix this point hit the overlay and the
    // handler deleted the domino the player was trying to build on top of.
    const x = above.x + above.width / 2
    const y = above.y + above.height - 4
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.up()

    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
})

test('a drag started just above a domino places a piece there', async ({ page }) => {
    const { i, j } = await freeColumnRun(page, 2)
    await placeUpright(page, i, j)
    const before = (await occupied(page)).size

    // Press in the bottom strip of the cell above -- the strip the overlay used to steal
    // -- and drag away from the domino, which is a placement the board must accept.
    const above = await cellBox(page, i - 1, j)
    await page.mouse.move(above.x + above.width / 2, above.y + above.height - 4)
    await page.mouse.down()
    const target = await centreOf(page, i - 2, j)
    await page.mouse.move(target.x, target.y)
    await page.mouse.up()

    expect((await occupied(page)).size).toBe(before + 2)
    await expect(page.locator(`[data-piece="one"][data-at="${i - 2},${j}"]`)).toBeVisible()
})

test('the piece overlay does not take pointer events', async ({ page }) => {
    // Defence in depth, and stated as such: with the overlay's own click handler gone,
    // restoring `pointer-events: auto` here does NOT change the resulting board state --
    // measured. The behavioural tests above stay green either way, so this asserts the
    // property directly. Other behaviour does differ: this layer is a sibling of the
    // cells, so an interactive overlay swallows the click before `BoardSquare`'s own
    // handler runs. And it matters for what comes next: P1-2 moves hit-testing onto the
    // cells, and a layer that takes pointer events would sit on top of every one of them.
    const layer = page.locator('div.absolute.z-20').first()
    await expect(layer).toHaveCSS('pointer-events', 'none')
})

test('every decorative outline rect is fill="none", on all three shapes', async ({ page }) => {
    // `fill="transparent"` is rgba(0,0,0,0): a paint value that still hit-tests under
    // `visiblePainted`. `none` is the only value that paints nothing at all, so the
    // assertion is on that exact string -- "not transparent" would pass for `red`, and
    // for the attribute having been dropped entirely.
    const { i, j } = await freeColumnRun(page, 1)
    await placeUpright(page, i, j)

    const flat = await freeRowPair(page)
    await dragCells(page, [flat.i, flat.j], [flat.i, flat.j + 1])
    await expect(page.locator('[data-piece="two"]').first()).toBeVisible()

    // All three shapes must be on the board, or the loop below proves nothing about the
    // ones that are missing. Rocks come from the fixture board.
    for (const kind of ['one', 'two', 'rock'] as const) {
        const pieces = page.locator(`[data-piece="${kind}"]`)
        expect(await pieces.count(), `no ${kind} on the board to check`).toBeGreaterThan(0)

        const rects = page.locator(`[data-piece="${kind}"] rect[data-outline]`)
        const fills = await rects.evaluateAll(els => els.map(el => el.getAttribute('fill')))
        expect(fills.length, `${kind} has no marked outline rect`).toBeGreaterThan(0)
        expect(fills, `${kind} outline fills`).toEqual(fills.map(() => 'none'))
    }
})

test('the piece tray is a legend, not a mode selector', async ({ page }) => {
    // P1-1 deletes the orientation mode, so what is asserted now is that the tray is
    // inert and still shows both shapes with their scores.
    await expect(page.locator('[data-legend-piece="1"]')).toBeVisible()
    await expect(page.locator('[data-legend-piece="2"]')).toBeVisible()
    await expect(page.locator('[data-select-piece]')).toHaveCount(0)

    const before = (await occupied(page)).size
    await page.locator('[data-legend-piece="2"]').click()
    expect((await occupied(page)).size).toBe(before)
})

/**
 * P1-2: the cell index comes from the browser's hit-test, not from arithmetic.
 *
 * The old code divided a pointer offset by the store's `squareSize`. That was
 * self-consistent -- spec §0 overturned the claim that zoom broke it -- but it depended on
 * the store and the layout agreeing about the cell size. These tests break that agreement
 * deliberately and check that clicks still land where they are aimed.
 */
test.describe('hit-testing does not depend on the store agreeing with the layout', () => {
    test('a drag lands in the cells it is over, under a transform', async ({ page }) => {
        const { i, j } = await freeColumnRun(page, 1)

        // A scale the store knows nothing about: every cell is now 60% of the size the
        // store thinks it is, so any offset-divided-by-squareSize would resolve to a cell
        // well away from the pointer. The browser's own hit-test is unaffected.
        await page.evaluate(() => {
            const shell = document.querySelector('[data-board-shell]') as HTMLElement
            shell.style.transformOrigin = 'top left'
            shell.style.transform = 'scale(0.6)'
        })

        await dragCells(page, [i, j], [i + 1, j])

        await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
    })

    test('a drag lands in the cells it is over, when cells are not uniform', async ({ page }) => {
        // `above: 2` guarantees the cell is at least two rows below the row we distort.
        const { i, j } = await freeColumnRun(page, 2)

        // Cells the store believes are all one size, laid out at two different sizes. The
        // old arithmetic assumed uniformity -- one `squareSize` for the whole grid -- so
        // every row below the distorted one resolved short. Nothing about the browser's
        // hit-test cares.
        //
        // (A *translation* would not discriminate here, and the test that tried it has
        // been removed: the old code measured the pointer against the grid's own rect,
        // which moves with the grid, so both approaches survive it.)
        await page.evaluate(() => {
            const first = document.querySelector('[data-cell="0,0"]') as HTMLElement
            // Comfortably more than two cells taller: a distortion smaller than one cell
            // still rounds to the same row under the old arithmetic and proves nothing.
            const tall = first.getBoundingClientRect().height * 3
            for (const el of document.querySelectorAll('[data-cell^="0,"]')) {
                (el as HTMLElement).style.height = `${tall}px`
            }
            /*
             * And let the shell grow with it. The shell's height is fixed from the store's
             * uniform arithmetic, so the taller grid overflowed it and the chrome below --
             * the scoring key -- sat over the bottom rows. Measured on 2026-09-24, whose
             * board put the free run at rows 4-5: the drag's end point hit the legend, the
             * release resolved to no cell, and nothing was placed. The test only ever passed
             * on days whose run sat high enough to stay clear of it.
             */
            (document.querySelector('[data-board-shell]') as HTMLElement).style.height = 'auto'
        })

        // The premise, checked rather than assumed: the browser puts both drag points on
        // the cells the test means. Anything laid over them fails here, saying so.
        for (const [ci, cj] of [[i, j], [i + 1, j]] as const) {
            const { x, y } = await centreOf(page, ci, cj)
            expect(await page.evaluate(({ x, y }) =>
                document.elementFromPoint(x, y)?.closest('[data-cell]')?.getAttribute('data-cell'),
            { x, y }), `something covers cell ${ci},${cj}`).toBe(`${ci},${cj}`)
        }

        await dragCells(page, [i, j], [i + 1, j])

        await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
    })

    test('every free cell resolves to itself', async ({ page }) => {
        // A sweep rather than a sample: an off-by-one in the mapping would show up at the
        // board's edges first, and only at the edges.
        const n = Math.sqrt(await boardSize(page))
        const taken = await occupied(page)

        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (taken.has(`${i},${j}`)) continue
                const cell = await cellBox(page, i, j)
                await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2)

                // The highlight is drawn over the pair the pointer resolves to, so its
                // top-left corner names the cell the board thinks is under the pointer.
                const resolved = await page.evaluate(() => {
                    const hover = document.querySelector('.z-10.pointer-events-none') as HTMLElement
                    if (!hover) return null
                    // By role, not `parentElement`: a cell's parent is its `role="row"`
                    // wrapper (spec P1-8), which is `display: contents` and therefore has
                    // no box at all -- its rect is all zeros and every offset below came
                    // out measured from the viewport instead of from the board.
                    const grid = document.querySelector('[data-cell="0,0"]')!.closest('[role="grid"]')!
                    const h = hover.getBoundingClientRect()
                    const g = grid.getBoundingClientRect()
                    const cell = document.querySelector('[data-cell="0,0"]')!.getBoundingClientRect()
                    return {
                        i: Math.round((h.top - g.top) / cell.height),
                        j: Math.round((h.left - g.left) / cell.width),
                    }
                })

                if (resolved === null) continue // no legal placement from this cell
                // The highlight covers the pair, so its origin is this cell or the
                // neighbour above/left of it.
                expect(Math.abs(resolved.i - i) + Math.abs(resolved.j - j), `cell ${i},${j}`)
                    .toBeLessThanOrEqual(1)
            }
        }
    })
})

test('the piece appears where the pointer was, not merely where the store says', async ({ page }) => {
    /*
     * Every other test here reads the cell index and the piece index from the same
     * `data-*` labels, so a labelling error is invisible to them: transposing `data-cell`
     * to `j,i` leaves the whole suite green while pieces land in the wrong place on
     * screen. Verified -- that mutation passed all nine.
     *
     * This one crosses from labels to pixels. It needs a cell off the diagonal, or a
     * transposition maps it to itself and proves nothing again.
     */
    const n = Math.sqrt(await boardSize(page))
    const taken = await occupied(page)
    let target: { i: number, j: number } | null = null
    for (let i = 0; i + 1 < n && !target; i++) {
        for (let j = 0; j < n && !target; j++) {
            if (i !== j && !taken.has(`${i},${j}`) && !taken.has(`${i + 1},${j}`)) target = { i, j }
        }
    }
    if (!target) throw new Error('no free off-diagonal cell; the fixture board changed')
    const { i, j } = target

    await dragCells(page, [i, j], [i + 1, j])

    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()

    /*
     * Both boxes read in the same frame, and polled.
     *
     * Polled because pieces animate in from an offset, and a mid-flight reading is ~32px
     * from where it lands. In the same frame because the first version measured the cell
     * before the click and the piece after: under parallel load the board had not finished
     * settling between the two, and the comparison was across layouts, which showed up as
     * a sub-pixel failure that would not reproduce in isolation.
     */
    /*
     * Measured only once the entry animation is at rest, and both boxes in the same frame.
     *
     * Pieces animate in from an offset with a slight rotation, so a mid-flight reading is
     * ~32px from where the piece lands, and the tail of it leaves the box a pixel or so
     * out -- which failed about one run in four while passing in isolation. Waiting for
     * the transform to settle removes the noise instead of widening the tolerance until
     * the noise fits. An earlier version also measured the cell before the click and the
     * piece after, comparing across two layouts.
     */
    const atRest = (t: string) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'

    const offsets = async () => page.evaluate(([row, col]) => {
        const cellEl = document.querySelector(`[data-cell="${row},${col}"]`)
        const pieceEl = document.querySelector(`[data-piece="one"][data-at="${row},${col}"]`)
        if (!cellEl || !pieceEl) return null
        const c = cellEl.getBoundingClientRect()
        const p = pieceEl.getBoundingClientRect()
        return {
            transform: getComputedStyle(pieceEl).transform,
            left: Math.abs(p.left - c.left),
            top: p.top - c.top,
            coversCell: p.bottom - c.bottom,
        }
    }, [i, j])

    await expect.poll(async () => atRest((await offsets())?.transform ?? '')).toBe(true)

    const o = (await offsets())!
    // The upright piece is drawn from this cell's top-left corner and is two cells tall.
    expect(o.left, 'piece left vs cell left').toBeLessThanOrEqual(1)
    expect(o.top, 'piece top vs cell top').toBeLessThanOrEqual(1)
    expect(o.coversCell, 'piece covers the cell').toBeGreaterThanOrEqual(0)
})

test.describe('a gesture does not depend on the pointer having moved first', () => {
    /*
     * `dispatchEvent` sends the event straight at an element without moving the pointer.
     *
     * The handler must resolve its own cell from each event rather than reading whatever
     * a previous move happened to store -- otherwise a gesture with no preceding move
     * does nothing, and a stale hover makes it act on the wrong cell. Both were real:
     * the click handler had exactly this bug before P1-1 replaced it.
     */
    test('a press and release with no preceding move still places', async ({ page }) => {
        const { i, j } = await freeColumnRun(page, 1)

        await page.locator(`[data-cell="${i},${j}"]`).dispatchEvent('pointerdown')
        await page.locator(`[data-cell="${i + 1},${j}"]`).dispatchEvent('pointerup')

        await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
    })

    test('the pressed cell wins over a stale hover', async ({ page }) => {
        const a = await freeColumnRun(page, 1)

        // Hover one cell, then press a different one without moving the pointer to it.
        const boxA = await centreOf(page, a.i, a.j)
        await page.mouse.move(boxA.x, boxA.y)

        const taken = await occupied(page)
        const n = Math.sqrt(await boardSize(page))
        let b: { i: number, j: number } | null = null
        for (let i = 0; i + 1 < n && !b; i++) {
            for (let j = 0; j < n && !b; j++) {
                const far = Math.abs(i - a.i) + Math.abs(j - a.j) > 2
                if (far && !taken.has(`${i},${j}`) && !taken.has(`${i + 1},${j}`)) b = { i, j }
            }
        }
        if (!b) throw new Error('no second free cell far from the first')

        await page.locator(`[data-cell="${b.i},${b.j}"]`).dispatchEvent('pointerdown')
        await page.locator(`[data-cell="${b.i + 1},${b.j}"]`).dispatchEvent('pointerup')

        await expect(page.locator(`[data-piece="one"][data-at="${b.i},${b.j}"]`)).toBeVisible()
        await expect(page.locator(`[data-piece="one"][data-at="${a.i},${a.j}"]`)).toHaveCount(0)
    })
})
