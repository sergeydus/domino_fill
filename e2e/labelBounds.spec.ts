import { test, expect, type Page } from '@playwright/test'
import { VISUAL_URL } from './server'
import { waitForRest } from './rest'

/**
 * The line targets' shapes stay inside their labels (UI row 4, UI-SPEC §4.2; codex).
 *
 * Each state draws inside the label's box, so no state moves a label: the pill, its ring and
 * the reached bar. `e2e/layout.spec.ts`'s widest-label check can't see that: it replaces the
 * label's whole text, taking the pill and the bar with it, and an outline takes no layout, so
 * no scroll size shows it. So this measures the shapes as drawn, at the 38px floor, with the
 * widest label the game produces, `13`, in every state on both axes.
 *
 * No board holds that -- a cell holds at most 2 pips -- so the sheet's label fixtures render
 * the production strips (`ColumnLabels`, `RowLabels`) with targets and states given, in a
 * shell with a board's custom properties. They are tied to a real board's labels here, so a
 * fixture that drifted from what the board draws fails; the transitions between states are
 * tested on real sessions (`tests/lineFeedback.test.ts`, `e2e/feedback.spec.ts`).
 */

test.use({ baseURL: VISUAL_URL })

/** The fixtures' states, in their order on each strip (`app/visual/Sheet.tsx`). */
const STATES = ['neutral', 'reached', 'satisfied', 'over']

/** Within half a pixel, as every edge here is compared. */
const SLACK = 0.5

type Box = { left: number, top: number, right: number, bottom: number }

/** Every fixture label, and every board label of the `target-reached` specimen, as drawn. */
const read = (page: Page) => page.evaluate(() => {
    const box = (r: DOMRect) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
    const label = (el: HTMLElement) => {
        const axis = el.hasAttribute('data-col-label') ? 'column' : 'row'
        const index = Number(el.getAttribute(axis === 'column' ? 'data-col-label' : 'data-row-label'))
        const pill = el.querySelector<HTMLElement>('[data-label-pill]')!
        const ps = getComputedStyle(pill)
        const bar = el.querySelector<HTMLElement>('[data-label-bar]')
        const text = Array.from(pill.childNodes).find(n => n.nodeType === Node.TEXT_NODE)!
        const range = document.createRange()
        range.selectNodeContents(text)
        // The ring: an outline is drawn outside the border box, `outline-offset` further out.
        const ring = ps.outlineStyle === 'none' ? 0 : parseFloat(ps.outlineWidth) + parseFloat(ps.outlineOffset)
        // Any box-shadow's reach: its spread and blur, outwards, and its offsets.
        const shadow = ps.boxShadow === 'none' ? 0 : Math.max(0, ...ps.boxShadow.replace(/rgba?\([^)]*\)/g, '')
            .split(',').map(part => part.trim().split(/\s+/).map(parseFloat))
            .map(([x = 0, y = 0, blur = 0, spread = 0]) => Math.max(Math.abs(x), Math.abs(y)) + blur + spread))
        const strip = el.parentElement!.getBoundingClientRect()
        // The number's ink, from the font's own metrics: its box from the range's left and
        // baseline, which is the content box's top plus the font's ascent.
        const ctx = document.createElement('canvas').getContext('2d')!
        ctx.font = `${ps.fontWeight} ${ps.fontSize} ${ps.fontFamily}`
        ctx.fontVariantCaps = 'normal'
        const m = ctx.measureText(range.toString())
        const r = range.getBoundingClientRect()
        const baseline = r.top + m.fontBoundingBoxAscent
        const ink = { left: r.left + m.actualBoundingBoxLeft * -1, right: r.left + m.actualBoundingBoxRight,
            top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent }
        return {
            axis, index,
            state: el.getAttribute('data-line-state')!,
            pillState: pill.getAttribute('data-label-pill'),
            box: box(el.getBoundingClientRect()),
            strip: box(strip),
            pill: box(pill.getBoundingClientRect()),
            ring, shadow,
            bar: bar && box(bar.getBoundingClientRect()),
            text: range.toString(),
            textBox: box(range.getBoundingClientRect()),
            ink,
            // The pill's height is not here: a line box of 1em sits in it, but the font's content
            // area, 1.36em of Nunito, is taller than any pill the label has room for, and scroll
            // sizes count it. The ink is what must be on the pill, and is checked as ink.
            overflow: [el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight, pill.scrollWidth - pill.clientWidth],
            style: {
                font: [ps.fontFamily, ps.fontSize, ps.fontWeight, ps.lineHeight, ps.fontVariantNumeric].join(' / '),
                padding: [ps.paddingLeft, ps.paddingRight].join(' '),
                pillHeight: ps.height,
                size: [el.getBoundingClientRect().width, el.getBoundingClientRect().height],
            },
        }
    }
    const all = (scope: string) => Array.from(document.querySelectorAll<HTMLElement>(
        `${scope} [data-col-label], ${scope} [data-row-label]`), label)
    return { fixtures: all('[data-label-fixture]'), board: all('[data-specimen="target-reached"]') }
})

type Label = Awaited<ReturnType<typeof read>>['fixtures'][number]

const inside = (inner: Box, outer: Box, grow = 0) =>
    inner.left - grow >= outer.left - SLACK && inner.top - grow >= outer.top - SLACK
    && inner.right + grow <= outer.right + SLACK && inner.bottom + grow <= outer.bottom + SLACK

const at38 = async (page: Page) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/visual?cell=38')
    await expect(page.locator('main[data-sheet]')).toBeVisible()
    await waitForRest(page, 'main')
    return read(page)
}

test('at the 38px floor, the fixtures show 13 in every state, on both axes', async ({ page }) => {
    const { fixtures } = await at38(page)
    for (const axis of ['column', 'row']) {
        const strip = fixtures.filter(l => l.axis === axis)
        expect(strip.map(l => l.state), axis).toEqual(STATES)
        expect(strip.map(l => l.text), axis).toEqual(STATES.map(() => '13'))
        expect(strip.map(l => l.pillState), axis).toEqual(['none', 'none', 'filled', 'ringed'])
        expect(strip.map(l => l.bar !== null), axis).toEqual([false, true, false, false])
    }
})

test('every state\'s label is the neutral one\'s box, in the same place in its slot', async ({ page }) => {
    // No state moves a label: its size, and where it sits in its slot along the strip.
    const { fixtures } = await at38(page)
    for (const axis of ['column', 'row']) {
        const strip = fixtures.filter(l => l.axis === axis)
        const cell = axis === 'column' ? strip[0].box.right - strip[0].box.left : strip[0].box.bottom - strip[0].box.top
        const slot = (l: Label) => {
            const along = axis === 'column' ? l.box.left - l.strip.left : l.box.top - l.strip.top
            const across = axis === 'column' ? l.box.top - l.strip.top : l.box.left - l.strip.left
            return [along - l.index * cell, across, l.box.right - l.box.left, l.box.bottom - l.box.top]
        }
        const neutral = slot(strip[0])
        for (const l of strip) {
            slot(l).forEach((v, k) => expect(Math.abs(v - neutral[k]), `${axis} ${l.state}: [offset, offset, width, height][${k}]`).toBeLessThanOrEqual(SLACK))
        }
    }
})

test('every state reads its number inside the label, its ink on the pill, with nothing overflowing', async ({ page }) => {
    const { fixtures } = await at38(page)
    for (const l of fixtures) {
        expect(l.text, `${l.axis} ${l.state}`).toBe('13')
        expect(inside(l.textBox, l.box), `${l.axis} ${l.state}: the number leaves the label`).toBe(true)
        // On the pill, where it is read: a filled pill's `onSuccess` is white off it.
        expect(inside(l.ink, l.pill), `${l.axis} ${l.state}: the number's ink leaves the pill`).toBe(true)
        expect(l.overflow, `${l.axis} ${l.state}: [label x, label y, pill x] overflow`).toEqual([0, 0, 0])
    }
})

test('the pill, its ring and the bar are drawn inside the label\'s box', async ({ page }) => {
    const { fixtures } = await at38(page)
    for (const l of fixtures) {
        const name = `${l.axis} ${l.state}`
        expect(inside(l.pill, l.box), `${name}: the pill leaves the label`).toBe(true)
        expect(inside(l.pill, l.box, l.ring), `${name}: the ring, ${l.ring}px out, leaves the label`).toBe(true)
        expect(inside(l.pill, l.box, l.shadow), `${name}: a shadow leaves the label`).toBe(true)
        if (l.bar !== null) expect(inside(l.bar, l.box), `${name}: the bar leaves the label`).toBe(true)
    }
    // The ring is measured where there is one: the positive case, so this isn't vacuous.
    expect(fixtures.filter(l => l.state === 'over').map(l => l.ring)).toEqual([2, 2])
})

test('the fixtures are a board\'s labels: the same font, padding and box, axis by axis', async ({ page }) => {
    /*
     * The tie between the fixtures and what a board draws: a real board's labels at the same
     * cell (the `target-reached` specimen's), read the same way. A fixture whose strip were
     * styled apart from the board's -- the font set on the session's wrapper only, say --
     * would measure something the board never draws.
     */
    const { fixtures, board } = await at38(page)
    for (const axis of ['column', 'row']) {
        const ours = fixtures.filter(l => l.axis === axis)
        const theirs = board.filter(l => l.axis === axis)
        expect(theirs.length, `the board has ${axis} labels`).toBeGreaterThan(0)
        for (const l of ours) {
            expect(l.style.font, `${axis} ${l.state}: font`).toBe(theirs[0].style.font)
            expect(l.style.pillHeight, `${axis} ${l.state}: pill height`).toBe(theirs[0].style.pillHeight)
            expect(l.style.size, `${axis} ${l.state}: box`).toEqual(theirs[0].style.size)
        }
        // The padding depends on the number's width only through the box, so it is the same
        // for a one-digit board label as for `13`.
        expect(ours.map(l => l.style.padding), `${axis}: padding`).toEqual(ours.map(() => theirs[0].style.padding))
    }
})
