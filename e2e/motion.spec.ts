import { test, expect, type Page } from '@playwright/test'
import { VISUAL_URL } from './server'
import { waitForRest } from './rest'
import { frames, movement, onTime, track, type Sample } from './frames'
import { openBoard } from './openBoard'
import { playSolution } from './play'
import { LIMITS } from '../app/dominoFill/motion'

/**
 * P1-6's motion limits, measured on screen (graphics spec, row 12).
 *
 * Placement feedback -- a piece arriving, the board refusing a move, a line label changing
 * state -- moves no further than `LIMITS.amplitude` of a cell and runs no longer than
 * `LIMITS.duration`, and so does the completion card (P2-3). `tests/motion.test.ts` pins the
 * values; this reads back what the browser actually painted, every frame, and holds the
 * limit to the *upper* bound those frames put on each duration (`movement` says why it is
 * one), taken only from frames that arrived on time (`onTime` says why that matters).
 *
 * On the component sheet, at the 38px floor: its `empty` specimen is a live 2x2 board with
 * both targets 1, so an upright on the left column fills that column to its target -- the
 * label changes state -- and a drag from the other top square onto it is refused.
 */

test.use({ baseURL: VISUAL_URL })

const CELL = 38
const square = (page: Page, at: string) => page.locator(`[data-specimen="empty"] [data-cell="${at}"]`)
const drag = async (page: Page, from: string, to: string) => {
    await square(page, from).hover()
    await page.mouse.down()
    await square(page, to).hover()
    await page.mouse.up()
}

const openSheet = async (page: Page) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`/visual?cell=${CELL}`)
    await expect(page.locator('main[data-sheet]')).toBeVisible()
    await waitForRest(page, 'main')
    expect((await square(page, '0,0').boundingBox())!.width).toBe(CELL)
}

/** Whether a sample is anywhere but where the element came to rest. */
const away = (rest: Sample) => (s: Sample) =>
    Math.abs(s.x - rest.x) > 1e-3 || Math.abs(s.y - rest.y) > 1e-3 || Math.abs(s.opacity - rest.opacity) > 1e-3

const ms = (m: { lower: number, upper: number }) => `${m.lower.toFixed(0)}-${m.upper.toFixed(0)}ms`

test.describe('with motion', () => {
    test.use({ reducedMotion: 'no-preference' })

    test('a piece arrives inside the limits', async ({ page }) => {
        const m = await onTime(async () => {
            await openSheet(page)
            await track(page, 'entry', '[data-specimen="empty"] [data-piece="one"]')
            await drag(page, '0,0', '1,0')
            const samples = await frames(page, 'entry')
            const rest = samples[samples.length - 1]
            const reach = Math.max(...samples.map(s => Math.hypot(s.x - rest.x, s.y - rest.y))) / CELL
            return { ...movement(samples, away(rest)), reach }
        })
        // It did move, or every bound below is met by standing still.
        expect(m.moved).toBe(true)
        expect(m.reach, 'the entry starts a tenth of a cell away').toBeGreaterThan(0.05)
        expect(m.reach).toBeLessThanOrEqual(LIMITS.amplitude)
        expect(m.lower).toBeGreaterThan(50)
        expect(m.upper, `moved for ${ms(m)}`).toBeLessThanOrEqual(LIMITS.duration * 1000)
    })

    test('a line label changes state inside the limit', async ({ page }) => {
        const label = '[data-specimen="empty"] [data-col-label="0"]'
        const m = await onTime(async () => {
            await openSheet(page)
            await track(page, 'label', label)
            await drag(page, '0,0', '1,0')
            await expect(page.locator(label)).toHaveAttribute('data-line-state', 'satisfied')
            const samples = await frames(page, 'label')
            const [from, to] = [samples[0].color, samples[samples.length - 1].color]
            // Changing is neither colour: the frames before the drag are at the first, and
            // they are not motion.
            return { ...movement(samples, s => s.color !== from && s.color !== to), changed: from !== to }
        })
        expect(m.changed, 'the label did change colour').toBe(true)
        expect(m.upper, `changed for ${ms(m)}`).toBeLessThanOrEqual(LIMITS.duration * 1000)
    })

    test('a refused move shakes the board inside the limits, and marks its square', async ({ page }) => {
        const grid = '[data-specimen="empty"] .board-grid'
        const m = await onTime(async () => {
            await openSheet(page)
            await drag(page, '0,0', '1,0')
            await waitForRest(page, 'main')
            await track(page, 'shake', grid)
            await drag(page, '0,1', '0,0')   // onto the upright: refused
            const samples = await frames(page, 'shake')
            const furthest = Math.max(...samples.map(s => Math.abs(s.tx))) / CELL
            return { ...movement(samples, s => Math.abs(s.tx) > 1e-3), furthest, end: samples[samples.length - 1].tx }
        })
        expect(m.moved, 'the board did shake').toBe(true)
        expect(m.furthest).toBeGreaterThan(0.05)
        expect(m.furthest).toBeLessThanOrEqual(LIMITS.amplitude)
        expect(m.upper, `shook for ${ms(m)}`).toBeLessThanOrEqual(LIMITS.duration * 1000)
        expect(m.end, 'and came back to rest').toBe(0)

        await expect(page.locator('[data-specimen="empty"] [data-refused]')).toHaveAttribute('data-refused', '0,1')
    })
})

test.describe('the completion card', () => {
    test.use({ baseURL: undefined, reducedMotion: 'no-preference' })

    test('arrives inside the limits', async ({ page }) => {
        /*
         * Read from its transform, not its box: arriving, the card scrolls itself into view
         * (CompletionCard says why), and the page scrolling moves the box by far more than
         * the animation does -- measured, 0.56 of a cell.
         */
        const m = await onTime(async () => {
            await openBoard(page)
            const cell = (await page.locator('[data-cell="0,0"]').boundingBox())!.width
            await track(page, 'card', '[data-completion-card]')
            await playSolution(page)
            const samples = await frames(page, 'card')
            const offset = (s: Sample) => Math.hypot(s.tx, s.ty)
            const moving = (s: Sample) => offset(s) > 1e-3 || Math.abs(s.opacity - 1) > 1e-3
            return { ...movement(samples, moving), reach: Math.max(...samples.map(offset)) / cell }
        })
        expect(m.moved).toBe(true)
        expect(m.reach).toBeGreaterThan(0.05)
        expect(m.reach).toBeLessThanOrEqual(LIMITS.amplitude)
        expect(m.upper, `moved for ${ms(m)}`).toBeLessThanOrEqual(LIMITS.duration * 1000)
    })
})

test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('a refused move is still answered: a mark, drawn at once and still', async ({ page }) => {
        /*
         * The shake is suppressed here (`e2e/accessibility.spec.ts` samples the grid and
         * finds it never moves), which left a refusal with no visual answer at all. The
         * cross is that answer, and it must not be motion itself: present in full on the
         * first frame it exists, and unchanged on every frame after.
         */
        await openSheet(page)
        await drag(page, '0,0', '1,0')
        await waitForRest(page, 'main')
        const mark = '[data-specimen="empty"] [data-refused]'
        await track(page, 'grid', '[data-specimen="empty"] .board-grid', 500)
        await track(page, 'mark', mark, 500)
        await drag(page, '0,1', '0,0')

        const grid = await frames(page, 'grid')
        expect(grid.every(s => s.tx === 0), 'the board did not move').toBe(true)

        const samples = await frames(page, 'mark')
        expect(samples.length).toBeGreaterThan(5)
        const first = samples[0]
        expect(first.opacity).toBe(1)
        for (const s of samples) expect([s.x, s.y, s.opacity]).toEqual([first.x, first.y, first.opacity])
        await expect(page.locator(mark)).toHaveAttribute('data-refused', '0,1')
        expect(await page.locator(`${mark} svg`).evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0)
    })
})

test.describe('the cross lasts until the board does something', () => {
    test.use({ reducedMotion: 'reduce' })

    test('Tab walking away leaves it; a key the board handles clears it', async ({ page }) => {
        /*
         * Row 12's correction (codex). Every key that reached the board used to clear the
         * cross before the board knew whether the key was its own, so Tab from the refused
         * square -- a player leaving, not acting -- took the cross with it.
         */
        await openSheet(page)
        await drag(page, '0,0', '1,0')
        await drag(page, '0,1', '0,0')   // refused
        const mark = page.locator('[data-specimen="empty"] [data-refused]')
        await expect(mark).toHaveAttribute('data-refused', '0,1')
        await expect(square(page, '0,1')).toBeFocused()

        await page.keyboard.press('Tab')
        expect(await page.locator('[data-specimen="empty"] .board-grid')
            .evaluate(grid => grid.contains(document.activeElement)), 'focus left the board').toBe(false)
        await expect(mark).toHaveAttribute('data-refused', '0,1')

        await page.keyboard.press('Shift+Tab')
        await expect(square(page, '0,1')).toBeFocused()
        await expect(mark, 'coming back is not an action either').toHaveAttribute('data-refused', '0,1')

        await page.keyboard.press('ArrowLeft')   // the board moves its focus: an action
        await expect(square(page, '0,0')).toBeFocused()
        await expect(mark).toHaveCount(0)
    })
})
