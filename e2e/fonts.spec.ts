import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { VISUAL_URL } from './server'
import { LATE_IN_A_MONTH, pinDay } from './calendar'
import { freeRuns, rockSquares } from './play'

/**
 * Every glyph on the baseline pages is drawn by a self-hosted web font (graphics spec P0-4).
 *
 * The visual baselines are taken on a plain GitHub-hosted Ubuntu runner, not a pinned
 * container image, and that runner's installed fonts change when GitHub updates it. A glyph
 * that fell back to a system font -- a missing weight, a character outside the subset, a
 * rule that escaped `font-sans` -- would make the baselines a function of the runner image.
 * `next/font` self-hosts the face, so the claim is that nothing ever falls back; this makes it a
 * measurement instead of an assumption, and it runs on any host, including this one.
 *
 * The face is Nunito since UI row 2. Chromium names it by the font file's own name, which for
 * Google's variable Nunito is its default instance, "Nunito ExtraLight", at every weight drawn
 * (measured): so that exact name, which a "Nunito Sans" or a "Nunito Fallback" doesn't match.
 *
 * Chromium reports the font that *actually* drew each node's text, through the DevTools
 * protocol. `next/font` also defines a "Nunito Fallback" face built from a local system
 * font; that is a system font for this purpose, and the family check rejects it.
 */

type Node = { nodeId: number, nodeType: number, nodeValue: string, children?: Node[] }
type Drawn = { family: string, custom: boolean, glyphs: number }

/** The fonts that drew every text-bearing element on the page, with glyph counts. */
const fontsDrawn = async (page: Page): Promise<Drawn[]> => {
    await page.evaluate(() => document.fonts.ready)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })

    const parents = new Set<number>()
    const walk = (node: Node, parent: number) => {
        if (node.nodeType === 3 && node.nodeValue.trim()) parents.add(parent)
        for (const child of node.children ?? []) walk(child, node.nodeType === 1 ? node.nodeId : parent)
    }
    walk(root as Node, 0)

    const drawn: Drawn[] = []
    for (const nodeId of parents) {
        // Unrendered text (a <script>, a <title>) reports no fonts, and so adds nothing.
        const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
        for (const f of fonts) drawn.push({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount })
    }
    await cdp.detach()
    return drawn
}

const SELF_HOSTED = /^Nunito ExtraLight$/

const expectOnlySelfHosted = async (page: Page) => {
    /*
     * Positive control first: a span in a system font must be reported as one, or a reader
     * that saw nothing would pass everything.
     */
    await page.evaluate(() => {
        const probe = document.createElement('span')
        probe.id = 'font-probe'
        probe.style.fontFamily = 'serif'
        probe.textContent = 'probe'
        document.body.append(probe)
    })
    expect((await fontsDrawn(page)).some(f => !f.custom), 'the reader cannot see a system font')
        .toBe(true)
    await page.evaluate(() => document.getElementById('font-probe')?.remove())

    const drawn = await fontsDrawn(page)
    const glyphs = drawn.reduce((n, f) => n + f.glyphs, 0)
    expect(glyphs, 'no text was measured at all').toBeGreaterThan(20)
    const foreign = drawn.filter(f => !f.custom || !SELF_HOSTED.test(f.family))
    expect(foreign, 'text drawn by a font the page does not ship').toEqual([])
}

test('the game page draws every glyph in its own fonts, at both baseline sizes', async ({ page }) => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 360, height: 640 }]) {
        await page.setViewportSize(viewport)
        await openBoard(page)
        await expectOnlySelfHosted(page)
    }
})

test('so does the component sheet', async ({ page }) => {
    await page.goto(`${VISUAL_URL}/visual?cell=38`)
    await expect(page.locator('main[data-sheet]')).toBeVisible()
    await expectOnlySelfHosted(page)
})

/*
 * A font that never arrives leaves the page in its fallback for good (U12, rule 6; codex's
 * recommendation). The fallback's metrics aren't pinned, and differ by host: this one has
 * Arial for "Nunito Fallback", CI's Ubuntu hasn't, and draws with the next family. So this
 * asks only that the page still works in whatever it draws with.
 */
for (const viewport of [{ width: 360, height: 640 }, { width: 1280, height: 800 }]) {
    test(`with the font blocked, the game page still works at ${viewport.width}x${viewport.height}`, async ({ page }) => {
        let blocked = 0
        await page.route('**/_next/static/media/*.woff2', route => { blocked++; return route.abort() })
        await pinDay(page, LATE_IN_A_MONTH)
        await page.setViewportSize(viewport)
        await openBoard(page)

        // The block is real: text is drawn, and none of it by Nunito.
        const drawn = await fontsDrawn(page)
        expect(drawn.reduce((n, f) => n + f.glyphs, 0), 'no text was measured at all').toBeGreaterThan(20)
        expect(drawn.filter(f => SELF_HOSTED.test(f.family)), 'text drawn by Nunito, which was blocked').toEqual([])
        expect(blocked, 'the font was never requested').toBeGreaterThan(0)

        // A domino goes down from the keyboard, as on any day.
        const { upright: [i, j] } = await freeRuns(page, await rockSquares(page))
        await page.locator('.board-grid').focus()
        await page.keyboard.press('ArrowDown')
        await expect(page.locator('[data-focus]')).toHaveAttribute('data-focus', '0,0')
        for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown')
        for (let k = 0; k < j; k++) await page.keyboard.press('ArrowRight')
        await expect(page.locator('[data-focus]')).toHaveAttribute('data-focus', `${i},${j}`)
        await page.keyboard.press(' ')
        await page.keyboard.press('ArrowDown')
        await expect(page.locator(`[data-piece="one"][data-at="${i},${j}"]`)).toBeVisible()

        // And nothing pushes the page sideways.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
            'the page scrolls sideways').toBeLessThanOrEqual(0)
    })
}
