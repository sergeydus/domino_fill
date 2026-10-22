import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { LATE_IN_A_MONTH, pinDay } from './calendar'
import { PALETTE, PALETTE_DARK, type Theme, type Token } from '../app/palette'
import { GROUND, GROUND_DARK } from '../app/siteMetadata'
import { THEME_KEY } from '../app/themeScript'

/**
 * Two themes, following the phone, with the player's choice over it (UI row 1).
 *
 * Until this row the game looked the same however the system was set (spec P2-3, row 20c),
 * and this file asserted exactly that. P2-3 had removed a half-made dark mode that turned the
 * advice strip into near-white text on the light page, **1.05:1**; so the first thing every
 * case here checks is still that the text the game gives is readable on the ground it is
 * drawn on, as the browser computes both.
 *
 * Row 1's dark theme is the chrome's only: the board's tokens are the light ones until row 4,
 * so a cell is the same colour in both themes, and these tests say so.
 *
 * Every case that reads the board pins its day, as AGENTS.md requires: the cell and the line
 * read here are the pinned puzzle's.
 */

const THEMES: Record<Theme, Readonly<Record<Token, string>>> = { light: PALETTE, dark: PALETTE_DARK }

type Rgb = [number, number, number]

/**
 * A computed colour, read strictly. An earlier parser here took the first three numbers of
 * anything, so a transparent background read as black; anything but an opaque `rgb()` is now
 * an error that quotes the raw value.
 */
const rgb = (value: string): Rgb => {
    const m = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value)
    if (m === null) throw new Error(`not an opaque rgb() colour: "${value}"`)
    return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** A `#rrggbb` token's bytes, in either theme. */
const bytes = (theme: Theme, token: Token): Rgb => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(THEMES[theme][token])
    if (m === null) throw new Error(`${theme} ${token} is not #rrggbb`)
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

/** WCAG relative luminance, and the contrast ratio built from it. */
const luminance = ([r, g, b]: Rgb) => {
    const linear = [r, g, b].map(v => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

const contrast = (a: Rgb, b: Rgb) => {
    const [x, y] = [luminance(a), luminance(b)]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** The colours that decide whether the game is readable, as the browser computes them, raw. */
const computed = (page: Page) => page.evaluate(() => {
    const of = (selector: string, property: string) => {
        const el = document.querySelector(selector)
        return el ? getComputedStyle(el).getPropertyValue(property) : 'MISSING'
    }
    // The page's own ground, found by role rather than by tag position: Next inserts its
    // route announcer as a div in <body>, which an earlier probe matched by mistake.
    const shell = document.querySelector('[data-board-shell]')!.closest('div.min-h-svh')!
    return {
        ground: getComputedStyle(shell).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        advice: of('[data-advice]', 'color'),
        cell: of('[data-cell="0,0"]', 'background-color'),
        target: of('[data-row-label="0"]', 'color'),
        targetState: document.querySelector('[data-row-label="0"]')?.getAttribute('data-line-state') ?? 'MISSING',
        control: of('[data-undo]', 'background-color'),
        scheme: getComputedStyle(document.documentElement).colorScheme,
        attribute: document.documentElement.getAttribute('data-theme'),
    }
})

type Computed = Awaited<ReturnType<typeof computed>>

/**
 * What the board's page computes in `theme`: the chrome in that theme's tokens, and the cell
 * in the light one's, which row 1 leaves on the board in both.
 */
const painted = (c: Computed) => ({
    ground: rgb(c.ground), body: rgb(c.body), advice: rgb(c.advice), cell: rgb(c.cell),
    target: rgb(c.target), control: rgb(c.control),
})
const expected = (theme: Theme) => ({
    ground: bytes(theme, 'ground'), body: bytes(theme, 'ground'), advice: bytes(theme, 'ink'),
    cell: bytes('light', 'checkerLight'), target: bytes(theme, 'lineNeutral'),
    control: bytes(theme, 'controlSurface'),
})

/** The pinned day's board, in a scheme, with a stored choice or none. */
const open = async (page: Page, scheme: Theme, stored?: string) => {
    await page.emulateMedia({ colorScheme: scheme })
    if (stored !== undefined) {
        await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, stored])
    }
    await pinDay(page, LATE_IN_A_MONTH)
    await openBoard(page)
    // The line read below is short of its target on the pinned day, so neutral: the label
    // colour asserted is `lineNeutral`'s.
    await expect(page.locator('[data-row-label="0"]')).toHaveAttribute('data-line-state', 'neutral')
}

test.describe('with nothing stored, the phone decides', () => {
    test('1. with the system light, the page computes the light tokens', async ({ page }) => {
        await open(page, 'light')
        const c = await computed(page)
        expect(painted(c)).toEqual(expected('light'))
        expect(c.attribute).toBeNull()
        expect(c.scheme, 'the page says it can be either').toBe('light dark')
    })

    test('2. with the system dark, the chrome computes the dark tokens, and the cell its light one', async ({ page }) => {
        await open(page, 'dark')
        const c = await computed(page)
        expect(painted(c)).toEqual(expected('dark'))
        // The dark chrome is not the light one: the test above would pass on one theme.
        expect(rgb(c.ground)).not.toEqual(bytes('light', 'ground'))
        expect(c.attribute).toBeNull()
    })

    for (const scheme of ['light', 'dark'] as const) {
        test(`3. with the system ${scheme}, the advice and a line's target clear 4.5:1 on the ground`, async ({ page }) => {
            // The regression P2-3 removed the first dark mode for: 1.05:1, measured.
            await open(page, scheme)
            const c = await computed(page)
            expect(contrast(rgb(c.advice), rgb(c.ground)), `advice ${c.advice} on ${c.ground}`).toBeGreaterThanOrEqual(4.5)
            expect(contrast(rgb(c.target), rgb(c.ground)), `target ${c.target} on ${c.ground}`).toBeGreaterThanOrEqual(4.5)
        })
    }
})

test.describe('a stored choice', () => {
    for (const [stored, scheme] of [['light', 'dark'], ['dark', 'light']] as const) {
        test(`4. "${stored}" stored under a ${scheme} system renders ${stored}`, async ({ page }) => {
            await open(page, scheme, stored)
            const c = await computed(page)
            expect(painted(c)).toEqual(expected(stored))
            expect(c.attribute).toBe(stored)
            expect(c.scheme).toBe(stored)
        })
    }

    for (const scheme of ['light', 'dark'] as const) {
        test(`5. "sepia" stored follows a ${scheme} system, and marks nothing`, async ({ page }) => {
            // Only the two names are accepted. A `data-theme="sepia"` would also follow the
            // system under these selectors, so the attribute's absence is what this checks.
            await open(page, scheme, 'sepia')
            const c = await computed(page)
            expect(painted(c)).toEqual(expected(scheme))
            expect(c.attribute).toBeNull()
        })
    }
})

/**
 * The page as it is before any of the app's code runs: every script under `/_next/static/`
 * aborted, the stylesheets and fonts left to load. What is drawn then is the first paint.
 */
const blockAppScripts = (page: Page) => page.route('**/_next/static/**', route =>
    route.request().resourceType() === 'script' ? route.abort() : route.continue())

const hydrated = (page: Page) =>
    page.evaluate(() => Object.keys(document.body).some(k => k.startsWith('__reactFiber')))

for (const [stored, scheme] of [['dark', 'light'], ['light', 'dark']] as const) {
    test(`6. the first paint is already "${stored}", stored under a ${scheme} system`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, stored])
        await blockAppScripts(page)
        await page.goto('/')

        // The conditions first: a stylesheet applied, and the app did not start.
        const raw = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
        expect(raw, 'a stylesheet has applied').not.toBe('rgba(0, 0, 0, 0)')
        expect(await hydrated(page), 'the app has not hydrated').toBe(false)

        expect(rgb(raw)).toEqual(bytes(stored, 'ground'))
    })
}

/**
 * The browser chrome's colour tags as they stand, and the colour the browser takes from them:
 * the first tag whose `media` matches.
 */
const themeColors = (page: Page) => page.evaluate(() => {
    const tags = [...document.querySelectorAll('meta[name="theme-color"]')]
    const applies = tags.find(t => window.matchMedia(t.getAttribute('media') ?? 'all').matches)
    return {
        served: tags.map(t => t.getAttribute('content')?.toLowerCase()),
        shown: applies?.getAttribute('content')?.toLowerCase() ?? 'NONE',
    }
})

/** Both tags as served: one per scheme, each that theme's ground, in that order. */
const SERVED = [GROUND, GROUND_DARK]

test.describe('7. the browser chrome\'s colour', () => {
    test('with nothing stored, one tag per scheme, and the phone\'s ground shown', async ({ page }) => {
        await page.goto('/')
        expect(await page.locator('meta[name="theme-color"]').evaluateAll(tags => tags.map(t => t.getAttribute('media'))))
            .toEqual(['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'])
        for (const [scheme, ground] of [['light', GROUND], ['dark', GROUND_DARK]] as const) {
            await page.emulateMedia({ colorScheme: scheme })
            expect(await themeColors(page), scheme).toEqual({ served: SERVED, shown: ground })
        }
    })

    /*
     * With a choice stored, the chosen ground is shown under either system scheme: the script
     * switches which tag applies, and leaves the tags' content as served -- rewriting it made
     * React add a third tag as it hydrated, which is why `served` is checked once it has.
     */
    for (const [stored, ground] of [['dark', GROUND_DARK], ['light', GROUND]] as const) {
        test(`with "${stored}" stored, its ground is shown before the app runs`, async ({ page }) => {
            await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, stored])
            await blockAppScripts(page)
            await page.goto('/')
            expect(await hydrated(page), 'the app has not hydrated').toBe(false)
            for (const scheme of ['light', 'dark'] as const) {
                await page.emulateMedia({ colorScheme: scheme })
                expect(await themeColors(page), `a ${scheme} system`).toEqual({ served: SERVED, shown: ground })
            }
        })

        test(`with "${stored}" stored, its ground is shown once the app has run, and the manifest stays light`, async ({ page, request }) => {
            await open(page, stored === 'dark' ? 'light' : 'dark', stored)
            expect(await hydrated(page)).toBe(true)
            for (const scheme of ['light', 'dark'] as const) {
                await page.emulateMedia({ colorScheme: scheme })
                expect(await themeColors(page), `a ${scheme} system`).toEqual({ served: SERVED, shown: ground })
            }

            // The manifest stays light whatever the page is: an installed app's splash screen
            // is drawn before the page can say which theme it is in.
            const href = await page.locator('link[rel="manifest"]').getAttribute('href')
            const manifest = await (await request.get(new URL(href!, page.url()).toString())).json()
            expect([manifest.theme_color, manifest.background_color]).toEqual([GROUND, GROUND])
        })
    }
})

test('8. on one page, the system going light, dark and light again moves the chrome each time', async ({ page }) => {
    /*
     * Not a reload: a phone that changes theme at sunset changes it under an open page. The
     * ground and a line's target follow each time; the cell, on the board, stays put.
     */
    await open(page, 'light')
    for (const scheme of ['light', 'dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        await expect.poll(async () => {
            const c = await computed(page)
            return { ground: rgb(c.ground), target: rgb(c.target), cell: rgb(c.cell) }
        }, `in ${scheme}`).toEqual({
            ground: bytes(scheme, 'ground'), target: bytes(scheme, 'lineNeutral'), cell: bytes('light', 'checkerLight'),
        })
    }
})
