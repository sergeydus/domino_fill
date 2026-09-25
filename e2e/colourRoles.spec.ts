import { test, expect, type Locator, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { onDate } from './calendar'
import { VISUAL_URL } from './server'
import { waitForRest } from './rest'
import { drag, solutionFor } from './play'
import { rgbBytes, type Token } from '../app/palette'

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

/** Where each role may appear: the closest ancestor (or the element) must match. */
const ALLOWED: Record<Role, string> = {
    // Interactive chrome: a control, or the board's own focus ring on the grid.
    accent: 'button, [role="grid"]',
    accentEdge: 'button, [role="grid"]',
    success: '[data-line-state="satisfied"], [data-completion-card]',
    // The advice strip only while it reports a problem (`adviceIsProblem`), not the strip.
    problem: '[data-line-state="over"], [data-advice-kind="wrong"], [data-advice-kind="unavailable"], [role="alert"]',
    hint: '[data-hinted]',
}

type Finding = { role: Role, property: string, element: string, allowed: boolean }

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
    const roleOf = (colour: string): string | null => {
        const [r, g, b, a] = bytes(colour)
        if (a === 0) return null
        for (const [name, [tr, tg, tb]] of Object.entries(roles)) {
            if (Math.abs(r - tr) <= 2 && Math.abs(g - tg) <= 2 && Math.abs(b - tb) <= 2) return name
        }
        return null
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
            if (role !== null) found.push({ role, property, element: describe(el), allowed: el.closest((allowed as Record<string, string>)[role]) !== null })
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
    return findings
}

/** The role colours one element paints, as `property: role`. */
const rolesOn = (locator: Locator) => locator.evaluate((el, roles) => {
    const ctx = document.createElement('canvas').getContext('2d')!
    const roleOf = (colour: string) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000000'
        ctx.fillStyle = colour
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = Array.from(ctx.getImageData(0, 0, 1, 1).data)
        if (a === 0) return null
        return Object.entries(roles).find(([, [tr, tg, tb]]) =>
            Math.abs(r - tr) <= 2 && Math.abs(g - tg) <= 2 && Math.abs(b - tb) <= 2)?.[0] ?? null
    }
    const cs = getComputedStyle(el)
    const out: Record<string, string> = {}
    const put = (property: string, value: string) => { const role = roleOf(value); if (role) out[property] = role }
    put('background', cs.backgroundColor)
    put('color', cs.color)
    if (cs.outlineStyle !== 'none') put('outline', cs.outlineColor)
    for (const m of cs.boxShadow.match(/(rgba?|color|oklab|oklch)\([^)]*\)/g) ?? []) put('ring', m)
    if (el instanceof SVGGeometryElement) { put('fill', cs.fill); put('stroke', cs.stroke) }
    return out
}, Object.fromEntries(ROLES.map(r => [r, rgbBytes(r)])))

const bytes = (token: Token) => `rgb(${rgbBytes(token).join(', ')})`

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
        // something rather than against a page with no colour on it.
        expect([...new Set(atRest.map(f => f.role))].sort()).toEqual([...ROLES].sort())

        const buttons = page.locator('main button:not([disabled])')
        const count = await buttons.count()
        expect(count).toBeGreaterThan(10)
        for (let i = 0; i < count; i++) {
            const button = buttons.nth(i)
            // No wait for rest: a hovered level arrow holds its `scale(1.2)`, which is not
            // rest, and every hover colour left is CSS, applied with the hover itself.
            await button.hover()
            await expectRolesKept(page, `the sheet, hovering ${await button.innerText() || await button.getAttribute('aria-label')}`)
        }
    })

    test('each control carries what its state calls for', async ({ page }) => {
        // The difficulty selector: the accent and its ring when selected, and nothing of
        // the accent otherwise -- not at rest, and no longer under the pointer.
        const selected = page.locator('[data-difficulty][data-selected]')
        await expect(selected).toHaveCount(1)
        expect(await rolesOn(selected)).toEqual({ background: 'accent', ring: 'accentEdge' })
        for (const other of await page.locator('[data-difficulty]:not([data-selected])').all()) {
            expect(await rolesOn(other)).toEqual({})
            await other.hover()
            await waitForRest(page, 'main')
            expect(await rolesOn(other), 'the accent on hover is gone').toEqual({})
        }
        await page.mouse.move(0, 0)

        // The level arrows: the accent, filled and outlined, enabled or not.
        for (const arrow of await page.locator('[data-level] path').all()) {
            expect(await rolesOn(arrow)).toMatchObject({ fill: 'accent', stroke: 'accentEdge' })
        }

        // The quiet controls carry no role at all, enabled, disabled or hovered.
        for (const control of await page.locator('[data-check], [data-hint], [data-undo], [data-reset], [data-open-archive], [data-mute]').all()) {
            expect(await rolesOn(control)).toEqual({})
            if (await control.isEnabled()) {
                await control.hover()
                expect(await rolesOn(control)).toEqual({})
            }
        }
        await expect(page.locator('[data-undo]')).toBeDisabled()
        await expect(page.locator('[data-check]')).toHaveCSS('background-color', bytes('controlSurface'))

        // The completion card is the solved state, so `success`; its buttons are chrome,
        // quiet at rest and the accent under the pointer.
        const card = page.locator('[data-completion-card]')
        expect(await rolesOn(card)).toEqual({ background: 'success' })
        for (const button of await card.locator('button').all()) {
            await page.mouse.move(0, 0)
            await waitForRest(page, 'main')
            expect(await rolesOn(button)).toEqual({})
            await button.hover()
            await waitForRest(page, 'main')
            expect(await rolesOn(button)).toEqual({ background: 'accent' })
        }

        // The target labels, one per state.
        expect(await rolesOn(page.locator('[data-line-state="satisfied"]'))).toEqual({ color: 'success' })
        expect(await rolesOn(page.locator('[data-line-state="over"]'))).toEqual({ color: 'problem', outline: 'problem' })
        for (const neutral of await page.locator('[data-line-state="neutral"]').all()) {
            expect(await rolesOn(neutral)).toEqual({})
        }

        // The hinted square, and only it.
        expect(await rolesOn(page.locator('[data-hinted] > div'))).toEqual({ outline: 'hint' })
    })
})

test.describe('on the real page, in the states the sheet does not hold', () => {
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
        expect(await rolesOn(action)).toEqual({ background: 'accent' })
        await expectRolesKept(page, 'an earlier day, with the banner')
    })

    test('the tutorial\'s action is the accent', async ({ page }) => {
        await page.goto('/')
        const gotIt = page.getByRole('button', { name: 'Got it!' })
        await expect(gotIt).toBeVisible()
        expect(await rolesOn(gotIt)).toEqual({ background: 'accent' })
        await expectRolesKept(page, 'the tutorial')
    })
})
