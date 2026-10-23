import { test, expect, type Locator, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { onDate } from './calendar'
import { VISUAL_URL } from './server'
import { waitForRest } from './rest'
import { drag, solutionFor } from './play'
import { rgbBytes, type Token } from '../app/palette'
import { CONTROL } from '../app/controls'

/**
 * Colour carries a role, and only its own (graphics spec P1-4, row 10; §2.2).
 *
 * One accent, for interactive chrome. `success`, `problem` and `hint` are meanings, and
 * each may appear only on the state it names. Both halves are claims about *every* place a
 * colour appears, so the check is a scan: every element on the page, every colour the
 * browser computes for it -- background, text, borders, outline, ring shadows, SVG paint --
 * matched against the role tokens, in every state the tests below put the page in. A role
 * colour found anywhere its role does not allow fails, wherever it came from.
 *
 * Then, per control and per state, what each one should carry, so that "never wrong" is
 * not satisfied by "never there": the selected difficulty is the accent, a satisfied label
 * is `success`, and so on.
 *
 * There is deliberately no chroma comparison between the board and the controls; P1-4
 * says why. Hierarchy is these assertions and baselines 3 and 4.
 */

const ROLES = ['accent', 'accentEdge', 'success', 'problem', 'hint'] as const
type Role = typeof ROLES[number]

/**
 * Roles that share a value by design, declared (UI row 4). UI-SPEC §3.1 gives the hint the
 * accent's value, so no colour on the page can say which of the two a drawing reads: a value
 * that matches both reads as both, `accent|hint`, and is allowed where either role is -- the
 * same places the two allowed apart. Which token the hint's diamond reads is proved by its
 * sentinel instead (`e2e/themeTokens.spec.ts`), and any coincidence not declared here fails.
 */
const ALIASES: readonly (readonly Role[])[] = [['accent', 'hint']]

/** How a value the accent and the hint share reads: as both. */
const ACCENT = 'accent|hint'

/** Where each role may appear: the closest ancestor (or the element) must match. */
const ALLOWED: Record<Role, string> = {
    // Interactive chrome: a control, or the board's own focus ring on the grid.
    accent: 'button, [role="grid"]',
    accentEdge: 'button, [role="grid"]',
    // A satisfied line -- its pill since UI row 4 -- and a reached one, its number and its bar
    // (UI row 4); and the solved puzzle's outcome line -- not the card around it, since P2-3
    // (row 15) took the card off its green.
    success: '[data-line-state="satisfied"], [data-line-state="reached"], [data-completion-message]',
    // The advice strip only while it reports a problem (`adviceIsProblem`), not the strip.
    // And a refused move's cross (P1-6, row 12): something is wrong with that move. And the
    // caution variant's edge, `Reset` (P2-2, row 14): something that cannot be taken back.
    // And the refused move's reason in the strip (keyboard polish), for the same reason as
    // its cross. `Reset`'s is its text since UI row 3, whose raised controls have no edge.
    problem: '[data-line-state="over"], [data-advice-kind="wrong"], [data-advice-kind="unavailable"], [role="alert"], [data-refused] [data-cross], [data-refusal-reason], .control-caution',
    hint: '[data-hinted]',
}

/** A role colour found: `role` is every role its value matches, joined by `|`. */
type Finding = { role: string, property: string, element: string, allowed: boolean }

/**
 * Every role colour the page paints, and whether where it is allowed. Self-contained: it is
 * shipped to the page as source. Colours are normalised by painting them on a canvas, so
 * every syntax the browser can compute -- `rgb()`, `color(srgb ...)`, `oklab()` from a
 * `color-mix` -- reads back as the same bytes.
 */
const scan = (page: Page) => page.evaluate(({ roles, allowed }) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const cache = new Map<string, number[]>()
    const bytes = (colour: string) => {
        if (!cache.has(colour)) {
            ctx.clearRect(0, 0, 1, 1)
            ctx.fillStyle = '#000000'
            ctx.fillStyle = colour
            ctx.fillRect(0, 0, 1, 1)
            cache.set(colour, Array.from(ctx.getImageData(0, 0, 1, 1).data))
        }
        return cache.get(colour)!
    }
    // Every role the value matches, not the first: two roles can share a value (`ALIASES`).
    const roleOf = (colour: string): string | null => {
        const [r, g, b, a] = bytes(colour)
        if (a === 0) return null
        const matched = Object.entries(roles)
            .filter(([, [tr, tg, tb]]) => Math.abs(r - tr) <= 2 && Math.abs(g - tg) <= 2 && Math.abs(b - tb) <= 2)
            .map(([name]) => name)
        return matched.length === 0 ? null : matched.join('|')
    }
    const colours = /(rgba?|color|oklab|oklch|lab|lch|hsla?)\([^)]*\)/g
    const describe = (el: Element) => {
        const data = Array.from(el.attributes).filter(a => a.name.startsWith('data-') || a.name === 'role')
            .map(a => `${a.name}${a.value ? `=${a.value}` : ''}`).join(' ')
        const text = (el.textContent ?? '').trim().slice(0, 24)
        return `<${el.tagName.toLowerCase()} ${data}>${text}`
    }
    const found: { role: string, property: string, element: string, allowed: boolean }[] = []
    for (const el of Array.from(document.querySelectorAll('*'))) {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        const paints: [string, string][] = [['background-color', cs.backgroundColor]]
        const ownText = Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '')
        if (ownText) paints.push(['color', cs.color])
        if (ownText && cs.textDecorationLine !== 'none') paints.push(['text-decoration-color', cs.textDecorationColor])
        for (const side of ['top', 'right', 'bottom', 'left'] as const) {
            const style = cs.getPropertyValue(`border-${side}-style`)
            if (style !== 'none' && parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0) {
                paints.push([`border-${side}-color`, cs.getPropertyValue(`border-${side}-color`)])
            }
        }
        if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) paints.push(['outline-color', cs.outlineColor])
        if (cs.boxShadow !== 'none') for (const m of cs.boxShadow.match(colours) ?? []) paints.push(['box-shadow', m])
        if (el instanceof SVGGeometryElement) {
            if (cs.fill !== 'none') paints.push(['fill', cs.fill])
            if (cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0) paints.push(['stroke', cs.stroke])
        }
        for (const [property, value] of paints) {
            const role = roleOf(value)
            // Allowed where any of the roles it matches is.
            const where = role?.split('|').map(r => (allowed as Record<string, string>)[r]).join(', ')
            if (role !== null) found.push({ role, property, element: describe(el), allowed: el.closest(where!) !== null })
        }
    }
    return found
}, {
    roles: Object.fromEntries(ROLES.map(r => [r, rgbBytes(r)])),
    allowed: ALLOWED,
}) as Promise<Finding[]>

/** Nothing on the page wears a role colour where its role does not reach. */
const expectRolesKept = async (page: Page, state: string) => {
    const findings = await scan(page)
    const misplaced = findings.filter(f => !f.allowed).map(f => `${f.role} as ${f.property} on ${f.element}`)
    expect(misplaced, `in ${state}`).toEqual([])
    const text = await foregrounds(page)
    const unreadable = text.filter(t => !t.ok).map(t =>
        `${t.element}: ${t.colour} on ${t.surface}, ${t.ratio.toFixed(2)}:1, not ${t.expected}`)
    expect(unreadable, `text on the chrome's surfaces, in ${state}`).toEqual([])
    return findings
}

/**
 * The foreground each text is promised on the chrome's opaque surfaces (P1-4; codex at row
 * 10's review; by role since UI row 3, codex at its contract's review).
 *
 * Where a role colour appears says nothing about whether the text on it can be read: "Play
 * today" back in white would keep every assertion above, at 3.05:1. So every piece of text on
 * the page is read against its nearest element, itself or an ancestor, whose computed
 * background is not fully transparent. Where that background is one of `SURFACES`, the text
 * must be **exactly** the token it is expected to be, and clear 4.5:1 against the background
 * as the browser computes both. Contrast alone never passes a text: Reset in `ink` clears
 * 4.5:1 on the surface, and is still wrong.
 *
 * **The expected token is chosen by role as well as background** (UI row 3). One foreground per
 * background would have rejected Reset, "Solved!" and the tutorial's note, which are rightly
 * not `ink` on the `surface`. In order:
 *   1. a line target's state, or the nearest text-colour utility, on the text or an ancestor
 *      up to its background;
 *   2. else the nearest control's variant, in its state: its ink, a pressed toggle's ink, or a
 *      disabled control's;
 *   3. else the background's default.
 * And each background allows a closed set: a text whose expected token is not among them
 * fails, however it reads.
 *
 * What it is not (codex, row 10 acceptance): a measure of the colour actually painted behind
 * every text element. Translucent layers are not composited, and a disabled control's opacity
 * is not applied: its tokens are read, as `tests/contrast.test.ts` pins them.
 */
const SURFACES = {
    accent: { fallback: 'onAccent', allowed: ['onAccent'] },
    // The satisfied line's pill (UI row 4): its number, and nothing else.
    success: { fallback: 'onSuccess', allowed: ['onSuccess'] },
    // `lineNeutral` too: the tutorial's practice board puts its line targets on its card.
    surface: { fallback: 'ink', allowed: ['ink', 'inkMuted', 'success', 'problem', 'lineNeutral'] },
} as const satisfies Record<string, { fallback: Token, allowed: readonly Token[] }>
type Surface = keyof typeof SURFACES

/** The text-colour utilities a text may carry, and the token each names. */
const TEXT_UTILITIES: Record<string, Token> = {
    'text-ink': 'ink', 'text-ink-muted': 'inkMuted', 'text-success': 'success', 'text-problem': 'problem',
}

/**
 * A line target's colour is its state's (`app/dominoFill/lineLabel.ts`), but on the satisfied
 * pill, whose number is `onSuccess` (UI row 4).
 */
const LINE_STATES: Record<string, Token> = { neutral: 'lineNeutral', reached: 'success', satisfied: 'success', over: 'problem' }

/** Each variant's ink, by state: the variant table's, read here so the page needn't import it. */
const VARIANT_INKS = Object.fromEntries(Object.entries(CONTROL).map(([name, c]) => [name, {
    rest: c.ink, pressed: 'pressed' in c && c.pressed ? c.pressed.ink : null,
    disabled: 'ink' in c.disabled ? c.disabled.ink : null,
}]))

type Foreground = { element: string, surface: string, expected: string, colour: string, ratio: number, ok: boolean }

const foregrounds = (page: Page) => page.evaluate(({ surfaces, utilities, lines, inks, tokens }) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgba = (colour: string) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000000'
        ctx.fillStyle = colour
        ctx.fillRect(0, 0, 1, 1)
        return Array.from(ctx.getImageData(0, 0, 1, 1).data)
    }
    const same = (a: number[], b: number[]) => [0, 1, 2].every(i => Math.abs(a[i] - b[i]) <= 2)
    const luminance = ([r, g, b]: number[]) => [r, g, b].map(v => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
    const contrast = (a: number[], b: number[]) => {
        const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
        return (x + 0.05) / (y + 0.05)
    }
    /** The token a text is expected to be: by utility, then by variant and state, then none. */
    const byRole = (el: Element, behind: Element): string | null => {
        for (let at: Element | null = el; at !== null; at = at.parentElement) {
            if (at.getAttribute('data-label-pill') === 'filled') return 'onSuccess'
            const line = at.getAttribute('data-line-state')
            if (line !== null && line in lines) return lines[line]
            const utility = Array.from(at.classList).find(c => c in utilities)
            if (utility) return utilities[utility]
            const variant = Array.from(at.classList).find(c => c.startsWith('control-'))?.slice('control-'.length)
            if (variant && variant in inks) {
                const ink = inks[variant]
                if ((at as HTMLButtonElement).disabled && ink.disabled) return ink.disabled
                if (at.getAttribute('aria-pressed') === 'true' && ink.pressed) return ink.pressed
                if (ink.rest) return ink.rest
            }
            if (at === behind) break
        }
        return null
    }
    const out: { element: string, surface: string, expected: string, colour: string, ratio: number, ok: boolean }[] = []
    for (const el of Array.from(document.querySelectorAll('*'))) {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') continue
        const ownText = Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '')
        if (!ownText) continue
        // The surface actually behind the text: the nearest painted background.
        let behind: Element | null = el
        while (behind !== null && rgba(getComputedStyle(behind).backgroundColor)[3] === 0) behind = behind.parentElement
        if (behind === null) continue
        const surfaceBytes = rgba(getComputedStyle(behind).backgroundColor)
        // The accent first: in light, `surface` and `onAccent` are both white.
        const surface = Object.keys(surfaces).find(s => same(surfaceBytes, tokens[s]))
        if (surface === undefined) continue
        const { fallback, allowed } = (surfaces as Record<string, { fallback: string, allowed: readonly string[] }>)[surface]
        const expected = byRole(el, behind) ?? fallback
        const colour = rgba(cs.color)
        const ratio = contrast(colour, surfaceBytes)
        out.push({
            element: `<${el.tagName.toLowerCase()}>${(el.textContent ?? '').trim().slice(0, 24)}`,
            surface, expected, colour: `rgb(${colour.slice(0, 3).join(', ')})`, ratio,
            ok: allowed.includes(expected) && same(colour, tokens[expected]) && ratio >= 4.5,
        })
    }
    return out
}, {
    surfaces: SURFACES, utilities: TEXT_UTILITIES, lines: LINE_STATES, inks: VARIANT_INKS,
    tokens: Object.fromEntries((['accent', 'surface', 'ink', 'inkMuted', 'onAccent', 'success', 'onSuccess', 'problem', 'lineNeutral'] as const).map(t => [t, rgbBytes(t)])),
}) as Promise<Foreground[]>

/** The role colours one element paints, as `property: role`. */
const rolesOn = (locator: Locator) => locator.evaluate((el, roles) => {
    const ctx = document.createElement('canvas').getContext('2d')!
    // As the scan reads it: every role the value matches, joined by `|`.
    const roleOf = (colour: string) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000000'
        ctx.fillStyle = colour
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = Array.from(ctx.getImageData(0, 0, 1, 1).data)
        if (a === 0) return null
        const matched = Object.entries(roles).filter(([, [tr, tg, tb]]) =>
            Math.abs(r - tr) <= 2 && Math.abs(g - tg) <= 2 && Math.abs(b - tb) <= 2).map(([name]) => name)
        return matched.length === 0 ? null : matched.join('|')
    }
    const cs = getComputedStyle(el)
    const out: Record<string, string> = {}
    const put = (property: string, value: string) => { const role = roleOf(value); if (role) out[property] = role }
    put('background', cs.backgroundColor)
    put('color', cs.color)
    // An edge (P2-2's caution variant is `problem` as one), read from one side: no control
    // has sides of different colours.
    if (cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0) put('border', cs.borderTopColor)
    if (cs.outlineStyle !== 'none') put('outline', cs.outlineColor)
    for (const m of cs.boxShadow.match(/(rgba?|color|oklab|oklch)\([^)]*\)/g) ?? []) put('ring', m)
    if (el instanceof SVGGeometryElement) { put('fill', cs.fill); put('stroke', cs.stroke) }
    return out
}, Object.fromEntries(ROLES.map(r => [r, rgbBytes(r)])))

const bytes = (token: Token) => `rgb(${rgbBytes(token).join(', ')})`

/**
 * The named text is on `surface`, read as `token` -- the token its role calls for there -- and
 * readable, and present: the positive cases, so the check can't pass by finding nothing.
 */
const expectForeground = async (page: Page, text: string, surface: Surface, token: Token) => {
    const found = (await foregrounds(page)).filter(t => t.element.endsWith(`>${text}`) && t.surface === surface)
    expect(found.length, `"${text}" is not on the ${surface}`).toBeGreaterThan(0)
    for (const t of found) {
        expect(t.expected, `"${text}" on the ${surface}: the token its role calls for`).toBe(token)
        expect(t.colour, `"${text}" on the ${surface}`).toBe(bytes(token))
        expect(t.ratio, `"${text}" on the ${surface}`).toBeGreaterThanOrEqual(4.5)
        expect(t.ok, `"${text}" on the ${surface}`).toBe(true)
    }
}

test.describe('on the component sheet, where every state is on screen at once', () => {
    test.use({ baseURL: VISUAL_URL })

    test.beforeEach(async ({ page }) => {
        await page.goto('/visual?cell=53')
        await expect(page.locator('main[data-sheet]')).toBeVisible()
        await waitForRest(page, 'main')
        await page.mouse.move(0, 0)
    })

    test('no role colour appears outside its role, at rest or under the pointer', async ({ page }) => {
        const atRest = await expectRolesKept(page, 'the sheet at rest')
        // Every role is on the sheet somewhere, so "outside its role" was checked against
        // something rather than against a page with no colour on it. A shared value counts
        // for each role it matches.
        expect([...new Set(atRest.flatMap(f => f.role.split('|')))].sort()).toEqual([...ROLES].sort())

        const buttons = page.locator('main button:not([disabled])')
        const count = await buttons.count()
        expect(count).toBeGreaterThan(10)
        for (let i = 0; i < count; i++) {
            const button = buttons.nth(i)
            // Waited out since P1-6 (row 12): a hover colour is a CSS transition now, and a
            // colour read on its way is between tokens, so it would be matched to no role
            // at all -- a misplaced accent read mid-fade would pass. The level arrow's hover
            // scale is CSS too, so it is a finished transition, not a `motion` style.
            await button.hover()
            await waitForRest(page, 'main')
            await expectRolesKept(page, `the sheet, hovering ${await button.innerText() || await button.getAttribute('aria-label')}`)
        }
    })

    test('each control carries what its state calls for', async ({ page }) => {
        // The difficulty selector: the accent when selected, held down with no edge (UI row 3;
        // ringed in its edge until then), and nothing of the accent otherwise but the edge a
        // raised control turns under the pointer. Since P1-6 (row 12) that is every toggle's
        // pressed state, read from `aria-pressed`, and Sound is the other toggle: pressed while
        // the sound is on, so pressed on this sheet. Its text is `onAccent` there: the reader
        // knows a pressed toggle's state (codex).
        const sound = page.locator('[data-mute]')
        await expect(sound).toHaveAttribute('aria-pressed', 'true')
        expect(await rolesOn(sound)).toEqual({ background: ACCENT })
        await expectForeground(page, await sound.innerText(), 'accent', 'onAccent')
        const selected = page.locator('[data-difficulty][data-selected]')
        await expect(selected).toHaveCount(1)
        expect(await rolesOn(selected)).toEqual({ background: ACCENT })
        await expectForeground(page, await selected.innerText(), 'accent', 'onAccent')
        for (const other of await page.locator('[data-difficulty]:not([data-selected])').all()) {
            expect(await rolesOn(other)).toEqual({})
            await expectForeground(page, await other.innerText(), 'surface', 'ink')
            await other.hover()
            await waitForRest(page, 'main')
            expect(await rolesOn(other), 'under the pointer, the edge, and no fill').toEqual({ ring: 'accentEdge' })
        }
        await page.mouse.move(0, 0)

        // The level arrows: the accent, filled and outlined, enabled or not.
        for (const arrow of await page.locator('[data-level] path').all()) {
            expect(await rolesOn(arrow)).toMatchObject({ fill: ACCENT, stroke: 'accentEdge' })
        }

        /*
         * The variants (P2-2, row 14; raised in UI row 3). A raised control carries no role at
         * rest, enabled or disabled; under the pointer its edge is the accent's edge, and the
         * accent's fill is its only while pressed, which `e2e/controlVariants.spec.ts` holds.
         * `Check` is the primary, the accent's surface on the accent's edge, ringed in it too
         * under the pointer; `Reset` is `problem`'s text, and only that.
         */
        const hovered = async (control: Locator) => {
            await control.hover()
            await waitForRest(page, 'main')
            const roles = await rolesOn(control)
            await page.mouse.move(0, 0)
            await waitForRest(page, 'main')
            return roles
        }
        for (const control of await page.locator('[data-hint], [data-undo], [data-open-archive]').all()) {
            expect(await rolesOn(control)).toEqual({})
            if (await control.isEnabled()) expect(await hovered(control)).toEqual({ ring: 'accentEdge' })
        }
        await expect(page.locator('[data-undo]')).toBeDisabled()
        await expect(page.locator('[data-hint]')).toHaveCSS('background-color', bytes('surface'))
        await expectForeground(page, 'Hint', 'surface', 'ink')

        const check = page.locator('[data-check]')
        expect(await rolesOn(check)).toEqual({ background: ACCENT, ring: 'accentEdge' })
        expect(await hovered(check)).toEqual({ background: ACCENT, ring: 'accentEdge' })
        await expectForeground(page, 'Check', 'accent', 'onAccent')

        // A positive case codex asked for: Reset is `problem` on the surface, and the reader
        // expects exactly that, so `ink` there would fail though it reads.
        const reset = page.locator('[data-reset]')
        expect(await rolesOn(reset)).toEqual({ color: 'problem' })
        expect(await hovered(reset)).toEqual({ color: 'problem', ring: 'accentEdge' })
        await expectForeground(page, 'Reset', 'surface', 'problem')

        // The completion card's "Solved!" is the solved state, so `success`, and nothing else
        // on the card is (P2-3, row 15: the card was a `success` surface until then). Its
        // buttons are chrome, raised controls, which carry no role at rest; the accent's edge
        // under the pointer.
        const card = page.locator('[data-completion-card]')
        expect(await rolesOn(card)).toEqual({})
        expect(await rolesOn(card.locator('[data-completion-message]'))).toEqual({ color: 'success' })
        await expectForeground(page, 'Solved!', 'surface', 'success')
        expect(await rolesOn(card.locator('[data-completion-detail]'))).toEqual({})
        for (const button of await card.locator('button').all()) {
            // The card moves focus to its first action as it mounts, and that ring is the
            // accent's edge like every control's since P2-3; it was the card's own white.
            const ring = await button.evaluate(el => el.matches(':focus-visible')) ? { outline: 'accentEdge' } : {}
            expect(await rolesOn(button)).toEqual(ring)
            expect(await hovered(button)).toEqual({ ...ring, ring: 'accentEdge' })
            await expectForeground(page, await button.innerText(), 'surface', 'ink')
        }

        // The target labels, one per state, each in the specimen that exists to show it (the
        // hint's 2-by-2 board has a 0 row, reached from the start, and the label fixtures hold
        // every state). The label's colour is its tie's; the shapes are the pill and the bar
        // (UI row 4): the satisfied pill `success` with `onSuccess` text, which is no role, the
        // over pill ringed in `problem`, and the reached number and its bar in `success`.
        const label = (specimen: string, state: string) => page.locator(`[data-specimen="${specimen}"] [data-line-state="${state}"]`)
        expect(await rolesOn(label('target-satisfied', 'satisfied'))).toEqual({ color: 'success' })
        expect(await rolesOn(label('target-satisfied', 'satisfied').locator('[data-label-pill]'))).toEqual({ background: 'success' })
        await expectForeground(page, '0', 'success', 'onSuccess')
        expect(await rolesOn(label('target-over', 'over'))).toEqual({ color: 'problem' })
        expect(await rolesOn(label('target-over', 'over').locator('[data-label-pill]'))).toEqual({ color: 'problem', outline: 'problem' })
        expect(await rolesOn(label('target-reached', 'reached'))).toEqual({ color: 'success' })
        expect(await rolesOn(label('target-reached', 'reached').locator('[data-label-bar]'))).toEqual({ background: 'success', color: 'success' })
        for (const neutral of await page.locator('[data-line-state="neutral"]').all()) {
            expect(await rolesOn(neutral)).toEqual({})
        }

        // The hinted square, and only it: its diamond since P1-5 (row 11), an outline before.
        // The accent's value since UI row 4, so it reads as both; the sentinel proves `hint`.
        expect(await rolesOn(page.locator('[data-hinted] [data-diamond]'))).toEqual({ fill: ACCENT })
    })

    test('the role values are distinct, but for the aliases declared (UI row 4)', () => {
        // A coincidence nobody declared -- `success` moved onto `problem`'s value, say -- would
        // otherwise merge two meanings silently: every finding of one would read as both.
        const same = (a: Role, b: Role) => rgbBytes(a).every((v, i) => Math.abs(v - rgbBytes(b)[i]) <= 2)
        const shared = ROLES.flatMap((a, i) => ROLES.slice(i + 1).filter(b => same(a, b)).map(b => `${a}|${b}`))
        expect(shared).toEqual(ALIASES.map(pair => pair.join('|')))
    })
})

test.describe('on the real page, in the states the sheet does not hold', () => {
    test('the tutorial\'s secondary note is `inkMuted` on its card, and read as that', async ({ page }) => {
        // The third of codex's positive cases: muted text, a colour since UI row 3 where it was
        // an opacity, expected by its utility and not taken for the card's default `ink`.
        await page.goto('/')
        await expect(page.getByRole('button', { name: 'Got it!' })).toBeVisible()
        await expectForeground(page, 'Tapping a square places ', 'surface', 'inkMuted')
        await expectRolesKept(page, 'the tutorial open')
    })

    test('the board\'s focus ring is the accent\'s edge', async ({ page }) => {
        await openBoard(page)
        await page.keyboard.press('Tab')
        const grid = page.locator('[role="grid"]')
        await grid.evaluate(el => (el as HTMLElement).focus())
        expect(await grid.evaluate(el => el.matches(':focus-visible')), 'the ring is not showing').toBe(true)
        expect(await rolesOn(grid)).toEqual({ ring: 'accentEdge' })
        await expectRolesKept(page, 'the board focused by keyboard')
    })

    test('a hint marks its square, and a wrong position is a problem', async ({ page }) => {
        await openBoard(page)
        await page.locator('[data-hint]').click()
        await expect(page.locator('[data-hinted]')).toHaveCount(1)
        await expectRolesKept(page, 'a hint showing')

        // A legal placement that is not part of the solution, then Check.
        const solution = await solutionFor(page)
        const inSolution = new Set(solution.map(({ from, to }) => `${from[0]},${from[1]}-${to[0]},${to[1]}`))
        const n = Math.sqrt(await page.locator('[data-cell]').count())
        const rocks = new Set(await page.locator('[data-piece="rock"]').evaluateAll(els => els.map(el => el.getAttribute('data-at')!)))
        let move: [[number, number], [number, number]] | null = null
        for (let i = 0; i + 1 < n && move === null; i++) {
            for (let j = 0; j < n && move === null; j++) {
                if (rocks.has(`${i},${j}`) || rocks.has(`${i + 1},${j}`) || inSolution.has(`${i},${j}-${i + 1},${j}`)) continue
                move = [[i, j], [i + 1, j]]
            }
        }
        expect(move, 'every legal vertical placement is part of the solution').not.toBeNull()
        await drag(page, move![0], move![1])
        await page.locator('[data-check]').click()
        await expect(page.locator('[data-advice-kind]')).toHaveAttribute('data-advice-kind', 'wrong')
        expect(await rolesOn(page.locator('[data-advice] .text-problem'))).toEqual({ color: 'problem' })
        await expectRolesKept(page, 'a problem reported')
    })

    test('a refused move is a problem: its cross, and its reason in the strip', async ({ page }) => {
        await openBoard(page)
        const rock = await page.locator('[data-piece="rock"]').first().getAttribute('data-at')
        await page.locator(`[data-cell="${rock}"]`).focus()
        await page.keyboard.press(' ')
        await expect(page.locator('[data-refusal-reason]')).toHaveText('That square is a rock.')
        expect(await rolesOn(page.locator('[data-refusal-reason]'))).toEqual({ color: 'problem' })
        await expectRolesKept(page, 'a refusal showing')
    })

    test('the archive: its current day is the accent\'s edge, its error is a problem', async ({ page }) => {
        // A day in the corpus's second month, so there is a month before it to page to.
        await page.addInitScript(onDate, Date.parse('2026-10-15T10:00:00Z'))
        await openBoard(page)
        await page.locator('[data-open-archive]').click()
        await expect(page.locator('[data-archive]')).toBeVisible()
        const current = page.locator('[data-archive-day][aria-current="date"]')
        await expect(current).toHaveCount(1)
        expect(await rolesOn(current)).toEqual({ ring: 'accentEdge' })
        await expectRolesKept(page, 'the archive open')

        // Every other month's puzzles refuse to load, so paging back reports an error.
        const month = await page.locator('[data-archive-month]').innerText()
        await page.route(url => url.pathname.startsWith('/puzzles/') && !url.pathname.includes(month), route => route.abort())
        await page.locator('[data-archive-prev]').click()
        const alert = page.locator('[data-archive] [role="alert"]')
        await expect(alert).toBeVisible()
        expect(await rolesOn(alert)).toEqual({ color: 'problem' })
        await expectRolesKept(page, 'the archive reporting an error')
    })

    test('the day banner\'s action is the accent', async ({ page }) => {
        await openBoard(page)
        await page.locator('[data-open-archive]').click()
        // An earlier day: the first of this month, or of the last one on the 1st.
        if (await page.locator('[data-archive-day]').count() < 2) await page.locator('[data-archive-prev]').click()
        await expect(page.locator('[data-archive-day]').nth(1)).toBeVisible()
        await page.locator('[data-archive-day]').first().click()
        const action = page.locator('[data-go-to-today]')
        await expect(action).toBeVisible()
        // The primary: the accent, on the accent's edge (UI row 3).
        expect(await rolesOn(action)).toEqual({ background: ACCENT, ring: 'accentEdge' })
        await expectForeground(page, 'Play today', 'accent', 'onAccent')
        await expectRolesKept(page, 'an earlier day, with the banner')
    })

    test('the tutorial\'s action is the accent, once there is something to accept', async ({ page }) => {
        await page.goto('/')
        const gotIt = page.getByRole('button', { name: 'Got it!' })
        await expect(gotIt).toBeVisible()
        /*
         * Disabled until the tutorial's board is solved, and a disabled primary gives the
         * accent up (P2-2, row 14): the colour that means "press" is not on a control that
         * cannot be pressed. Row 10 read it here, disabled, in the accent.
         */
        await expect(gotIt).toBeDisabled()
        expect(await rolesOn(gotIt)).toEqual({})
        await expectRolesKept(page, 'the tutorial')

        // Solved with two upright dominoes: 1 and 1 across the top row, 0 and 0 below.
        const tutorial = page.locator('.fixed.inset-0').first()
        for (const column of [0, 1]) {
            await tutorial.locator(`[data-cell="0,${column}"]`).hover()
            await page.mouse.down()
            await tutorial.locator(`[data-cell="1,${column}"]`).hover()
            await page.mouse.up()
        }
        await expect(gotIt).toBeEnabled()
        await page.mouse.move(0, 0)
        await waitForRest(page)
        // The primary: the accent, on the accent's edge (UI row 3).
        expect(await rolesOn(gotIt)).toEqual({ background: ACCENT, ring: 'accentEdge' })
        await expectForeground(page, 'Got it!', 'accent', 'onAccent')
        await expectRolesKept(page, 'the tutorial, solved')
    })
})
