import { test, expect, type Page, type CDPSession } from '@playwright/test'
import { openBoard } from './openBoard'

/**
 * The touch half of the placement verb (spec P1-1), in a genuinely touch-enabled context.
 *
 * This runs under the `touch` project, which uses a mobile device descriptor -- so
 * `hasTouch` and `isMobile` are on and the browser produces real touch pointers with
 * implicit capture and compatibility mouse events. A phone-*sized* desktop context, which
 * is what the other projects use, produces none of that and would pass these tests without
 * exercising anything they are about.
 *
 * Touch input is dispatched through CDP (`Input.dispatchTouchEvent`) rather than
 * `page.touchscreen`, which can only tap: a drag is the verb, so it has to be a real
 * sequence of touchStart / touchMove / touchEnd.
 *
 * **Chromium is not iOS Safari.** Everything below is evidence about Chromium's emulation
 * of a touch device. The parts of P1-1 that are genuinely iOS-specific -- whether
 * `touch-action: pinch-zoom` behaves as specified in WebKit, and whether
 * `-webkit-touch-callout: none` suppresses the long-press magnifier mid-drag -- **cannot be
 * settled here and still need verification on a real device**. The spec records the same
 * caveat.
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

/** A cell with `above` free cells stacked on it and a free cell below. */
const freeRun = async (page: Page, above = 1) => {
    const n = Math.sqrt(await boardSize(page))
    const taken = await occupied(page)
    for (let j = 0; j < n; j++) {
        for (let i = above; i + 1 < n; i++) {
            const run = Array.from({ length: above + 2 }, (_, k) => i - above + k)
            if (run.every(r => !taken.has(`${r},${j}`))) return { i, j }
        }
    }
    throw new Error('the fixture board has no free run')
}

const centreOf = async (page: Page, i: number, j: number) => {
    const cell = page.locator(`[data-cell="${i},${j}"]`)
    await cell.scrollIntoViewIfNeeded()
    const box = await cell.boundingBox()
    if (!box) throw new Error(`cell ${i},${j} has no box`)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

type Point = { x: number, y: number }

const send = (cdp: CDPSession, type: string, touchPoints: Point[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints } as never)

const touchTap = async (cdp: CDPSession, at: Point) => {
    await send(cdp, 'touchStart', [at])
    await send(cdp, 'touchEnd', [])
}

const touchDrag = async (cdp: CDPSession, from: Point, to: Point) => {
    await send(cdp, 'touchStart', [from])
    await send(cdp, 'touchMove', [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }])
    await send(cdp, 'touchMove', [to])
    await send(cdp, 'touchEnd', [])
}

let cdp: CDPSession

test.beforeEach(async ({ page }) => {
    cdp = await page.context().newCDPSession(page)
    await openBoard(page)
})

test('the context really is touch-enabled', async ({ page }) => {
    // Guards the whole file: if this ever runs in a plain desktop context, every test
    // below would pass while testing nothing about touch.
    const capabilities = await page.evaluate(() => ({
        maxTouchPoints: navigator.maxTouchPoints,
        hasTouchEvent: 'ontouchstart' in window,
        coarse: matchMedia('(pointer: coarse)').matches,
    }))

    expect(capabilities.maxTouchPoints).toBeGreaterThan(0)
    expect(capabilities.hasTouchEvent).toBe(true)
    expect(capabilities.coarse).toBe(true)
})

test('a touch drag places one domino, and the compat click does not undo it', async ({ page }) => {
    /*
     * The compatibility-click case, and it is sharper than it looks.
     *
     * Mobile synthesises a `click` after `pointerup`, targeted at the release cell. By
     * then that cell is *occupied* by the domino just placed -- so a click handler running
     * the same verb would tap an occupied cell and remove it again. A domino that is still
     * there after the click has had time to arrive is the evidence that no second handler
     * ran.
     */
    const { i, j } = await freeRun(page, 1)
    const before = (await occupied(page)).size

    await touchDrag(cdp, await centreOf(page, i, j), await centreOf(page, i + 1, j))

    const placed = page.locator(`[data-piece="one"][data-at="${i},${j}"]`)
    await expect(placed).toBeVisible()

    // Long enough for a compatibility click to have been synthesised and dispatched.
    await page.waitForTimeout(500)
    await expect(placed).toBeVisible()
    expect((await occupied(page)).size).toBe(before + 2)
})

test('a touch drag works across cells, despite the implicit pointer capture', async ({ page }) => {
    // Touch pointers get implicit pointer capture: every event after `pointerdown`
    // retargets to the cell the finger started on. `elementFromPoint` is what resolves
    // the cell actually under the finger, and it is the only thing that does -- see the
    // mechanism test below.
    const { i, j } = await freeRun(page, 1)

    await touchDrag(cdp, await centreOf(page, i, j), await centreOf(page, i + 1, j))

    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
})

test('the implicit capture is held by the origin cell for the whole gesture', async ({ page }) => {
    /*
     * The measured platform fact the hit-testing is built on, asserted rather than
     * asserted-about-in-a-comment.
     *
     * An earlier version of this code called `releasePointerCapture` on the grid in
     * `pointerdown`. That is the wrong element -- capture belongs to `e.target`, the cell
     * -- so it silently did nothing (it does not even throw; measured). The drag worked
     * anyway, entirely because of `elementFromPoint`, which made the release look load-
     * bearing when it was dead code.
     *
     * So: capture stays with the origin cell, `pointermove.target` stays the origin cell,
     * and `elementFromPoint` disagrees with both. If a browser ever stops behaving this
     * way this test fails, which is the signal to revisit `cellFrom`'s comment -- not a
     * regression in the board.
     *
     * Leaving the capture alone is also deliberate: it keeps every event funnelled to the
     * grid even when the finger leaves the board, so an off-board release still resolves
     * the gesture instead of stranding it.
     */
    const { i, j } = await freeRun(page, 1)
    const from = await centreOf(page, i, j)
    const to = await centreOf(page, i + 1, j)

    await page.evaluate(() => {
        const w = window as unknown as { probe: Record<string, string | boolean | null>[] }
        w.probe = []
        const grid = document.querySelector('.board-grid') as HTMLElement
        const name = (el: Element | null | undefined) => el?.closest('[data-cell]')?.getAttribute('data-cell') ?? null
        for (const type of ['pointermove', 'pointerup', 'lostpointercapture']) {
            grid.addEventListener(type, (e) => {
                const pe = e as PointerEvent
                const owner = Array.from(document.querySelectorAll('[data-cell]'))
                    .find(c => (c as HTMLElement).hasPointerCapture(pe.pointerId))
                w.probe.push({
                    type,
                    target: name(e.target as Element),
                    capturedBy: name(owner),
                    underPoint: name(document.elementFromPoint(pe.clientX, pe.clientY)),
                })
            }, true)
        }
    })

    await touchDrag(cdp, from, to)

    const probe = await page.evaluate(() => (window as unknown as {
        probe: { type: string, target: string | null, capturedBy: string | null, underPoint: string | null }[]
    }).probe)

    const moves = probe.filter(p => p.type === 'pointermove')
    expect(moves.length).toBeGreaterThan(0)
    const away = moves.filter(p => p.underPoint === `${i + 1},${j}`)
    expect(away.length, 'at least one move over the neighbour').toBeGreaterThan(0)

    for (const move of away) {
        expect(move.target, 'the event retargets to the origin cell').toBe(`${i},${j}`)
        expect(move.capturedBy, 'the origin cell holds the capture').toBe(`${i},${j}`)
    }

    // And capture is given up only once the gesture is over, which is why
    // `lostpointercapture` is not wired to cancellation.
    const lost = probe.findIndex(p => p.type === 'lostpointercapture')
    const up = probe.findIndex(p => p.type === 'pointerup')
    expect(lost, 'lostpointercapture fires').toBeGreaterThanOrEqual(0)
    expect(lost, 'lostpointercapture comes after pointerup, not before').toBeGreaterThan(up)
})

test('a touch tap offers candidates, and a second tap commits', async ({ page }) => {
    const { i, j } = await freeRun(page, 1)

    await touchTap(cdp, await centreOf(page, i, j))
    await expect(page.locator(`[data-anchor="${i},${j}"]`)).toBeVisible()
    await expect(page.locator('[data-candidate]').first()).toBeVisible()

    await touchTap(cdp, await centreOf(page, i + 1, j))
    await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()
    await expect(page.locator('[data-candidate]')).toHaveCount(0)
})

test('a tap places exactly one domino, never two', async ({ page }) => {
    // The other shape of the compat-click hazard: a tap that commits straight away.
    const { i, j } = await freeRun(page, 1)

    await touchTap(cdp, await centreOf(page, i, j))
    await touchTap(cdp, await centreOf(page, i + 1, j))
    await page.waitForTimeout(500)

    await expect(page.locator('[data-piece="one"]')).toHaveCount(1)
})

/*
 * There is deliberately no test here for capture being lost *mid-drag*.
 *
 * It cannot be produced in Chromium. Measured: releasing the implicit touch capture from
 * the cell that owns it genuinely takes effect -- `hasPointerCapture` goes false and the
 * following `pointermove` retargets to the cell under the finger -- but no
 * `lostpointercapture` is ever dispatched for it, at the cell, the grid or the document.
 * The event does fire on the normal path, after `pointerup`, which the capture-retention
 * test above pins.
 *
 * The handler's behaviour is therefore covered in tests/hover.test.tsx, where the event can
 * be dispatched directly. What *this* file contributes is the evidence that wiring it costs
 * nothing on the normal paths: every tap, drag and cancel test here runs with
 * `onLostPointerCapture` live.
 */

test('a cancelled touch places nothing', async ({ page }) => {
    const { i, j } = await freeRun(page, 1)
    const before = (await occupied(page)).size

    const from = await centreOf(page, i, j)
    const to = await centreOf(page, i + 1, j)
    await send(cdp, 'touchStart', [from])
    await send(cdp, 'touchMove', [to])
    await send(cdp, 'touchCancel', [])
    await page.waitForTimeout(200)

    expect((await occupied(page)).size).toBe(before)
    await expect(page.locator('[data-anchor]')).toHaveCount(0)
})

test('the board keeps pinch-zoom, and says so statically in CSS', async ({ page }) => {
    /*
     * `touch-action` is latched when a gesture begins, so setting it from JS on
     * `pointerdown` cannot affect the gesture in flight -- which is why the policy has to
     * live in a stylesheet. This checks both halves: the value, and that it is not an
     * inline style some handler wrote.
     *
     * `pinch-zoom` rather than `none`: two-finger zoom keeps working over the board, which
     * is exactly where a low-vision player needs it.
     */
    const grid = page.locator('.board-grid')

    await expect(grid).toHaveCSS('touch-action', 'pinch-zoom')
    expect(await grid.evaluate(el => (el as HTMLElement).style.touchAction)).toBe('')
})

test('the long-press callout is suppressed in the shipped CSS', async ({ page }) => {
    /*
     * Asserted at the stylesheet, not at the computed style, and that is a real limit
     * rather than a convenience: Blink does not implement `-webkit-touch-callout`, so
     * Chromium computes it to the empty string however it is declared. Measured.
     *
     * What can be checked here is that the declaration ships and reaches `.board-grid`.
     * Whether it actually suppresses the long-press magnifier mid-drag is a WebKit
     * question and **needs a real iOS device**; `select-none` alone does not, because it
     * only sets `user-select`.
     */
    const declared = await page.evaluate(async () => {
        // Fetched as text, because the CSSOM cannot answer either: Blink drops properties
        // it does not implement, so `cssText` omits the declaration even when the rule
        // shipped with it. Measured -- the built stylesheet contains
        // `board-grid{touch-action:pinch-zoom;-webkit-touch-callout:none}` while
        // `cssRules` reports only the `touch-action`.
        const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
        for (const link of links) {
            const css = await (await fetch(link.href)).text()
            const match = css.match(/\.board-grid\s*\{[^}]*\}/)
            if (match) return match[0]
        }
        return null
    })

    expect(declared, 'a .board-grid rule in the shipped CSS').not.toBeNull()
    expect(declared).toContain('-webkit-touch-callout:none')
})

test('the page itself stays zoomable', async ({ page }) => {
    // P2-2: never "fix" layout by banning zoom.
    const content = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(content ?? '').not.toMatch(/user-scalable\s*=\s*(no|0)/i)
    expect(content ?? '').not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/i)
})

test('the real controls opt into fast taps instead of the board policy', async ({ page }) => {
    /*
     * Asserted on the controls by what they *do*, not by the marker class.
     *
     * The previous version matched `.control-surface` and took the first hit, which was
     * the piece legend -- no longer interactive at all since P1-1 made the tray a legend.
     * It passed while the difficulty buttons and the level arrows, the only things on the
     * page a player actually taps, had no policy at all.
     */
    const controls = [
        page.getByRole('button', { name: /easy/i }),
        page.getByRole('button', { name: /medium/i }),
        page.getByRole('button', { name: /hard/i }),
        page.locator('[data-level="next"]'),
        page.locator('[data-level="previous"]'),
        page.locator('[data-undo]'),
        page.locator('[data-reset]'),
    ]

    for (const control of controls) {
        await expect(control).toHaveCount(1)
        await expect(control).toHaveCSS('touch-action', 'manipulation')
    }
})
