import { test, expect, type Page } from '@playwright/test'
import sharp from 'sharp'
import { VISUAL_URL } from './server'
import { waitForRest } from './rest'
import { STATE } from '../app/dominoFill/cellStates'

/**
 * The four persistent cell states, legible at the floor and without colour (graphics spec
 * P1-5, row 11), and the refused move's cross, held to the same (P1-6, row 12).
 *
 * "Distinguishable without colour" is measured, not argued. The component sheet holds every
 * state on a board of its own. The page is shot twice: as it is, and with every state's
 * drawing hidden and nothing else changed. For each state, the pixels of its square whose
 * lightness moved between the two shots are what it draws -- the board taken away, and
 * the hue thrown away. That footprint must be substantial, and every state's footprint
 * must differ from every other's.
 *
 * Greyscale is the strictest reading of "without colour": it is what is left to someone
 * who sees no hue at all, and any pair it can tell apart, a partial colour deficiency can
 * too.
 */

test.use({ baseURL: VISUAL_URL })

/** Where each state is on the sheet: its specimen, and its square (the hint's is found). */
const STATES = {
    anchor: { specimen: 'anchor', cell: '0,0' },
    candidate: { specimen: 'anchor', cell: '0,1' },
    focus: { specimen: 'focus', cell: '1,1' },
    hint: { specimen: 'hint', cell: null },
    refused: { specimen: 'refused', cell: '0,0' },
} as const
type State = keyof typeof STATES

/**
 * The focus over each thing a square can hold. The keyboard reaches every square, rocks
 * and pieces included, and whether the brackets stay in sight there depends on the
 * overlay's stacking order, not on the drawing. One at a time: since P1-6 the brackets
 * are drawn only while the keyboard's focus is on the board (`focusVisible`), so focusing
 * a second board takes them off the first.
 *
 * Measured at row 11: over the rock 10.1-10.7%, over a flat domino 13.6-14.6%, over an
 * upright 13.0-13.3%. With the focus under the pieces (z-10), both dominoes fall to 0-0.6%;
 * the rock keeps 9.4-10.0%, because its facets leave the corners bare and the brackets sit
 * in the corners. Under the squares themselves (-z-10), all three fall to 0%.
 */
const OCCUPIED = {
    rock: { specimen: 'rock', cell: '1,1' },
    'domino-flat': { specimen: 'domino-flat', cell: '0,0' },
    'domino-upright': { specimen: 'domino-upright', cell: '0,0' },
} as const
type Occupant = keyof typeof OCCUPIED
type Target = { specimen: string, cell: string | null }

/** A lightness change this large, out of 255, is part of a footprint. */
const MOVED = 32

const rectOf = async (page: Page, specimen: string, cell: string | null) => {
    const locator = cell === null
        ? page.locator(`[data-specimen="${specimen}"] [data-hinted]`)
        : page.locator(`[data-specimen="${specimen}"] [data-cell="${cell}"]`)
    await expect(locator).toHaveCount(1)
    return (await locator.boundingBox())!
}

/** Greyscale of a square of the page, as 0-255 lightness per pixel. */
const grey = async (png: Buffer, box: { x: number, y: number }, size: number) => {
    const { data } = await sharp(png)
        .extract({ left: Math.round(box.x), top: Math.round(box.y), width: size, height: size })
        .removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const out = new Float64Array(size * size)
    for (let i = 0; i < out.length; i++) out[i] = 0.2126 * data[3 * i] + 0.7152 * data[3 * i + 1] + 0.0722 * data[3 * i + 2]
    return out
}

/**
 * Each target's footprint: 1 where its square's lightness moved when the drawings were
 * hidden. `arrange` runs on the loaded sheet, before either shot.
 */
const footprints = async <K extends string>(
    page: Page, cell: number, targets: Record<K, Target>, arrange?: () => Promise<void>,
) => {
    await page.goto(`/visual?cell=${cell}`)
    await expect(page.locator('main[data-sheet]')).toBeVisible()
    await waitForRest(page, 'main')
    await arrange?.()
    await page.mouse.move(0, 0)
    const shot = await page.screenshot({ fullPage: true })
    // The same page with every state's drawing hidden, and nothing else touched.
    const style = await page.addStyleTag({ content: '[data-mark] { visibility: hidden !important }' })
    const bare = await page.screenshot({ fullPage: true })
    await style.evaluate(el => (el as Element).remove())
    const out = {} as Record<K, Uint8Array>
    for (const [name, { specimen, cell: at }] of Object.entries(targets) as [K, Target][]) {
        const box = await rectOf(page, specimen, at)
        const [a, b] = await Promise.all([grey(shot, box, cell), grey(bare, box, cell)])
        out[name] = Uint8Array.from(a, (v, i) => Math.abs(v - b[i]) >= MOVED ? 1 : 0)
    }
    return out
}

/**
 * The bars, as fractions of the square's area. Measured at row 11: the smallest footprint
 * is the hint's diamond, 9.5-10%, and the closest pair is the anchor and the hint, 31-33%
 * apart, at both sizes. The bars sit well under both, so they hold what the states are and
 * fail what they must not become: two states drawn alike come out 0% apart.
 *
 * Row 12 added the refused cross, and the bar did its job on the first drawing: kept inside
 * the anchor ring, the cross was 14.9% from the hint's diamond, under 15%, because its halo
 * covered the diamond's whole centre. It was redrawn, not the bar: its ends now pass under
 * the ring's corners, and it measures 30-31% of the square, its closest neighbour the
 * candidate at 19.8% and the hint at 23.2%.
 */
const FOOTPRINT = 0.05
const APART = 0.15

for (const cell of [38, 53]) {
    test(`at ${cell}px, each state draws a footprint of its own, in greyscale`, async ({ page }) => {
        // The sheet's own viewport, as the baselines take it.
        await page.setViewportSize({ width: 1280, height: 800 })
        const marks = await footprints(page, cell, STATES)
        const area = cell * cell
        const states = Object.keys(marks) as State[]
        for (const state of states) {
            const drawn = marks[state].reduce((t, v) => t + v, 0) / area
            expect(drawn, `${state} draws too little to read`).toBeGreaterThanOrEqual(FOOTPRINT)
        }
        for (let i = 0; i < states.length; i++) {
            for (let j = i + 1; j < states.length; j++) {
                const [a, b] = [marks[states[i]], marks[states[j]]]
                const apart = a.reduce((t, v, k) => t + (v !== b[k] ? 1 : 0), 0) / area
                expect(apart, `${states[i]} and ${states[j]} look alike without colour`).toBeGreaterThanOrEqual(APART)
            }
        }
    })

    test(`at ${cell}px, the focus stays in sight over a rock and over both dominoes`, async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        for (const [occupant, target] of Object.entries(OCCUPIED) as [Occupant, Target][]) {
            const marks = await footprints(page, cell, { [occupant]: target }, async () => {
                // Through the square itself, as the keyboard does -- a key first, so the
                // browser counts the focus as the keyboard's.
                await page.keyboard.press('Shift')
                await page.locator(`[data-specimen="${target.specimen}"] [data-cell="${target.cell}"]`).focus()
                await expect(page.locator(`[data-specimen="${target.specimen}"] [data-focus-visible]`))
                    .toHaveAttribute('data-focus', target.cell!)
                await waitForRest(page, 'main')
            })
            const drawn = marks[occupant].reduce((t, v) => t + v, 0) / (cell * cell)
            expect.soft(drawn, `the focus is lost over the ${occupant}`).toBeGreaterThanOrEqual(FOOTPRINT)
        }
    })

    test(`at ${cell}px, a refused move's cross stays in sight over a rock and over both dominoes`, async ({ page }) => {
        /*
         * A refusal lands on whatever the square holds (P1-6): a tap on a rock, a drag that
         * starts on a domino. The cross is drawn with the other states, above the pieces,
         * and red on a white halo so that one of the two reads on every surface.
         */
        await page.setViewportSize({ width: 1280, height: 800 })
        const square = (specimen: string, at: string) => page.locator(`[data-specimen="${specimen}"] [data-cell="${at}"]`)
        const press = async (specimen: string, from: string, to: string) => {
            await square(specimen, from).hover()
            await page.mouse.down()
            await square(specimen, to).hover()
            await page.mouse.up()
        }
        const marks = await footprints(page, cell, OCCUPIED, async () => {
            await press('rock', '1,1', '1,1')                  // a tap on the rock
            await press('domino-flat', '0,0', '1,0')           // from the flat domino, down
            await press('domino-upright', '0,0', '0,1')        // from the upright, across
            for (const { specimen, cell: at } of Object.values(OCCUPIED)) {
                await expect(page.locator(`[data-specimen="${specimen}"] [data-refused]`)).toHaveAttribute('data-refused', at)
            }
            await waitForRest(page, 'main')
        })
        for (const occupant of Object.keys(marks) as Occupant[]) {
            const drawn = marks[occupant].reduce((t, v) => t + v, 0) / (cell * cell)
            expect.soft(drawn, `the cross is lost over the ${occupant}`).toBeGreaterThanOrEqual(FOOTPRINT)
        }
    })

    test(`at ${cell}px, each state's drawing is the cell's size, its lengths fractions of it`, async ({ page }) => {
        /*
         * Each mark is drawn in a 100-unit viewBox and sized to its square, so a length in
         * it is that many hundredths of the cell. Asserted from the browser's own layout:
         * the drawing's box is the square's, and the ring's stroke, the brackets' stroke
         * and the diamond's reach come out at their fractions of the cell in pixels.
         */
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`/visual?cell=${cell}`)
        await waitForRest(page, 'main')
        const measured = await page.evaluate(() => Array.from(document.querySelectorAll<SVGSVGElement>('svg[data-mark]'), svg => {
            const square = svg.closest('[data-cell]') ?? svg.parentElement!
            const [b, s] = [svg.getBoundingClientRect(), square.getBoundingClientRect()]
            const scale = b.width / svg.viewBox.baseVal.width
            const shape = svg.querySelector('[data-ring], [data-brackets], [data-diamond], [data-cross]') as SVGGraphicsElement
            return {
                mark: svg.dataset.mark!, box: [b.width, b.height, s.width, s.height, b.x - s.x, b.y - s.y],
                stroke: parseFloat(getComputedStyle(shape).strokeWidth) * scale,
                extent: shape.getBBox().width * scale,
            }
        }))
        expect(measured.map(m => m.mark).sort()).toEqual(['anchor', 'candidate', 'candidate', 'focus', 'hint', 'refused'])
        for (const m of measured) {
            const [w, h, sw, sh, dx, dy] = m.box
            expect([w, h, dx, dy], `${m.mark}: not its square's box`).toEqual([sw, sh, 0, 0])
            expect(w).toBeCloseTo(cell, 6)
            if (m.mark === 'hint') expect(m.extent / cell, 'hint diamond').toBeCloseTo((2 * STATE.hint.reach) / 100, 6)
            else if (m.mark === 'refused') {
                // The cross's centre lines, end to end, and its red's weight.
                expect(m.extent / cell, 'refused cross').toBeCloseTo((2 * STATE.refused.reach) / 100, 6)
                expect(m.stroke / cell, 'refused stroke').toBeCloseTo(STATE.refused.stroke / 100, 6)
            }
            else if (m.mark === 'focus') expect(m.stroke / cell, 'focus stroke').toBeCloseTo(STATE.focus.stroke / 100, 6)
            else expect(m.stroke / cell, `${m.mark} ring stroke`).toBeCloseTo(STATE.ring.stroke / 100, 6)
        }
    })
}
