import { test, expect } from '@playwright/test'
import { VISUAL_URL } from './server'
import { waitForRest } from './rest'
import { PALETTE, PALETTE_DARK, cssName, type Token } from '../app/palette'

/**
 * Every drawing paints its token, not a value (UI row 1).
 *
 * A drawing that holds a literal -- or reads `PALETTE` in the browser -- paints the light theme
 * in both. Until row 4 the board's tokens are equal in both themes, so switching the theme
 * cannot show such a literal on the board: it would be the right colour either way (codex).
 * So this gives each token's custom property its own colour, a sentinel no token has, and
 * reads what each drawing computes: every one must be its token's sentinel.
 *
 * On the component sheet, which draws every piece, every cell state and the line states
 * statically, from fixtures.
 */

test.use({ baseURL: VISUAL_URL })

const TOKENS = Object.keys(PALETTE) as Token[]

/** Each token's sentinel: a colour of its own, which no token's value is. */
const sentinel = (token: Token) => `rgb(${TOKENS.indexOf(token) + 11}, 3, 5)`

/** A drawing, the property it paints, and the token it should paint it in. */
type Paint = [selector: string, property: 'fill' | 'stroke' | 'background-color' | 'color', token: Token]

const upright = '[data-specimen="domino-upright"] [data-piece="one"] svg'
const flat = '[data-specimen="domino-flat"] [data-piece="two"] svg'
const rock = '[data-specimen="rock"] [data-piece="rock"] svg'
const PAINTS: Paint[] = [
    // Both dominoes: the side, the face, the outline, the divider, the pips.
    ...[upright, flat].flatMap((piece): Paint[] => [
        [`${piece} rect:nth-of-type(1)`, 'fill', 'tileSide'],
        [`${piece} rect:nth-of-type(2)`, 'fill', 'tileFace'],
        [`${piece} [data-outline]`, 'stroke', 'pieceOutline'],
        [`${piece} line`, 'stroke', 'divider'],
        [`${piece} circle`, 'fill', 'pip'],
    ]),
    // The rock's four tones, in the order it draws them, and its outline.
    [`${rock} polygon:nth-of-type(1)`, 'fill', 'rockSide'],
    [`${rock} polygon:nth-of-type(2)`, 'fill', 'rockFace'],
    [`${rock} polygon:nth-of-type(3)`, 'fill', 'rockLit'],
    [`${rock} polygon:nth-of-type(4)`, 'fill', 'rockShade'],
    [`${rock} [data-outline]`, 'stroke', 'pieceOutline'],
    // Both checker tones: the top-left square is the light one.
    ['[data-specimen="empty"] [data-cell="0,0"]', 'background-color', 'checkerLight'],
    ['[data-specimen="empty"] [data-cell="0,1"]', 'background-color', 'checkerDark'],
    // The cell states' marks, and the cross.
    ['[data-mark="anchor"] [data-ring]', 'stroke', 'anchor'],
    ['[data-mark="candidate"] [data-ring]', 'stroke', 'candidateEdge'],
    ['[data-mark="candidate"] [data-wash]', 'fill', 'candidateWash'],
    ['[data-mark="focus"] [data-brackets]', 'stroke', 'cellFocus'],
    ['[data-mark="focus"] [data-halo]', 'stroke', 'cellFocusHalo'],
    ['[data-mark="hint"] [data-diamond]', 'fill', 'hint'],
    ['[data-mark="refused"] [data-halo]', 'stroke', 'refusedHalo'],
    ['[data-mark="refused"] [data-cross]', 'stroke', 'refusedCross'],
    // The chrome's drawings: the level arrows, the picker's check mark, the line labels.
    ['[data-specimen="controls-level"] svg path', 'fill', 'accent'],
    ['[data-specimen="controls-level"] svg path', 'stroke', 'accentEdge'],
    ['[data-check-mark] circle', 'fill', 'accent'],
    ['[data-check-mark] circle', 'stroke', 'accentEdge'],
    ['[data-check-mark] path', 'stroke', 'ink'],
    ['[data-specimen="empty"] [data-col-label="0"]', 'color', 'lineNeutral'],
    ['[data-specimen="target-satisfied"] [data-line-state="satisfied"]', 'color', 'success'],
    ['[data-specimen="target-over"] [data-line-state="over"]', 'color', 'problem'],
]

test('every drawing paints its token, whatever the token is set to', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/visual?cell=38')
    await expect(page.locator('main[data-sheet]')).toBeVisible()
    await waitForRest(page, 'main')

    const read = () => page.evaluate((paints: Paint[]) => paints.map(([selector, property]) => {
        const all = [...document.querySelectorAll(selector)]
        return all.length === 0 ? ['MISSING'] : all.map(el => getComputedStyle(el).getPropertyValue(property))
    }), PAINTS)

    // Before: every drawing is found, and paints its token's light value -- the sheet is light.
    const before = await read()
    expect(before.filter(values => values.includes('MISSING'))).toEqual([])

    await page.evaluate((sentinels: [string, string][]) => {
        for (const [name, value] of sentinels) document.documentElement.style.setProperty(`--${name}`, value)
    }, TOKENS.map(t => [cssName(t), sentinel(t)] as [string, string]))

    // Each drawing, every element the selector finds, at its own token's sentinel. Polled:
    // the labels' colour and the controls' surfaces transition, briefly, to a new value.
    await expect.poll(async () => (await read()).map((values, i) => `${PAINTS[i][0]} ${PAINTS[i][1]}: ${values.join(' | ')}`))
        .toEqual(PAINTS.map(([selector, property, token], i) =>
            `${selector} ${property}: ${before[i].map(() => sentinel(token)).join(' | ')}`))
})

test('and the sentinels are distinct from each other and from every value', () => {
    // Otherwise a drawing on the wrong token, or on a literal, could compute the right string.
    const sentinels = TOKENS.map(sentinel)
    expect(new Set(sentinels).size).toBe(TOKENS.length)
    // Every `#rrggbb` value in either theme, as the browser writes it; the `oklch()` values
    // are pale tints, nowhere near a sentinel's near-black red.
    const asComputed = (value: string) => {
        const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
        return m && `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`
    }
    const values = new Set([...Object.values(PALETTE), ...Object.values(PALETTE_DARK)].map(asComputed))
    expect(sentinels.filter(s => values.has(s))).toEqual([])
})
