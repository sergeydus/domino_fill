import { test, expect, type Locator, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { LATE_IN_A_MONTH, pinDay } from './calendar'
import { VISUAL_URL } from './server'
import { TYPE, WEIGHTS, type Role, type Weight } from '../app/typography'

/**
 * Every text surface is one of the roles, in one family (graphics spec P2-1, row 13; in Nunito,
 * with each role's weight, since UI row 2).
 *
 * Asserted by computed style, as the spec asks, and over every element the browser finds
 * with text of its own that is on screen -- not a list of the surfaces someone remembered.
 * Each must compute to a role's size *and* line height together, and to the page's one
 * family. Then the surfaces the table names are checked against the role it names for them,
 * so "some role" cannot stand in for "the right one".
 *
 * The surfaces: the game page, with the advice strip speaking; the archive; the day banner;
 * the tutorial; the component sheet at both baseline sizes, which holds the completion card.
 *
 * **Weights are checked twice** (UI row 2). The computed number, against the role's; and the
 * drawing: a weight the page doesn't load still reports its number while drawing in the
 * nearest loaded face, so a difference that must show is measured as a difference in ink
 * (codex, at the row's review; `apart` below).
 */

type Text = { text: string, size: number, line: number, family: string, label: number | null, weight: number }

/** Every visible element with a non-blank text node of its own, as computed. */
const texts = (page: Page): Promise<Text[]> => page.evaluate(() => {
    const out: Text[] = []
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) continue
        const own = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '')
        if (own.length === 0 || !el.checkVisibility()) continue
        const cs = getComputedStyle(el)
        const shell = el.closest<HTMLElement>('[data-board-shell]')
        const labelFont = shell ? parseFloat(getComputedStyle(shell).getPropertyValue('--label-font')) : NaN
        out.push({
            text: own.map(n => n.textContent!.trim()).join(' ').slice(0, 40),
            size: parseFloat(cs.fontSize),
            line: parseFloat(cs.lineHeight),
            family: cs.fontFamily,
            label: Number.isNaN(labelFont) ? null : labelFont,
            weight: Number(cs.fontWeight),
        })
    }
    return out
})

/**
 * How a weight is seen to be drawn: by its ink. The question is whether a weight resolves to a
 * face of its own, which doesn't depend on the size, so the phrase is drawn on a canvas at one
 * large size and its inked pixels counted.
 *
 * Not its width at the text's own size, which was the first build. On Windows' Chromium
 * "Check" widens at every step (0.56px or more at 13px), but on the Ubuntu runner advances
 * snap to whole pixels, and "Check" at 15px measured the same width at 600 and 700, and at
 * 800 and 900 (CI run 39781269776). Some glyphs keep their width in any case: "6" is 9px at
 * 15px in all four weights (codex). Ink has no such rounding: measured on this host, "Check" at
 * 64px gains 14.5-20.3% at every step, against 0 for a weight drawn with a neighbour's face.
 */
const PROBE = 'Check'
const PROBE_PX = 64

/**
 * How much more ink `PROBE` takes at `heavier` than at `lighter`, in `family`'s first family:
 * 0.2 is 20%. Only the first: next/font's "Nunito Fallback" is `src: local(Arial)`, and on a
 * machine without Arial, CI's Ubuntu, loading the whole stack rejects with a NetworkError.
 */
const apart = (page: Page, family: string, lighter: number, heavier: number) =>
    page.evaluate(async ({ family, size, weights, text }) => {
        const ink: number[] = []
        for (const w of weights) {
            // Load the face first, or the first draw can be the fallback while it arrives.
            await document.fonts.load(`${w} ${size}px ${family}`)
            const canvas = document.createElement('canvas')
            canvas.width = size * 6
            canvas.height = size * 2
            const ctx = canvas.getContext('2d')!
            ctx.font = `${w} ${size}px ${family}`
            ctx.textBaseline = 'top'
            ctx.fillText(text, 4, 4)
            const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data
            let sum = 0
            for (let i = 3; i < alpha.length; i += 4) sum += alpha[i]
            ink.push(sum)
        }
        return ink[1] / ink[0] - 1
    }, { family: family.split(',')[0].trim(), size: PROBE_PX, weights: [lighter, heavier], text: PROBE })

/** The least gain in ink that counts as a face of its own: a quarter of the least measured. */
const DRAWN_APART = 0.05

/**
 * Every text's weight, as a number and as drawn: one the page loads, its role's own, or above
 * it; and where it is above -- emphasis, a pressed or primary control -- visibly so. Each role
 * that isn't body's weight is also visibly apart from body's 600.
 */
const expectWeights = async (page: Page, where: string, found: Text[]) => {
    const problems: string[] = []
    const roles = new Set<Role>()
    for (const t of found) {
        const role = roleOf(t)!
        roles.add(role)
        const own = TYPE[role].weight
        if (!WEIGHTS.includes(t.weight as Weight)) problems.push(`"${t.text}": ${t.weight}, a weight the page doesn't load`)
        else if (t.weight < own) problems.push(`"${t.text}": ${t.weight}, under ${role}'s ${own}`)
        else if (t.weight > own && await apart(page, t.family, own, t.weight) < DRAWN_APART) {
            problems.push(`"${t.text}": ${t.weight} draws like ${role}'s ${own}`)
        }
    }
    const family = found[0].family
    for (const role of roles) {
        const { weight } = TYPE[role]
        if (weight !== TYPE.body.weight && await apart(page, family, TYPE.body.weight, weight) < DRAWN_APART) {
            problems.push(`${role}'s ${weight} draws like body's ${TYPE.body.weight}`)
        }
    }
    expect(problems, `${where}: weights`).toEqual([])
}

/** One element's computed weight. */
const weightOf = (el: Locator) => el.evaluate(node => Number(getComputedStyle(node).fontWeight))

/** The role a computed size and line height are, or null. */
const roleOf = (t: Text): Role | null => {
    for (const [role, { size, lineHeight }] of Object.entries(TYPE) as [Role, typeof TYPE[Role]][]) {
        const px = typeof size === 'number' ? size : t.label
        if (px === null) continue
        if (Math.abs(t.size - px) < 0.01 && Math.abs(t.line - px * lineHeight) < 0.01) return role
    }
    return null
}

/** Every text on the page is a role, in the body's family, which is Nunito, at a weight it loads. */
const expectRoles = async (page: Page, where: string) => {
    const found = await texts(page)
    expect(found.length, `${where}: text was found`).toBeGreaterThan(0)
    const loose = found.filter(t => roleOf(t) === null).map(t => `"${t.text}": ${t.size}px / ${t.line}px`)
    expect(loose, `${where}: text in no role`).toEqual([])
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    expect(family).toMatch(/^Nunito, /)
    expect(family).not.toMatch(/Geist|Arial|Helvetica/)
    const strays = found.filter(t => t.family !== family).map(t => `"${t.text}": ${t.family}`)
    expect(strays, `${where}: text in another family`).toEqual([])
    await expectWeights(page, where, found)
    return found
}

/** The role one element's text computes to. */
const roleIn = async (el: Locator): Promise<Role | null> => {
    const t = await el.evaluate(node => {
        const cs = getComputedStyle(node)
        const shell = node.closest<HTMLElement>('[data-board-shell]')
        const labelFont = shell ? parseFloat(getComputedStyle(shell).getPropertyValue('--label-font')) : NaN
        return {
            text: '', size: parseFloat(cs.fontSize), line: parseFloat(cs.lineHeight), family: cs.fontFamily,
            label: Number.isNaN(labelFont) ? null : labelFont, weight: Number(cs.fontWeight),
        }
    })
    return roleOf(t)
}

/** Every visible button in `scope` is the control role, except any matching `except`. */
const expectControls = async (scope: Locator, except?: string) => {
    const buttons = await scope.locator(except ? `button:not(${except})` : 'button').all()
    let seen = 0
    for (const b of buttons) {
        if (!await b.isVisible()) continue
        seen++
        expect(await roleIn(b), `${await b.getAttribute('aria-label') ?? await b.innerText()}`).toBe('control')
    }
    expect(seen).toBeGreaterThan(0)
}

test('the probe phrase draws each loaded weight apart from its neighbours', async ({ page }) => {
    await openBoard(page)
    await page.evaluate(() => document.fonts.ready)
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    const steps: string[] = []
    for (const [lighter, heavier] of WEIGHTS.slice(0, -1).map((w, i) => [w, WEIGHTS[i + 1]])) {
        const gain = await apart(page, family, lighter, heavier)
        if (gain < DRAWN_APART) steps.push(`${lighter} to ${heavier} gains ${(gain * 100).toFixed(1)}% ink`)
    }
    // The drawing first: a face the page failed to load fails here, as a weight drawn like another.
    expect(steps, 'every step between loaded weights draws heavier').toEqual([])
    // Then the inventory: a loaded Nunito face for each of the four.
    const loaded = await page.evaluate(() => [...document.fonts]
        .filter(f => f.family.replace(/["']/g, '') === 'Nunito' && f.status === 'loaded').map(f => Number(f.weight)))
    expect([...new Set(loaded)].sort()).toEqual([...WEIGHTS])
})

test('the game page: labels, controls, the clock, and the advice strip with its emphasis', async ({ page }) => {
    // A rock and a free square from the board, so the day is pinned (AGENTS.md).
    await pinDay(page, LATE_IN_A_MONTH)
    await openBoard(page)

    /*
     * The advice strip's emphasis, 800 on body's 600, in the order the strip gives way: the
     * key guide shows only while nothing else holds the row, then a refusal's reason, then a
     * Check answer, which holds it until the board next acts.
     */
    const free = await page.locator('[data-cell]').evaluateAll(cells => {
        const last = Math.max(...cells.map(c => Number(c.getAttribute('data-cell')!.split(',')[1])))
        return cells.find(c => {
            const at = c.getAttribute('data-cell')!
            return Number(at.split(',')[1]) < last
                && !c.closest('[data-board-shell]')!.querySelector(`[data-piece][data-at="${at}"]`)
        })!.getAttribute('data-cell')
    })
    await page.locator(`[data-cell="${free}"]`).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('[data-key-guide] strong').first()).toBeVisible()
    for (const key of await page.locator('[data-key-guide] strong').all()) expect(await weightOf(key)).toBe(800)
    await expectRoles(page, 'the key guide showing')

    const rock = await page.locator('[data-piece="rock"]').first().getAttribute('data-at')
    await page.locator(`[data-cell="${rock}"]`).focus()
    await page.keyboard.press(' ')
    await expect(page.locator('[data-refusal-reason]')).toBeVisible()
    expect(await weightOf(page.locator('[data-refusal-reason]'))).toBe(800)
    await expectRoles(page, 'a refusal showing')

    await page.locator('[data-check]').click()
    await expect(page.locator('[data-advice] span')).toBeVisible()
    await expectRoles(page, 'the page')
    expect(await roleIn(page.locator('[role="timer"]'))).toBe('clock')
    expect(await weightOf(page.locator('[role="timer"]'))).toBe(900)
    expect(await weightOf(page.locator('[data-advice] span'))).toBe(600)

    for (const label of await page.locator('[data-col-label], [data-row-label]').all()) {
        expect(await roleIn(label)).toBe('boardLabel')
    }
    // And the label's size is the cell's fraction, not a constant that happens to match.
    const [cell, font] = await page.locator('[data-board-shell]').evaluate(shell => [
        shell.querySelector('[data-cell]')!.getBoundingClientRect().width,
        parseFloat(getComputedStyle(shell).getPropertyValue('--label-font')),
    ])
    expect(font).toBe(Math.round(cell * 0.5))
    for (const label of await page.locator('[data-col-label], [data-row-label]').all()) expect(await weightOf(label)).toBe(900)
    await expectControls(page.locator('body'))
    expect(await roleIn(page.locator('[data-advice]'))).toBe('body')

    // A control at rest, and one pressed: both the `control` role's 800 since UI row 3, which
    // tells a pressed toggle by its depth (`e2e/controlVariants.spec.ts`); 800 and 900, drawn
    // apart, until then (UI-SPEC §3.2, amended).
    const pressed = page.locator('[data-difficulty][aria-pressed="true"]')
    const atRest = page.locator('[data-difficulty][aria-pressed="false"]').first()
    expect([await weightOf(atRest), await weightOf(pressed)]).toEqual([800, 800])
})

test('the archive: its dates are meta, its words body, its buttons controls', async ({ page }) => {
    await openBoard(page)
    await page.locator('[data-open-archive]').click()
    const archive = page.locator('[data-archive]')
    await expect(archive.locator('[data-archive-day]').first()).toBeVisible()
    await expectRoles(page, 'the archive')
    expect(await roleIn(archive.locator('[data-archive-month]'))).toBe('body')
    for (const day of await archive.locator('[data-archive-day]').all()) expect(await roleIn(day)).toBe('meta')
    expect(await weightOf(archive.locator('[data-archive-day]').first())).toBe(700)
    // The month's name is body's emphasis, 800 on 600.
    expect(await weightOf(archive.locator('[data-archive-month]'))).toBe(800)
    await expectControls(archive, '[data-archive-day]')
})

test('the day banner is body, its action a control', async ({ page }) => {
    // A day with earlier days in its month: on the 1st this skipped (`pinDay`).
    await pinDay(page, LATE_IN_A_MONTH)
    await openBoard(page)
    await page.locator('[data-open-archive]').click()
    const archive = page.locator('[data-archive]')
    const days = await archive.locator('[data-archive-day]:not([aria-current])').evaluateAll(els => els.map(el => el.getAttribute('data-archive-day')!))
    expect(days.length, 'another day this month to open').toBeGreaterThan(0)
    await archive.locator(`[data-archive-day="${days[0]}"]`).click()
    const banner = page.locator('[data-day-banner]')
    await expect(banner).toBeVisible()
    await expectRoles(page, 'the day banner')
    expect(await roleIn(banner.locator('[data-viewing-date]'))).toBe('body')
    await expectControls(banner)
})

test('the tutorial: a display title, body with its emphasis, a secondary note, controls', async ({ page }) => {
    await page.goto('/')
    const skip = page.getByRole('button', { name: 'Skip' })
    await expect(skip).toBeVisible()
    await expectRoles(page, 'the tutorial')
    expect(await roleIn(page.getByRole('heading', { name: 'How to play' }))).toBe('display')
    expect(await weightOf(page.getByRole('heading', { name: 'How to play' }))).toBe(900)
    // Every bare `<strong>` is named 800, not left to preflight's `bolder` (900 over 600).
    const strong = await page.locator('.fixed.inset-0 strong').all()
    expect(strong.length).toBe(8)
    for (const s of strong) expect(await weightOf(s)).toBe(800)
    expect(await roleIn(page.getByText(/Tapping a square places/))).toBe('meta')
    expect(await roleIn(page.getByText(/Cover every empty square/))).toBe('body')
    await expectControls(page.locator('.fixed.inset-0').first())
})

for (const cell of [38, 53]) {
    test(`the component sheet at ${cell}px, and the completion card's levels`, async ({ page }) => {
        await page.goto(`${VISUAL_URL}/visual?cell=${cell}`)
        await expect(page.locator('main[data-sheet]')).toBeVisible()
        await expectRoles(page, `the sheet at ${cell}px`)
        expect(await roleIn(page.locator('[data-completion-message]'))).toBe('display')
        expect(await weightOf(page.locator('[data-completion-message]'))).toBe(900)
        // The detail is body's lighter emphasis, 700 on 600.
        expect(await weightOf(page.locator('[data-completion-detail]'))).toBe(700)
        await expectControls(page.locator('[data-completion-card]'))
        // The sheet's own labels, which name the specimens, are secondary notes.
        expect(await roleIn(page.locator('[data-specimen] > h2').first())).toBe('meta')
    })
}
