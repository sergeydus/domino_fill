import { test, expect, type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'
import { openBoard } from './openBoard'
import { VISUAL_URL } from './server'
import { drag } from './play'
import { LATE_IN_A_MONTH, pinDay } from './calendar'
import { PALETTE } from '../app/palette'
import { CONTROL, type Variant, type VariantName } from '../app/controls'

/**
 * The states every control owes (graphics spec P1-6, row 12).
 *
 * Every control in the game is a `<button>`, so each check below runs over every button on
 * the surface it is on, found by the browser rather than listed: the page's rail and game
 * controls, the archive, the day banner, the tutorial and the completion card. A control
 * added later is checked without anyone adding it here.
 *
 * Under reduced motion, which zeroes the controls' transitions (checked last, below), so a
 * state is read when it has arrived rather than on its way.
 */

test.use({ reducedMotion: 'reduce' })

/** Every enabled, visible button inside `scope`. */
const buttons = async (scope: Locator) => {
    const all = await scope.locator('button').all()
    const out: Locator[] = []
    for (const b of all) if (await b.isVisible() && await b.isEnabled()) out.push(b)
    return out
}

const name = async (b: Locator) =>
    (await b.getAttribute('aria-label')) ?? (await b.textContent())?.trim() ?? '?'

/** Greyscale of a region of a PNG, 0-255 per pixel. */
const grey = async (png: Buffer) => {
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const out = new Float64Array(info.width * info.height)
    for (let i = 0; i < out.length; i++) out[i] = 0.2126 * data[3 * i] + 0.7152 * data[3 * i + 1] + 0.0722 * data[3 * i + 2]
    return out
}

/** A lightness change this large, out of 255, counts -- the cell states' own threshold (P1-5). */
const MOVED = 32
/** And the footprint must be this much of the control's own area -- the cell states' bar. */
const FOOTPRINT = 0.05

/**
 * What focus draws on a control, without colour: the pixels round it whose lightness moved
 * between focused and not, as a fraction of the control's area. The same measure as the
 * cell states' (e2e/cellStates.spec.ts), so "the same non-colour requirement" is one bar.
 */
const focusFootprint = async (page: Page, button: Locator) => {
    // A key first, so the programmatic focus below is keyboard focus: `:focus-visible`.
    await page.keyboard.press('Shift')
    await button.focus()
    expect(await button.evaluate(el => el.matches(':focus-visible')), `${await name(button)}: focus-visible`).toBe(true)
    const box = (await button.boundingBox())!
    const pad = 8
    const clip = {
        x: Math.floor(box.x - pad), y: Math.floor(box.y - pad),
        width: Math.ceil(box.width + 2 * pad), height: Math.ceil(box.height + 2 * pad),
    }
    const on = await grey(await page.screenshot({ clip }))
    await button.evaluate(el => (el as HTMLElement).blur())
    const off = await grey(await page.screenshot({ clip }))
    const moved = on.reduce((t, v, i) => t + (Math.abs(v - off[i]) >= MOVED ? 1 : 0), 0)
    return moved / (box.width * box.height)
}

/** The ring's colour, width and offset, as computed while focused. */
const ringOf = async (page: Page, button: Locator) => {
    await page.keyboard.press('Shift')
    await button.focus()
    const ring = await button.evaluate(el => {
        const cs = getComputedStyle(el)
        return { style: cs.outlineStyle, width: cs.outlineWidth, offset: cs.outlineOffset, color: cs.outlineColor }
    })
    await button.evaluate(el => (el as HTMLElement).blur())
    return ring
}

/** A token as the browser writes a computed colour. */
const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`
}

const expectFocusShown = async (page: Page, scope: Locator, ring: string, least: number) => {
    const found = await buttons(scope)
    expect(found.length, 'the buttons were found').toBeGreaterThanOrEqual(least)
    for (const b of found) {
        const label = await name(b)
        expect(await focusFootprint(page, b), `${label}: focus draws too little to see without colour`)
            .toBeGreaterThanOrEqual(FOOTPRINT)
        expect(await ringOf(page, b), label).toEqual({ style: 'solid', width: '3px', offset: '2px', color: rgb(ring) })
    }
}

test.describe('focus-visible, on every control, readable without colour', () => {
    test('the page\'s controls', async ({ page }) => {
        await openBoard(page)
        // Difficulty 3, the enabled level arrow, Archive, Check, Hint, Reset, Sound.
        await expectFocusShown(page, page.locator('body'), PALETTE.accentEdge, 9)
    })

    test('the archive\'s, and the day banner\'s', async ({ page }) => {
        // A day with earlier days in its month: on the 1st this skipped (`pinDay`).
        await pinDay(page, LATE_IN_A_MONTH)
        await openBoard(page)
        await page.locator('[data-open-archive]').click()
        const archive = page.locator('[data-archive]')
        await expect(archive.locator('[data-archive-day]').first()).toBeVisible()
        await expectFocusShown(page, archive, PALETTE.accentEdge, 3)

        // An earlier day puts the banner up, with its way back to today.
        const days = await archive.locator('[data-archive-day]').evaluateAll(els => els.map(el => el.getAttribute('data-archive-day')!))
        const current = await archive.locator('[aria-current="date"]').getAttribute('data-archive-day')
        const earlier = days.filter(d => d !== current)
        expect(earlier.length, 'another day this month to open').toBeGreaterThan(0)
        await archive.locator(`[data-archive-day="${earlier[0]}"]`).click()
        await expect(page.locator('[data-go-to-today]')).toBeVisible()
        await expectFocusShown(page, page.locator('[data-day-banner]'), PALETTE.accentEdge, 1)
    })

    test('the tutorial\'s', async ({ page }) => {
        await page.goto('/')
        const skip = page.getByRole('button', { name: 'Skip' })
        await expect(skip).toBeVisible()
        await expectFocusShown(page, page.locator('.fixed.inset-0').first(), PALETTE.accentEdge, 1)
    })

    test('the completion card\'s, the one ring since P2-3 took the card off its green', async ({ page }) => {
        await page.goto(`${VISUAL_URL}/visual`)
        await expectFocusShown(page, page.locator('[data-completion-card]'), PALETTE.accentEdge, 2)
    })

    test('and the board\'s: the brackets are the keyboard\'s, not the pointer\'s', async ({ page }) => {
        /*
         * The board's squares are controls too, and their focus is the brackets (P1-5). A
         * press moves the keyboard's square -- so the keyboard carries on from where the
         * player touched -- but draws nothing, as `:focus-visible` would not; a key draws it.
         */
        await openBoard(page)
        const free = await page.locator('[data-cell]').evaluateAll(els => els
            .filter(el => !/rock/i.test(el.getAttribute('aria-label') ?? ''))
            .map(el => el.getAttribute('data-cell')!))
        const [i, j] = free[0].split(',').map(Number)
        await page.locator(`[data-cell="${i},${j}"]`).click()
        await expect(page.locator('[data-focus]')).toHaveAttribute('data-focus', `${i},${j}`)
        await expect(page.locator('[data-mark="focus"]')).toHaveCount(0)

        await page.keyboard.press('ArrowRight')
        await expect(page.locator('[data-focus-visible] [data-mark="focus"]')).toHaveCount(1)

        // And leaving the board takes it away.
        await page.locator('[data-check]').focus()
        await expect(page.locator('[data-mark="focus"]')).toHaveCount(0)
    })
})

/** The properties a state can change, as computed. */
const look = (b: Locator) => b.evaluate(el => {
    const cs = getComputedStyle(el)
    return {
        translate: cs.translate, filter: cs.filter, background: cs.backgroundColor,
        shadow: cs.boxShadow, weight: cs.fontWeight, opacity: cs.opacity, scale: cs.scale,
    }
})

/** The variant a button names. */
const variantOf = async (b: Locator): Promise<Variant> => CONTROL[await b.evaluate(el =>
    Array.from(el.classList).find(c => c.startsWith('control-'))!.slice('control-'.length)) as VariantName]

/** How a toggle that is on rests: held down by its edge's depth (UI row 3), or not at all. */
const restingDepth = async (b: Locator, c: Variant) =>
    await b.getAttribute('aria-pressed') === 'true' && c.edge ? `0px ${c.edge.depth}px` : 'none'

test.describe('pressed, disabled, and toggled', () => {
    test('every control answers a press before its result arrives', async ({ page }) => {
        /*
         * Under the reduced motion this file runs in. A raised control's answer is its edge
         * going (UI row 3), and it doesn't move, which reduced motion forbids; the sink itself
         * is the next test's. The level arrows keep P1-6's pixel and 90% until row 6.
         */
        await openBoard(page)
        const found = await buttons(page.locator('body'))
        expect(found.length).toBeGreaterThanOrEqual(9)
        for (const b of found) {
            const label = await name(b)
            const c = await variantOf(b)
            const resting = await restingDepth(b, c)
            await b.hover()
            const up = await look(b)
            await page.mouse.down()
            const down = await look(b)
            // Off the control before letting go, so the press is not a click.
            await page.mouse.move(0, 0)
            await page.mouse.up()
            if (c.press === 'sink') {
                expect({ translate: down.translate, filter: down.filter, shadow: down.shadow }, label)
                    .toEqual({ translate: resting, filter: 'none', shadow: 'none' })
                // At rest it had an edge to lose -- unless it's a toggle that is on, already down.
                if (resting === 'none') expect(up.shadow, `${label}: an edge to lose`).not.toBe('none')
            } else {
                expect({ translate: down.translate, filter: down.filter }, label)
                    .toEqual({ translate: '0px 1px', filter: 'brightness(0.9)' })
            }
            expect({ translate: up.translate, filter: up.filter }, label).toEqual({ translate: resting, filter: 'none' })
        }
    })

    test('with motion allowed, a raised control sinks into its edge while held', async ({ page }) => {
        // UI-SPEC §3.3: down by the edge's depth, the edge gone, over 80ms -- waited out here.
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await openBoard(page)
        const settled = (b: Locator) => expect.poll(() => b.evaluate(el => el.getAnimations().length)).toBe(0)
        for (const selector of ['[data-check]', '[data-hint]']) {
            const b = page.locator(selector)
            await expect(b).toBeEnabled()
            const c = await variantOf(b)
            await b.hover()
            await settled(b)
            const up = await look(b)
            await page.mouse.down()
            await settled(b)
            const down = await look(b)
            await page.mouse.move(0, 0)
            await page.mouse.up()
            expect(up.translate, selector).toBe('none')
            expect(up.shadow, `${selector}: its edge, at rest`).toContain(`0px ${c.edge!.depth}px 0px 0px`)
            expect({ translate: down.translate, shadow: down.shadow }, `${selector}, held`)
                .toEqual({ translate: `0px ${c.edge!.depth}px`, shadow: 'none' })
        }
        // And a disabled one doesn't, motion or not.
        const undo = page.locator('[data-undo]')
        await expect(undo).toBeDisabled()
        const at = await look(undo)
        const box = (await undo.boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        expect(await look(undo), 'disabled, held').toEqual(at)
        await page.mouse.up()
    })

    test('a press near a control\'s top edge, held and released in place, still acts', async ({ page }) => {
        /*
         * Codex, at UI row 3's review: pressed 2px below its top, held and released without
         * moving, Archive stayed closed. It had sunk 3px, the pointer was above it by the
         * release, and a click whose press and release land on different elements goes to
         * neither. The tests above press the centre, or release elsewhere, so none could see it.
         * Each control is pressed halfway into the band its sink uncovers. A nudge's pixel
         * leaves no band a pointer can reliably find, measured: Chromium still hit the level
         * arrow half a pixel above its nudged top.
         */
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await openBoard(page)
        const pressAtTop = async (b: Locator) => {
            const c = await variantOf(b)
            expect(c.press, `${await name(b)} sinks`).toBe('sink')
            // The pointer presses where it's told; below a phone's fold, that's nothing.
            await b.scrollIntoViewIfNeeded()
            const box = (await b.boundingBox())!
            await page.mouse.move(box.x + box.width / 2, box.y + c.edge!.depth / 2)
            await page.mouse.down()
            await expect.poll(() => b.evaluate(el => el.getAnimations().length)).toBe(0)
            expect((await look(b)).translate, `${await name(b)}: moved from under the pointer`).not.toBe('none')
            await page.mouse.up()
        }
        await pressAtTop(page.locator('[data-check]'))
        await expect(page.locator('[data-advice-kind]'), 'Check, the primary')
            .toHaveAttribute('data-advice-kind', 'on-track')

        const medium = page.locator('[data-difficulty="normal"]')
        await expect(medium).toHaveAttribute('aria-pressed', 'false')
        await pressAtTop(medium)
        await expect(medium, 'a raised toggle').toHaveAttribute('aria-pressed', 'true')

        await pressAtTop(page.locator('[data-open-archive]'))
        await expect(page.locator('[data-archive]'), 'Archive, a raised control').toBeVisible()
    })

    test('from the keyboard: Space is held like a press, and Enter has nothing to hold', async ({ page }) => {
        /*
         * Codex, at review: holding Enter on a button left it at rest. That is the browser's
         * activation, not a missing style. A button activates on Space's *release*, and
         * Chromium draws `:active` while Space is down -- so, like a pointer, Space has a
         * moment between the press and the result, and the press is answered in it. Enter
         * activates on its *keydown*: the result is the first thing that happens, and there
         * is no held moment to draw. Both halves are asserted, so the claim is exactly what
         * the browser does.
         */
        await openBoard(page)
        const medium = page.locator('[data-difficulty="normal"]')
        await expect(medium).toHaveAttribute('aria-pressed', 'false')

        await page.keyboard.press('Shift')
        await medium.focus()
        const atRest = await look(medium)
        expect(atRest.shadow, 'its edge, at rest').not.toBe('none')
        await page.keyboard.down(' ')
        // Under reduced motion the answer is the edge going, without the move (UI row 3).
        expect(await look(medium), 'Space held').toMatchObject({ translate: 'none', filter: 'none', shadow: 'none' })
        await expect(medium, 'and nothing has happened yet').toHaveAttribute('aria-pressed', 'false')
        await page.keyboard.up(' ')
        await expect(medium).toHaveAttribute('aria-pressed', 'true')
        // On now, so held down by its state: a toggle's depth shows under reduced motion too.
        expect(await look(medium), 'released, and on').toMatchObject({ translate: `0px ${CONTROL.raised.edge.depth}px`, shadow: 'none' })

        // Enter on a control that isn't a toggle, so its state can't stand in for a press:
        // Archive, whose result -- the archive open -- is plain to see.
        const archive = page.locator('[data-open-archive]')
        await archive.focus()
        await page.keyboard.down('Enter')
        await expect(page.locator('[data-archive]'), 'Enter has already acted, with the key still down').toBeVisible()
        expect(await look(archive), 'so there is no held state to show').toMatchObject({ translate: 'none', filter: 'none' })
        await page.keyboard.up('Enter')
    })

    test('a disabled control keeps its treatment, and does not answer a press or a hover', async ({ page }) => {
        await openBoard(page)
        const undo = page.locator('[data-undo]')
        await expect(undo, 'Undo is disabled on arrival').toBeDisabled()
        const at = await look(undo)
        // The treatment `tests/contrast.test.ts`'s pinned disabled ratio is computed from: 45%,
        // and no edge (UI row 3; 40% on the control surface until then).
        expect(at.opacity).toBe('0.45')
        expect(at.shadow).toBe('none')
        expect(await undo.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]))
            .toEqual([rgb(PALETTE.surface), rgb(PALETTE.ink)])

        const box = (await undo.boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        expect(await look(undo), 'hovered').toEqual(at)
        await page.mouse.down()
        expect(await look(undo), 'pressed').toEqual(at)
        await page.mouse.up()
    })

    test('a toggle shows its state by colour and without it', async ({ page }) => {
        /*
         * `aria-pressed` on screen: the accent's fill, and -- for anyone who cannot use that
         * -- held down, by its edge's depth with the edge gone (UI row 3; a ring and a bolder
         * weight until then). The weight is the same both ways now. Every toggle on the page,
         * compared pressed against not pressed, under this file's reduced motion: the depth is
         * a state, and shows there.
         */
        await openBoard(page)
        await page.mouse.move(0, 0)
        const channels = (on: Awaited<ReturnType<typeof look>>, off: Awaited<ReturnType<typeof look>>) => ({
            colour: on.background !== off.background,
            weight: on.weight !== off.weight,
            depth: on.translate !== off.translate,
            edge: on.shadow === 'none' && off.shadow !== 'none',
        })
        const SHOWN = { colour: true, weight: false, depth: true, edge: true }

        // Difficulty: the pressed one against each of the others.
        const pressed = page.locator('[data-difficulty][aria-pressed="true"]')
        await expect(pressed).toHaveCount(1)
        const on = await look(pressed)
        expect(on.background).toBe(rgb(PALETTE.accent))
        for (const other of await page.locator('[data-difficulty][aria-pressed="false"]').all()) {
            expect(channels(on, await look(other))).toEqual(SHOWN)
        }

        // Sound: the same control, both ways. Pressed is sound on.
        const sound = page.locator('[data-mute]')
        await expect(sound).toHaveAttribute('aria-pressed', 'true')
        await expect(sound).toHaveText('Sound on')
        const soundOn = await look(sound)
        await sound.click()
        await page.mouse.move(0, 0)
        await expect(sound).toHaveAttribute('aria-pressed', 'false')
        const soundOff = await look(sound)
        expect(channels(soundOn, soundOff)).toEqual(SHOWN)

        // Pick a piece: the same control, both ways. Pressed is the mode on.
        const pick = page.locator('[data-controls-mode]')
        await expect(pick).toHaveAttribute('aria-pressed', 'false')
        const pickOff = await look(pick)
        await pick.click()
        await page.mouse.move(0, 0)
        await expect(pick).toHaveAttribute('aria-pressed', 'true')
        expect(channels(await look(pick), pickOff)).toEqual(SHOWN)

        // Every toggle on the page was one of those: three difficulties, Sound and the mode.
        // The picker the mode shows is not a toggle but a choice, below.
        expect(await page.locator('[aria-pressed]').count()).toBe(5)
    })

    test('a choice shows which is chosen by a ring and a check mark, not a fill', async ({ page }) => {
        /*
         * The picker's two pieces are radios: exactly one is always held. Chosen is the
         * `chip` variant's ring and a check mark drawn inside the chip -- a shape, so it
         * survives without colour -- and never the accent's fill, which is a toggle's. The
         * first picker was two toggles, and the held one's whole button went solid blue.
         */
        await openBoard(page)
        await page.locator('[data-controls-mode]').click()
        await page.mouse.move(0, 0)
        const chosen = page.locator('[data-held-piece][aria-checked="true"]')
        const other = page.locator('[data-held-piece][aria-checked="false"]')
        await expect(chosen).toHaveCount(1)
        await expect(other).toHaveCount(1)
        const [on, off] = [await look(chosen), await look(other)]

        // The ring over the edge both chips stand on (UI row 3): the ring is the difference.
        expect(on.shadow).toContain('0px 0px 0px 2px')
        expect(off.shadow).not.toContain('0px 0px 0px 2px')
        expect(off.shadow).not.toBe('none')
        expect([on.background, on.weight, on.translate]).toEqual([off.background, off.weight, off.translate])
        expect(on.background).not.toBe(rgb(PALETTE.accent))

        // The check mark: shown on the chosen chip only, and inside its border on every side.
        await expect(chosen.locator('[data-check-mark]')).toBeVisible()
        await expect(other.locator('[data-check-mark]')).toHaveCount(0)
        const chip = (await chosen.boundingBox())!
        const mark = (await chosen.locator('[data-check-mark]').boundingBox())!
        expect(mark.x).toBeGreaterThan(chip.x)
        expect(mark.y).toBeGreaterThan(chip.y)
        expect(mark.x + mark.width).toBeLessThan(chip.x + chip.width)
        expect(mark.y + mark.height).toBeLessThan(chip.y + chip.height)
    })
})

test.describe('hover, only where there is one', () => {
    test('every hover rule the page loads waits for a fine pointer that can hover', async ({ page }) => {
        await openBoard(page)
        const rules = await page.evaluate(() => {
            const found: { selector: string, media: string[] }[] = []
            const walk = (list: CSSRuleList, media: string[]) => {
                for (const rule of Array.from(list)) {
                    if (rule instanceof CSSStyleRule) {
                        if (rule.selectorText.includes(':hover')) found.push({ selector: rule.selectorText, media })
                        if (rule.cssRules?.length) walk(rule.cssRules, media)
                    } else if (rule instanceof CSSMediaRule) {
                        walk(rule.cssRules, [...media, rule.conditionText])
                    } else if ('cssRules' in rule) {
                        walk((rule as CSSGroupingRule).cssRules, media)
                    }
                }
            }
            for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules, [])
            return found
        })
        // Found at all: one per variant with a hover since P2-2 (row 14) -- primary,
        // secondary, caution, quiet and icon, from `app/controls.css`.
        expect(rules.length).toBeGreaterThanOrEqual(5)
        const loose = rules.filter(r => !r.media.some(m => /\(hover:\s*hover\)/.test(m) && /\(pointer:\s*fine\)/.test(m)))
        expect(loose).toEqual([])
    })

    test('and a fine pointer does get it: the level arrow grows under it', async ({ page, isMobile }) => {
        test.skip(isMobile, 'a fine pointer')
        await openBoard(page)
        const next = page.locator('[data-level="next"]')
        await expect(next).toBeEnabled()
        await page.mouse.move(0, 0)
        expect((await look(next)).scale).toBe('none')
        await next.hover()
        expect((await look(next)).scale).toBe('1.2')
    })
})

test.describe('transitions, and reduced motion over CSS', () => {
    const durations = (page: Page) => page.evaluate(() => {
        const nonZero = (list: string) => list.split(',').some(d => parseFloat(d) > 0)
        return Array.from(document.querySelectorAll('*')).map(el => {
            const cs = getComputedStyle(el)
            return {
                el: `${el.tagName.toLowerCase()}${el.getAttribute('data-difficulty') ? `[${el.getAttribute('data-difficulty')}]` : ''}`,
                button: el.tagName === 'BUTTON',
                moves: nonZero(cs.transitionDuration) || nonZero(cs.animationDuration),
                zero: !nonZero(cs.transitionDuration) && !nonZero(cs.animationDuration),
            }
        })
    })

    test('every control has a transition, and none is left when less motion is asked for', async ({ page }) => {
        /*
         * P1-6: "computed transition-duration and animation-duration are 0s on every element
         * that has one -- and non-zero without it, or the assertion proves nothing".
         */
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await openBoard(page)
        const without = await durations(page)
        const moving = without.filter(e => e.moves)
        expect(moving.length, 'something has a transition').toBeGreaterThan(0)
        expect(without.filter(e => e.button && !e.moves).map(e => e.el), 'a button with no transition').toEqual([])

        await page.emulateMedia({ reducedMotion: 'reduce' })
        const reduced = await durations(page)
        expect(reduced.length).toBe(without.length)
        expect(reduced.filter(e => !e.zero).map(e => e.el), 'still moving under reduced motion').toEqual([])
    })
})

test('a drag still places after all this: the press state is on the controls, not the board', async ({ page }) => {
    // A guard for the `:active` rule's reach: the board's squares are not buttons, and a
    // pressed square that moved a pixel would move the drag's own target.
    await openBoard(page)
    const before = await page.locator('[data-piece]').count()
    const free = await page.locator('[data-cell]').evaluateAll(els => els
        .filter(el => /empty/i.test(el.getAttribute('aria-label') ?? ''))
        .map(el => el.getAttribute('data-cell')!))
    const has = new Set(free)
    const pair = free.map(c => c.split(',').map(Number)).find(([i, j]) => has.has(`${i},${j + 1}`))!
    await drag(page, [pair[0], pair[1]], [pair[0], pair[1] + 1])
    await expect(page.locator('[data-piece]')).toHaveCount(before + 1)
})
