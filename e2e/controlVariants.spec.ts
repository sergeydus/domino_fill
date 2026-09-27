import { test, expect, type Locator, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { VISUAL_URL } from './server'
import { CONTROL, type Variant, type VariantName } from '../app/controls'
import { PALETTE, type Token } from '../app/palette'

/**
 * One control vocabulary (graphics spec P2-2, row 14), asserted by computed style.
 *
 * Every button on every surface -- the game page, the archive, the day banner, the tutorial,
 * the component sheet with the completion card -- found by the browser, not listed. For each:
 *
 *   - at rest, what it computes to is **exactly one** variant's look in `app/controls.ts`
 *     -- surface, edge, radius, padding, text colour and weight -- and that variant is the
 *     one its class names. Not "matches its own": matches no other, so two variants that
 *     drifted into one look fail here.
 *   - its states are that variant's tokens: under the pointer, held, focused, and disabled.
 *     Each state is compared as the button's *whole* computed look against its rest with
 *     only the variant's named changes applied, so a state that changes anything else --
 *     a shadow the variant never asked for (codex, at row 14's review) -- fails.
 *
 * Under reduced motion, which zeroes the controls' transitions, so a state is read when it
 * has arrived rather than on its way.
 *
 * **A toggle is read unpressed.** `aria-pressed` is a state any variant can be in (P2-2:
 * "pressed is a state, not a variant"), and pressed looks the same whatever the variant, so
 * it would hide the one underneath. For its turn here, a toggle's `aria-pressed` is set to
 * `false` in the page and put back after; nothing is clicked, so the store never hears of it.
 * That pressed shows, by colour and without it, is `e2e/controlStates.spec.ts`'s. What pressed
 * may *change* is held here: pressed against unpressed, a toggle's whole look differs by the
 * accent's fill, the bold weight and the ring, and by nothing else, so a pressed toggle keeps
 * its variant's box and edge (codex, at row 14's review: `aria-pressed:p-8` added to the
 * pressed look passed every check that read a toggle unpressed).
 */

test.use({ reducedMotion: 'reduce' })

type Look = {
    label: string, variant: string | null, mark: string | null, card: boolean, disabled: boolean, current: boolean,
    background: number[], edge: number[], edgeColour: number[][], radius: string[], padding: string[],
    colour: number[], weight: string, opacity: string, filter: string, shadow: string, scale: string,
    translate: string, outline: number[],
}

/** Every visible button in `scope`. */
const buttonsIn = async (scope: Locator) => {
    const out: Locator[] = []
    for (const b of await scope.locator('button').all()) if (await b.isVisible()) out.push(b)
    return out
}

/** A button's computed look, colours as canvas bytes so every syntax compares alike. */
const lookOf = (b: Locator): Promise<Look> => b.evaluate(el => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const bytes = (colour: string) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000000'
        ctx.fillStyle = colour
        ctx.fillRect(0, 0, 1, 1)
        return Array.from(ctx.getImageData(0, 0, 1, 1).data)
    }
    const cs = getComputedStyle(el)
    const sides = ['Top', 'Right', 'Bottom', 'Left'] as const
    /*
     * The shadow as the layers it draws. Tailwind's ring is five layers, four of them
     * transparent and zero-sized, which paint nothing; they are dropped, so its ring and the
     * variants' single-layer ring compare as the same thing.
     */
    const layers = cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/).map(l => l.trim())
        .filter(l => !/^rgba\(0, 0, 0, 0\) 0px 0px 0px 0px$/.test(l))
    const variant = Array.from(el.classList).find(c => c.startsWith('control-'))?.slice('control-'.length) ?? null
    return {
        label: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '?',
        variant, mark: el.getAttribute('data-mark'), card: el.closest('[data-completion-card]') !== null,
        disabled: (el as HTMLButtonElement).disabled, current: el.hasAttribute('aria-current'),
        // Every side and corner: a box of its own on one side (`pr-8`) is still one.
        background: bytes(cs.backgroundColor),
        edge: sides.map(side => parseFloat(cs[`border${side}Width`])),
        edgeColour: sides.map(side => bytes(cs[`border${side}Color`])),
        radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
        padding: sides.map(side => cs[`padding${side}`]),
        colour: bytes(cs.color), weight: cs.fontWeight, opacity: cs.opacity, filter: cs.filter,
        shadow: layers.length ? layers.join(', ') : 'none', scale: cs.scale, translate: cs.translate, outline: bytes(cs.outlineColor),
    }
})

/** Every token's value, as the page's canvas paints it. */
const paintsOf = (page: Page): Promise<Record<Token, number[]>> => page.evaluate(palette => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    return Object.fromEntries(Object.entries(palette).map(([token, value]) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000000'
        ctx.fillStyle = value
        ctx.fillRect(0, 0, 1, 1)
        return [token, Array.from(ctx.getImageData(0, 0, 1, 1).data)]
    }))
}, PALETTE) as Promise<Record<Token, number[]>>

const NONE = [0, 0, 0, 0]

/** A 2px ring in `token`, as the browser computes the box shadow. */
const ringOf = (token: Token, paint: Record<Token, number[]>) => `rgb(${paint[token].slice(0, 3).join(', ')}) 0px 0px 0px 2px`

/** Everything a button computes to that its state can change: the look without its names. */
const shapeOf = ({ background, edge, edgeColour, radius, padding, colour, weight, opacity, filter, shadow, scale, translate, outline }: Look) =>
    ({ background, edge, edgeColour, radius, padding, colour, weight, opacity, filter, shadow, scale, translate, outline })

/** The surface a variant rests on, for a button with this `data-mark`. */
const surfaceOf = (c: Variant, mark: string | null, paint: Record<Token, number[]>) => {
    if (c.surface === null) return NONE
    if (typeof c.surface === 'string') return paint[c.surface]
    return mark !== null && mark in c.surface ? paint[(c.surface as Record<string, Token>)[mark]] : null
}

/** What `variant` looks like at rest, as the parts of a `Look` it decides. */
const restOf = (name: VariantName, look: Look, paint: Record<Token, number[]>) => {
    const c: Variant = CONTROL[name]
    const edge = c.edge?.width ?? 0
    const surface = look.disabled && c.disabled.surface ? paint[c.disabled.surface] : surfaceOf(c, look.mark, paint)
    return {
        background: surface,
        edge: [edge, edge, edge, edge],
        edgeColour: c.edge ? [0, 1, 2, 3].map(() => paint[c.edge!.colour]) : 'any',
        radius: [0, 1, 2, 3].map(() => `${c.radius}px`),
        padding: [`${c.padding.y - edge}px`, `${c.padding.x - edge}px`, `${c.padding.y - edge}px`, `${c.padding.x - edge}px`],
        colour: c.ink ? paint[c.ink] : 'any',
        weight: String(c.weight),
        opacity: look.disabled ? String(c.disabled.opacity ?? 1) : '1',
        filter: look.disabled ? c.disabled.filter ?? 'none' : 'none',
        // No shadow at rest, but the current day's ring (and a toggle's, read unpressed here).
        shadow: look.current && c.current ? ringOf(c.current.ring, paint) : 'none',
    }
}

/** The same parts, read off the button. */
const partsOf = (look: Look, expected: ReturnType<typeof restOf>) => ({
    background: look.background, edge: look.edge,
    edgeColour: expected.edgeColour === 'any' ? 'any' : look.edgeColour,
    radius: look.radius, padding: look.padding,
    colour: expected.colour === 'any' ? 'any' : look.colour,
    weight: look.weight, opacity: look.opacity, filter: look.filter, shadow: look.shadow,
})

/** Run `body` with a toggle unpressed, and put it back. */
const unpressed = async <T>(b: Locator, body: () => Promise<T>): Promise<T> => {
    const was = await b.getAttribute('aria-pressed')
    if (was !== null) await b.evaluate(el => el.setAttribute('aria-pressed', 'false'))
    try {
        return await body()
    } finally {
        if (was !== null) await b.evaluate((el, value) => el.setAttribute('aria-pressed', value), was)
    }
}

const NAMES = Object.keys(CONTROL) as VariantName[]

/**
 * Every button in `scope` is exactly one variant, the one it names, and has that variant's
 * states. Returns the variants seen, so a caller can say which surfaces covered which.
 */
const expectVocabulary = async (page: Page, scope: Locator, least: number) => {
    const paint = await paintsOf(page)
    const found = await buttonsIn(scope)
    expect(found.length, 'the buttons were found').toBeGreaterThanOrEqual(least)
    const seen = new Set<string>()
    for (const b of found) {
        await page.mouse.move(0, 0)
        const was = await b.getAttribute('aria-pressed')
        if (was !== null) {
            const as = async (value: string) => {
                await b.evaluate((el, v) => el.setAttribute('aria-pressed', v), value)
                return shapeOf(await lookOf(b))
            }
            const [on, off] = [await as('true'), await as('false')]
            await b.evaluate((el, v) => el.setAttribute('aria-pressed', v), was)
            expect(on, `${await b.getAttribute('aria-label') ?? await b.innerText()}: pressed changes its fill, weight and ring, and nothing else`)
                .toEqual({ ...off, background: paint.accent, weight: '700', shadow: ringOf('accentEdge', paint) })
        }
        await unpressed(b, async () => {
            const look = await lookOf(b)
            const matches = NAMES.filter(name => {
                const expected = restOf(name, look, paint)
                return JSON.stringify(partsOf(look, expected)) === JSON.stringify(expected)
            })
            expect(matches, `${look.label}: the variants it computes to`).toEqual([look.variant])
            const name = look.variant as VariantName
            seen.add(name)
            const c: Variant = CONTROL[name]
            const at = shapeOf(look)
            if (look.disabled) {
                // Disabled answers neither a hover nor a press (P1-6): its whole look, held.
                await b.hover({ force: true })
                expect(shapeOf(await lookOf(b)), `${look.label}: disabled, hovered`).toEqual(at)
                return
            }

            // Hover: the variant's new surface, ring or scale, and nothing else changes --
            // including no shadow where the variant names none.
            const hover = {
                ...at,
                background: c.hover.surface ? paint[c.hover.surface] : at.background,
                shadow: c.hover.ring ? ringOf(c.hover.ring, paint) : at.shadow,
                scale: c.hover.scale ? String(c.hover.scale) : at.scale,
            }
            await b.hover()
            expect(shapeOf(await lookOf(b)), `${look.label}: hovered`).toEqual(hover)

            // Held: the variant's pressed surface over the hover it is also under, P1-6's
            // pixel and 90%, and nothing else.
            const held = {
                ...hover,
                background: c.press.surface ? paint[c.press.surface] : hover.background,
                translate: '0px 1px', filter: 'brightness(0.9)',
            }
            await page.mouse.down()
            const pressed = shapeOf(await lookOf(b))
            await page.mouse.move(0, 0)
            await page.mouse.up()
            expect(pressed, `${look.label}: held`).toEqual(held)

            // Focused from the keyboard: the variant's ring, or the card's own on its green,
            // and nothing else.
            await page.keyboard.press('Shift')
            await b.focus()
            const focused = shapeOf(await lookOf(b))
            await b.evaluate(el => (el as HTMLElement).blur())
            expect(focused, `${look.label}: focused`).toEqual({ ...at, outline: look.card ? paint.onSuccess : paint[c.focus] })
        })
    }
    return seen
}

test.describe('every control is one variant, at rest and in each of its states', () => {
    test('the game page', async ({ page }) => {
        await openBoard(page)
        // Difficulty 3, the arrows 2, Archive, Sound, Check, Hint, Undo, Reset.
        const seen = await expectVocabulary(page, page.locator('body'), 11)
        expect([...seen].sort()).toEqual(['caution', 'icon', 'primary', 'quiet', 'secondary'])
    })

    test('the archive, and the day banner', async ({ page }) => {
        await openBoard(page)
        await page.locator('[data-open-archive]').click()
        const archive = page.locator('[data-archive]')
        await expect(archive.locator('[data-archive-day]').first()).toBeVisible()
        const seen = await expectVocabulary(page, archive, 4)
        expect([...seen].sort()).toEqual(['day', 'quiet', 'secondary'])

        const days = await archive.locator('[data-archive-day]:not([aria-current])').evaluateAll(els => els.map(el => el.getAttribute('data-archive-day')!))
        test.skip(days.length === 0, 'no other day this month to open')
        await archive.locator(`[data-archive-day="${days[0]}"]`).click()
        await expect(page.locator('[data-go-to-today]')).toBeVisible()
        expect([...await expectVocabulary(page, page.locator('[data-day-banner]'), 1)]).toEqual(['primary'])
    })

    test('the tutorial, whose primary is disabled until its board is solved', async ({ page }) => {
        await page.goto('/')
        const gotIt = page.getByRole('button', { name: 'Got it!' })
        await expect(gotIt).toBeDisabled()
        const seen = await expectVocabulary(page, page.locator('.fixed.inset-0').first(), 2)
        expect([...seen].sort()).toEqual(['primary', 'quiet'])
    })

    test('the component sheet, and the completion card on it', async ({ page }) => {
        await page.goto(`${VISUAL_URL}/visual?cell=53`)
        await expect(page.locator('main[data-sheet]')).toBeVisible()
        const seen = await expectVocabulary(page, page.locator('main'), 13)
        expect([...seen].sort()).toEqual(['caution', 'icon', 'primary', 'quiet', 'secondary'])
    })
})

test('Reset is told from Hint and Undo by its edge, and not by its fill', async ({ page }) => {
    /*
     * P2-2: "visually distinct from Hint and Undo by a named property, not by fill alone".
     * The property is the edge -- `border-color`, `problem`, and `border-width`, 2px -- and
     * the fill is asserted equal, so the edge is the whole of the difference.
     */
    await openBoard(page)
    await page.mouse.move(0, 0)
    const paint = await paintsOf(page)
    const [reset, hint, undo] = await Promise.all(['[data-reset]', '[data-hint]', '[data-undo]'].map(s => lookOf(page.locator(s))))
    expect(reset.background).toEqual(hint.background)
    expect(reset.background).toEqual(paint.controlSurface)
    expect({ width: reset.edge, colour: reset.edgeColour }).toEqual({ width: [2, 2, 2, 2], colour: [0, 1, 2, 3].map(() => paint.problem) })
    for (const quiet of [hint, undo]) expect(quiet.edge, quiet.label).toEqual([0, 0, 0, 0])
    // The same box all the same: the edge is inside it, so the row does not jump.
    const box = (s: string) => page.locator(s).evaluate(el => el.getBoundingClientRect().height)
    expect(await box('[data-reset]')).toBe(await box('[data-hint]'))
})
