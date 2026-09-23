import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { VISUAL_URL } from './server'

/**
 * Every glyph on the baseline pages is drawn by a self-hosted web font (graphics spec P0-4).
 *
 * The visual baselines are taken on a plain GitHub-hosted Ubuntu runner, not a pinned
 * container image, and that runner's installed fonts change when GitHub updates it. A glyph
 * that fell back to a system font -- a missing weight, a character outside the subset, a
 * rule that escaped `font-sans` -- would make the baselines a function of the runner image.
 * `next/font` self-hosts Geist, so the claim is that nothing ever falls back; this makes it a
 * measurement instead of an assumption, and it runs on any host, including this one.
 *
 * Chromium reports the font that *actually* drew each node's text, through the DevTools
 * protocol. `next/font` also defines a "Geist Fallback" face built from a local system
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

const SELF_HOSTED = /^Geist( Mono)?$/

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
