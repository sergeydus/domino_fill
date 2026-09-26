import { test, expect, type Locator, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { VISUAL_URL } from './server'
import { TYPE, type Role } from '../app/typography'

/**
 * Every text surface is one of five roles, in one family (graphics spec P2-1, row 13).
 *
 * Asserted by computed style, as the spec asks, and over every element the browser finds
 * with text of its own that is on screen -- not a list of the surfaces someone remembered.
 * Each must compute to a role's size *and* line height together, and to the page's one
 * family. Then the surfaces the table names are checked against the role it names for them,
 * so "some role" cannot stand in for "the right one".
 *
 * The surfaces: the game page, with the advice strip speaking; the archive; the day banner;
 * the tutorial; the component sheet at both baseline sizes, which holds the completion card.
 */

type Text = { text: string, size: number, line: number, family: string, label: number | null }

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
        })
    }
    return out
})

/** The role a computed size and line height are, or null. */
const roleOf = (t: Text): Role | null => {
    for (const [role, { size, lineHeight }] of Object.entries(TYPE) as [Role, typeof TYPE[Role]][]) {
        const px = typeof size === 'number' ? size : t.label
        if (px === null) continue
        if (Math.abs(t.size - px) < 0.01 && Math.abs(t.line - px * lineHeight) < 0.01) return role
    }
    return null
}

/** Every text on the page is a role, in the body's family, which is Geist. */
const expectRoles = async (page: Page, where: string) => {
    const found = await texts(page)
    expect(found.length, `${where}: text was found`).toBeGreaterThan(0)
    const loose = found.filter(t => roleOf(t) === null).map(t => `"${t.text}": ${t.size}px / ${t.line}px`)
    expect(loose, `${where}: text in no role`).toEqual([])
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
    expect(family).toMatch(/Geist/)
    expect(family).not.toMatch(/Arial|Helvetica/)
    const strays = found.filter(t => t.family !== family).map(t => `"${t.text}": ${t.family}`)
    expect(strays, `${where}: text in another family`).toEqual([])
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
            label: Number.isNaN(labelFont) ? null : labelFont,
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

test('the game page: labels, controls, and the advice strip', async ({ page }) => {
    await openBoard(page)
    await page.locator('[data-check]').click()
    await expect(page.locator('[data-advice] span')).toBeVisible()
    await expectRoles(page, 'the page')

    for (const label of await page.locator('[data-col-label], [data-row-label]').all()) {
        expect(await roleIn(label)).toBe('boardLabel')
    }
    // And the label's size is the cell's fraction, not a constant that happens to match.
    const [cell, font] = await page.locator('[data-board-shell]').evaluate(shell => [
        shell.querySelector('[data-cell]')!.getBoundingClientRect().width,
        parseFloat(getComputedStyle(shell).getPropertyValue('--label-font')),
    ])
    expect(font).toBe(Math.round(cell * 0.5))
    await expectControls(page.locator('body'))
    expect(await roleIn(page.locator('[data-advice] span'))).toBe('body')
})

test('the archive: its dates are meta, its words body, its buttons controls', async ({ page }) => {
    await openBoard(page)
    await page.locator('[data-open-archive]').click()
    const archive = page.locator('[data-archive]')
    await expect(archive.locator('[data-archive-day]').first()).toBeVisible()
    await expectRoles(page, 'the archive')
    expect(await roleIn(archive.locator('[data-archive-month]'))).toBe('body')
    for (const day of await archive.locator('[data-archive-day]').all()) expect(await roleIn(day)).toBe('meta')
    await expectControls(archive, '[data-archive-day]')
})

test('the day banner is body, its action a control', async ({ page }) => {
    await openBoard(page)
    await page.locator('[data-open-archive]').click()
    const archive = page.locator('[data-archive]')
    const days = await archive.locator('[data-archive-day]:not([aria-current])').evaluateAll(els => els.map(el => el.getAttribute('data-archive-day')!))
    test.skip(days.length === 0, 'no other day this month to open')
    await archive.locator(`[data-archive-day="${days[0]}"]`).click()
    const banner = page.locator('[data-day-banner]')
    await expect(banner).toBeVisible()
    await expectRoles(page, 'the day banner')
    expect(await roleIn(banner.locator('[data-viewing-date]'))).toBe('body')
    await expectControls(banner)
})

test('the tutorial: a card title, body, a secondary note, controls', async ({ page }) => {
    await page.goto('/')
    const skip = page.getByRole('button', { name: 'Skip' })
    await expect(skip).toBeVisible()
    await expectRoles(page, 'the tutorial')
    expect(await roleIn(page.getByRole('heading', { name: 'How to play' }))).toBe('cardTitle')
    expect(await roleIn(page.getByText(/Tapping a square places/))).toBe('meta')
    expect(await roleIn(page.getByText(/Cover every empty square/))).toBe('body')
    await expectControls(page.locator('.fixed.inset-0').first())
})

for (const cell of [38, 53]) {
    test(`the component sheet at ${cell}px, and the completion card's title`, async ({ page }) => {
        await page.goto(`${VISUAL_URL}/visual?cell=${cell}`)
        await expect(page.locator('main[data-sheet]')).toBeVisible()
        await expectRoles(page, `the sheet at ${cell}px`)
        expect(await roleIn(page.locator('[data-completion-message]'))).toBe('cardTitle')
        await expectControls(page.locator('[data-completion-card]'))
        // The sheet's own labels, which name the specimens, are secondary notes.
        expect(await roleIn(page.locator('[data-specimen] > h2').first())).toBe('meta')
    })
}
