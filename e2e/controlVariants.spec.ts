import { test, expect, type Locator, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { LATE_IN_A_MONTH, pinDay } from './calendar'
import { VISUAL_URL } from './server'
import { CONTROL, type Variant, type VariantName } from '../app/controls'
import { PALETTE, type Token } from '../app/palette'

/**
 * One control vocabulary (graphics spec P2-2, row 14; raised in UI row 3), asserted by
 * computed style.
 *
 * Every button on every surface -- the game page, the archive, the day banner, the tutorial,
 * the component sheet with the completion card -- found by the browser, not listed. For each:
 *
 *   - at rest, what it computes to is **exactly one** variant's look in `app/controls.ts`
 *     -- surface, border, edge, radius, padding, text colour and weight -- and that variant is
 *     the one its class names. Not "matches its own": matches no other, so two variants that
 *     drifted into one look fail here.
 *   - its states are that variant's tokens: under the pointer, held, focused, and disabled.
 *     Each state is compared as the button's *whole* computed look against its rest with
 *     only the variant's named changes applied, so a state that changes anything else --
 *     a shadow the variant never asked for (codex, at row 14's review) -- fails.
 *
 * Under reduced motion, which zeroes the controls' transitions, so a state is read when it
 * has arrived rather than on its way. A raised control's press doesn't move under reduced
 * motion, so "held" here is its edge going; the sink itself is `e2e/controlStates.spec.ts`'s.
 *
 * **A toggle is read unpressed.** Pressed is the same change on every toggle, so it would hide
 * the variant underneath. For its turn here, a toggle's `aria-pressed` is set to `false` in the
 * page and put back after; nothing is clicked, so the store never hears of it. What pressed
 * may *change* is held here: pressed against unpressed, a toggle's whole look differs by the
 * accent, its text, and its depth with no edge (UI row 3), and by nothing else, so a pressed
 * toggle keeps its variant's box and weight (codex, at row 14's review: `aria-pressed:p-8`
 * added to the pressed look passed every check that read a toggle unpressed).
 */

test.use({ reducedMotion: 'reduce' })

type Look = {
    label: string, variant: string | null, mark: string | null, disabled: boolean, current: boolean, checked: boolean,
    background: number[], border: number[], borderColour: number[][], radius: string[], padding: string[],
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
        variant, mark: el.getAttribute('data-mark'),
        disabled: (el as HTMLButtonElement).disabled, current: el.hasAttribute('aria-current'),
        checked: el.getAttribute('aria-checked') === 'true',
        // Every side and corner: a box of its own on one side (`pr-8`) is still one.
        background: bytes(cs.backgroundColor),
        border: sides.map(side => parseFloat(cs[`border${side}Width`])),
        // A border of no width paints nothing, whatever `currentColor` says its colour is.
        borderColour: sides.map(side => parseFloat(cs[`border${side}Width`]) > 0 ? bytes(cs[`border${side}Color`]) : [0, 0, 0, 0]),
        radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
        padding: sides.map(side => cs[`padding${side}`]),
        colour: bytes(cs.color), weight: cs.fontWeight, opacity: cs.opacity, filter: cs.filter,
        shadow: layers.length ? layers.join(', ') : 'none', scale: cs.scale, translate: cs.translate,
        // Likewise an outline that isn't drawn: its colour is `currentColor` until focus sets one.
        outline: cs.outlineStyle !== 'none' ? bytes(cs.outlineColor) : [0, 0, 0, 0],
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

const rgbOf = (token: Token, paint: Record<Token, number[]>) => `rgb(${paint[token].slice(0, 3).join(', ')})`

/**
 * The box shadow a variant draws, as the browser computes it: a 2px ring in `ring`, if any,
 * over its edge in `edge`, if any -- the order `scripts/controls-css.ts` writes them.
 */
const shadowOf = (c: Variant, paint: Record<Token, number[]>, edge: Token | null, ring?: Token) => {
    const layers = [
        ring ? `${rgbOf(ring, paint)} 0px 0px 0px 2px` : null,
        c.edge && edge ? `${rgbOf(edge, paint)} 0px ${c.edge.depth}px 0px 0px` : null,
    ].filter(l => l !== null)
    return layers.length ? layers.join(', ') : 'none'
}

/** Everything a button computes to that its state can change: the look without its names. */
const shapeOf = ({ background, border, borderColour, radius, padding, colour, weight, opacity, filter, shadow, scale, translate, outline }: Look) =>
    ({ background, border, borderColour, radius, padding, colour, weight, opacity, filter, shadow, scale, translate, outline })

/** The surface a variant rests on, for a button with this `data-mark`. */
const surfaceOf = (c: Variant, mark: string | null, paint: Record<Token, number[]>) => {
    if (c.surface === null) return NONE
    if (typeof c.surface === 'string') return paint[c.surface]
    return mark !== null && mark in c.surface ? paint[(c.surface as Record<string, Token>)[mark]] : null
}

/** What `variant` looks like at rest, as the parts of a `Look` it decides. */
const restOf = (name: VariantName, look: Look, paint: Record<Token, number[]>) => {
    const c: Variant = CONTROL[name]
    const border = c.border?.width ?? 0
    const surface = look.disabled && c.disabled.surface ? paint[c.disabled.surface] : surfaceOf(c, look.mark, paint)
    const ink = look.disabled && c.disabled.ink ? c.disabled.ink : c.ink
    // The edge, unless disabled; and the current day's ring, or a chosen chip's, over it.
    const ring = look.current && c.current ? c.current.ring : look.checked && c.checked ? c.checked.ring : undefined
    return {
        background: surface,
        border: [border, border, border, border],
        borderColour: c.border ? [0, 1, 2, 3].map(() => paint[c.border!.colour]) : 'any',
        radius: [0, 1, 2, 3].map(() => `${c.radius}px`),
        padding: [`${c.padding.y - border}px`, `${c.padding.x - border}px`, `${c.padding.y - border}px`, `${c.padding.x - border}px`],
        colour: ink ? paint[ink] : 'any',
        weight: String(c.weight),
        opacity: look.disabled ? String(c.disabled.opacity ?? 1) : '1',
        filter: look.disabled ? c.disabled.filter ?? 'none' : 'none',
        shadow: shadowOf(c, paint, look.disabled ? null : c.edge?.colour ?? null, ring),
    }
}

/** The same parts, read off the button. */
const partsOf = (look: Look, expected: ReturnType<typeof restOf>) => ({
    background: look.background, border: look.border,
    borderColour: expected.borderColour === 'any' ? 'any' : look.borderColour,
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
 * Variants that are meant to look the same disabled: a disabled primary gives the accent up for
 * the raised look (`app/controls.ts`, rule 4 of UI row 3's contract), so it doesn't ask to be
 * pressed. Row 14 told the two apart by the primary's weight, which UI row 3 made every
 * control's 800. No other pair may coincide, disabled or not.
 */
const ALIKE_DISABLED: VariantName[][] = [['primary', 'raised']]

const variantOf = (b: Locator) => b.evaluate(el =>
    Array.from(el.classList).find(c => c.startsWith('control-'))?.slice('control-'.length)) as Promise<VariantName>

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
            const c: Variant = CONTROL[await variantOf(b)]
            expect(c.pressed, `${await b.getAttribute('aria-label') ?? await b.innerText()}: a toggle's variant says how it's pressed`).toBeDefined()
            // Held down: the accent and its text, the edge's depth lower, no edge -- and the same
            // weight, which told pressed apart until UI row 3. Shown under reduced motion too.
            expect(on, `${await b.getAttribute('aria-label') ?? await b.innerText()}: pressed is held down on the accent, and nothing else`)
                .toEqual({
                    ...off, background: paint[c.pressed!.surface], colour: paint[c.pressed!.ink],
                    translate: `0px ${c.edge!.depth}px`, shadow: 'none',
                })
        }
        /*
         * A chip, checked against unchecked: its variant's ring, and nothing else about the
         * button -- no fill, no weight, no box. Its check mark is a drawing inside it, held by
         * `e2e/controlStates.spec.ts`. Set in the page and put back; nothing is clicked.
         */
        const checkedWas = await b.getAttribute('aria-checked')
        if (checkedWas !== null) {
            const as = async (value: string) => {
                await b.evaluate((el, v) => el.setAttribute('aria-checked', v), value)
                return shapeOf(await lookOf(b))
            }
            const [on, off] = [await as('true'), await as('false')]
            await b.evaluate((el, v) => el.setAttribute('aria-checked', v), checkedWas)
            const c: Variant = CONTROL[await variantOf(b)]
            const ring = c.checked?.ring
            expect(ring, `${await b.getAttribute('aria-label')}: a checked control names a checked ring`).toBeDefined()
            expect(on, `${await b.getAttribute('aria-label')}: checked changes its ring, and nothing else`)
                .toEqual({ ...off, shadow: shadowOf(c, paint, c.edge?.colour ?? null, ring) })
        }
        await unpressed(b, async () => {
            const look = await lookOf(b)
            const matches = NAMES.filter(name => {
                const expected = restOf(name, look, paint)
                return JSON.stringify(partsOf(look, expected)) === JSON.stringify(expected)
            })
            const alike = look.disabled ? ALIKE_DISABLED.find(set => set.includes(look.variant as VariantName)) : undefined
            // Exactly the pair, never one of it: a disabled primary that kept the accent would
            // compute to `primary` alone, and must fail here.
            if (alike) expect(matches.sort(), `${look.label}: disabled, the variants it computes to`).toEqual([...alike].sort())
            else expect(matches, `${look.label}: the variants it computes to`).toEqual([look.variant])
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
            const ring = look.current && c.current ? c.current.ring : look.checked && c.checked ? c.checked.ring : undefined

            // Hover: the variant's edge colour, ring or scale, and nothing else changes --
            // including no shadow where the variant names none. A chosen chip keeps its ring.
            const hover = {
                ...at,
                shadow: c.hover.edge || c.hover.ring
                    ? shadowOf(c, paint, c.hover.edge ?? c.edge?.colour ?? null, c.hover.ring ?? ring)
                    : at.shadow,
                scale: c.hover.scale ? String(c.hover.scale) : at.scale,
            }
            await b.hover()
            expect(shapeOf(await lookOf(b)), `${look.label}: hovered`).toEqual(hover)

            // Held. `sink`: the edge goes, and -- under the reduced motion this file runs in --
            // the control doesn't move; a chosen chip keeps its ring. `nudge`: P1-6's pixel and
            // 90%, over the hover it is also under.
            const held = c.press === 'sink'
                ? { ...hover, shadow: shadowOf(c, paint, null, look.checked ? c.checked?.ring : undefined), filter: 'none', translate: 'none' }
                : { ...hover, translate: '0px 1px', filter: 'brightness(0.9)' }
            await page.mouse.down()
            const pressed = shapeOf(await lookOf(b))
            await page.mouse.move(0, 0)
            await page.mouse.up()
            expect(pressed, `${look.label}: held`).toEqual(held)

            // Focused from the keyboard: the variant's ring, and nothing else. (The completion
            // card's buttons had a white ring of their own on its green until P2-3.)
            await page.keyboard.press('Shift')
            await b.focus()
            const focused = shapeOf(await lookOf(b))
            await b.evaluate(el => (el as HTMLElement).blur())
            expect(focused, `${look.label}: focused`).toEqual({ ...at, outline: paint[c.focus] })
        })
    }
    return seen
}

test.describe('every control is one variant, at rest and in each of its states', () => {
    test('the game page', async ({ page }) => {
        await openBoard(page)
        // Difficulty 3, the arrows 2, Archive, Sound, Check, Hint, Undo, Reset.
        const seen = await expectVocabulary(page, page.locator('body'), 11)
        expect([...seen].sort()).toEqual(['caution', 'icon', 'primary', 'raised'])
    })

    test('the archive, and the day banner', async ({ page }) => {
        // A day with earlier days in its month: on the 1st this skipped (`pinDay`).
        await pinDay(page, LATE_IN_A_MONTH)
        await openBoard(page)
        await page.locator('[data-open-archive]').click()
        const archive = page.locator('[data-archive]')
        await expect(archive.locator('[data-archive-day]').first()).toBeVisible()
        const seen = await expectVocabulary(page, archive, 4)
        expect([...seen].sort()).toEqual(['day', 'raised'])

        const days = await archive.locator('[data-archive-day]:not([aria-current])').evaluateAll(els => els.map(el => el.getAttribute('data-archive-day')!))
        expect(days.length, 'another day this month to open').toBeGreaterThan(0)
        await archive.locator(`[data-archive-day="${days[0]}"]`).click()
        await expect(page.locator('[data-go-to-today]')).toBeVisible()
        expect([...await expectVocabulary(page, page.locator('[data-day-banner]'), 1)]).toEqual(['primary'])
    })

    test('the tutorial, whose primary is disabled until its board is solved', async ({ page }) => {
        await page.goto('/')
        const gotIt = page.getByRole('button', { name: 'Got it!' })
        await expect(gotIt).toBeDisabled()
        const seen = await expectVocabulary(page, page.locator('.fixed.inset-0').first(), 2)
        expect([...seen].sort()).toEqual(['primary', 'raised'])
    })

    test('the component sheet, and the completion card on it', async ({ page }) => {
        await page.goto(`${VISUAL_URL}/visual?cell=53`)
        await expect(page.locator('main[data-sheet]')).toBeVisible()
        const seen = await expectVocabulary(page, page.locator('main'), 13)
        expect([...seen].sort()).toEqual(['caution', 'chip', 'icon', 'primary', 'raised'])
    })
})

test('Reset is told from Hint and Undo by its text, `problem`, and not by its fill or box', async ({ page }) => {
    /*
     * P2-2: "visually distinct from Hint and Undo by a named property, not by fill alone". The
     * property was a red edge until UI row 3, whose raised controls have none (UI-SPEC §3.3);
     * it is the text's colour now, and everything else is asserted equal, so the text is the
     * whole of the difference.
     */
    await openBoard(page)
    await page.mouse.move(0, 0)
    const paint = await paintsOf(page)
    const [reset, hint, undo] = await Promise.all(['[data-reset]', '[data-hint]', '[data-undo]'].map(s => lookOf(page.locator(s))))
    expect(reset.colour).toEqual(paint.problem)
    expect(reset.background).toEqual(paint.surface)
    for (const other of [hint, undo]) {
        expect(other.colour, other.label).toEqual(paint.ink)
        // Disabled on arrival, Hint and Undo are compared at rest as Reset is: everything but
        // the text's colour and the disabled look.
        const same = ({ background, border, radius, padding, weight }: Look) => ({ background, border, radius, padding, weight })
        expect(same(other), other.label).toEqual(same(reset))
    }
    const box = (s: string) => page.locator(s).evaluate(el => el.getBoundingClientRect().height)
    expect(await box('[data-reset]')).toBe(await box('[data-hint]'))
})
