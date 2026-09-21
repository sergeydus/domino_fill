import { test, expect, type Page } from '@playwright/test'
import { openBoard } from './openBoard'
import { drag } from './play'

/**
 * What assistive technology actually receives (spec P1-8, row 19).
 *
 * This is a browser suite because every claim in P1-8 is about the *computed* accessibility
 * tree, and nothing else can compute it. A unit test can assert that an `aria-label`
 * attribute is present in the markup; only a browser can say whether it reached anybody --
 * and the distinction is not academic here, because measuring it is what found the defect:
 * `aria-label` on a role-less `div` is dropped, and three separate parts of this UI were
 * writing labels nobody could hear.
 *
 * `ariaSnapshot()` is used rather than attribute assertions wherever the question is "what
 * does a screen reader get", for the same reason.
 */

const grid = (page: Page) => page.locator('[role="grid"]')

/** Every tab stop from the top of the page, in order, named the way AT would name them. */
const tabOrder = async (page: Page, limit = 20) => {
    await page.locator('body').click({ position: { x: 2, y: 2 } })
    const stops: string[] = []
    for (let i = 0; i < limit; i++) {
        await page.keyboard.press('Tab')
        const who = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null
            if (!el || el === document.body) return 'BODY'
            const name = el.getAttribute('aria-label') ?? (el.textContent || '').trim()
            return `${el.getAttribute('role') ?? el.tagName.toLowerCase()}:${name.slice(0, 40)}`
        })
        if (who === 'BODY') break
        stops.push(who)
    }
    return stops
}

test.beforeEach(async ({ page }) => { await openBoard(page) })

test.describe('the board is a grid that actually contains cells', () => {
    test('every square reaches the accessibility tree, named', async ({ page }) => {
        /*
         * The defect this row exists for. Measured before the fix, the entire 6x6 board
         * computed to
         *
         *     grid "Domino board": img, img, img, img, img, img, img, img
         *
         * -- eight unnamed pictures for the pieces on it and not one of the thirty-six
         * squares. `role="grid"` with no rows and no gridcells is a broken contract, not a
         * partial one: it promises a table of cells and then delivers nothing to navigate.
         */
        const snapshot = await grid(page).ariaSnapshot()
        const size = Math.sqrt(await page.locator('[data-cell]').count())

        expect((snapshot.match(/- row/g) ?? []).length).toBe(size)
        expect((snapshot.match(/- gridcell/g) ?? []).length).toBe(size * size)
        // Named, not merely present: an unnamed gridcell is a cell you cannot identify.
        expect(snapshot).toContain('gridcell "Row 1, column 1')
        expect(snapshot).toContain(`gridcell "Row ${size}, column ${size}`)
    })

    test('a square says where it is and what is on it', async ({ page }) => {
        const label = await page.locator('[data-cell="0,0"]').getAttribute('aria-label')
        expect(label).toMatch(/^Row 1, column 1, /)
        expect(label).toMatch(/empty|rock|domino/)
    })

    test('the grid declares its own size', async ({ page }) => {
        // So a screen reader can say "row 3 of 6" rather than leaving the player counting.
        const size = Math.sqrt(await page.locator('[data-cell]').count())
        await expect(grid(page)).toHaveAttribute('aria-rowcount', String(size))
        await expect(grid(page)).toHaveAttribute('aria-colcount', String(size))
        await expect(grid(page)).toHaveAttribute('aria-label', new RegExp(`${size} by ${size}`))
    })
})

test.describe('the roving tabindex', () => {
    test('the whole board is one tab stop, not sixty-four', async ({ page }) => {
        // The failure mode P1-8 names outright. 64 focusable cells would bury every
        // control after the board under a minute of tabbing.
        const stops = await tabOrder(page)
        const inBoard = await page.evaluate(() =>
            [...document.querySelectorAll('[data-cell]')]
                .filter(el => (el as HTMLElement).tabIndex === 0).length)
        expect(inBoard).toBeLessThanOrEqual(1)
        expect(stops.filter(s => s.startsWith('gridcell')).length).toBeLessThanOrEqual(1)
    })

    test('and it is still one tab stop once a square has the focus', async ({ page }) => {
        /*
         * The spec sketches the roving tabindex as "container `tabIndex={0}`, focused cell
         * `0`, rest `-1`", which leaves the board holding *two* stops once a cell is
         * focused: the container comes first in document order, so Tab lands on the board,
         * then on a square inside it, then leaves. Handing the stop over to the cell is
         * the amendment, and this is the test that makes it a claim rather than a comment
         * -- a mutation restoring the literal sketch survived everything else in this file.
         */
        await grid(page).focus()
        await page.keyboard.press('ArrowDown')           // a cell now holds the focus
        await expect(page.locator('[data-cell="0,0"]')).toBeFocused()

        const stops = await tabOrder(page)
        const board = stops.filter(s => s.startsWith('grid:') || s.startsWith('gridcell:'))
        expect(board, `tab order was ${JSON.stringify(stops)}`).toHaveLength(1)
    })

    test('focus follows the keyboard from square to square', async ({ page }) => {
        /*
         * The point of the roving tabindex, and the reason it is worth the trouble: what a
         * screen reader announces is driven by where DOM focus *is*. Move focus with the
         * arrow keys and each square reads itself out, with no live region in the loop.
         */
        await grid(page).focus()
        await page.keyboard.press('ArrowDown')
        await expect(page.locator('[data-cell="0,0"]')).toBeFocused()

        await page.keyboard.press('ArrowRight')
        await expect(page.locator('[data-cell="0,1"]')).toBeFocused()
        await page.keyboard.press('ArrowDown')
        await expect(page.locator('[data-cell="1,1"]')).toBeFocused()
    })

    test('the square that holds the focus is the square that holds the tab stop', async ({ page }) => {
        await grid(page).focus()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowRight')

        const tabbable = await page.evaluate(() =>
            [...document.querySelectorAll('[data-cell]')]
                .filter(el => (el as HTMLElement).tabIndex === 0)
                .map(el => el.getAttribute('data-cell')))
        expect(tabbable).toEqual(['0,1'])
    })

    test('a half-made move survives the focus moving', async ({ page }) => {
        /*
         * The hazard the roving tabindex introduces, and it is not hypothetical: React's
         * `onBlur` is `focusout`, which bubbles, so moving focus between two cells fires
         * it on the grid -- measured, with `relatedTarget` set to the sibling cell -- and
         * the grid's blur handler cancels the gesture. Removing the containment guard and
         * running the suite failed **nineteen** tests across board, completion, feedback,
         * persistence and undo: with focus now living on the cells, every placement that
         * moves it was cancelling the gesture that was making it.
         *
         * The direction is read off the served board rather than assumed. The first
         * version of this test pressed ArrowRight from 0,0, where today's puzzle happens
         * to have a rock -- so the key was legitimately refused and the test failed
         * against correct code.
         */
        await grid(page).focus()
        await page.keyboard.press('ArrowDown')       // focus 0,0
        await page.keyboard.press('Enter')           // anchor it

        const candidate = await page.locator('[data-candidate]').first().getAttribute('data-candidate')
        test.skip(candidate === null, 'the served board offers nothing from 0,0')

        const [ci] = candidate!.split(',').map(Number)
        await page.keyboard.press(ci === 1 ? 'ArrowDown' : 'ArrowRight')

        /*
         * The move completed, so the anchor was still there when the arrow arrived.
         *
         * A domino is one overlay element carrying the `data-at` of its *anchor* -- the
         * top-left of the pair -- not of the cell it grew into, which is why this looks
         * for a piece at 0,0 and not at the candidate.
         */
        await expect(page.locator('[data-piece][data-at="0,0"]')).toHaveCount(1)
        await expect(page.locator('[data-anchor]')).toHaveCount(0)
    })

    test('the board does not snatch focus back from a control being used', async ({ page }) => {
        /*
         * The other half of moving real focus around: the effect that focuses a square
         * must only ever *move* focus that is already inside the board, never pull it in.
         *
         * The sequence is specific, and was found by probing rather than assumed -- two
         * earlier guesses at it were wrong. `undo()` sets the focused cell to the anchor
         * of the move it pops, so the *first* undo usually sets it to where it already
         * was and the effect never runs. It takes a second undo, reaching back to an
         * earlier move's anchor, to change it: measured, the focused cell goes 1,1 -> 0,0
         * while the player's focus is on the Undo button. Unguarded, that yanks focus into
         * the grid and the next press of Undo lands on nothing.
         */
        const rocks = new Set(await page.locator('[data-piece="rock"]').evaluateAll(
            els => els.map(el => el.getAttribute('data-at')!)))
        const n = Math.sqrt(await page.locator('[data-cell]').count())
        const runs: [number, number][] = []
        for (let j = 0; j < n && runs.length < 2; j++) {
            for (let i = 0; i + 1 < n; i++) {
                if (rocks.has(`${i},${j}`) || rocks.has(`${i + 1},${j}`)) continue
                runs.push([i, j])
                break
            }
        }
        expect(runs, 'the served board has two free vertical runs').toHaveLength(2)
        for (const [i, j] of runs) await drag(page, [i, j], [i + 1, j])

        const inGrid = () => page.evaluate(() =>
            document.querySelector('[role="grid"]')!.contains(document.activeElement))

        for (let press = 0; press < 2; press++) {
            await page.locator('[data-undo]').focus()
            await page.keyboard.press('Enter')
            /*
             * Asserted as "not inside the grid" rather than "still on Undo": the last undo
             * disables that button and a browser blurs a control it has just disabled, so
             * insisting on Undo would fail against correct code for an unrelated reason.
             */
            expect(await inGrid(), `focus was pulled into the board by undo ${press + 1}`)
                .toBe(false)
        }
    })

    test('leaving the board entirely still cancels the gesture', async ({ page }) => {
        // The guard must not overshoot: focus genuinely leaving is still a cancel.
        await grid(page).focus()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')

        await page.locator('[data-reset]').focus()
        await expect(page.locator('[data-anchor]')).toHaveCount(0)
        await expect(page.locator('[data-candidate]')).toHaveCount(0)
    })
})

test.describe('the level arrows', () => {
    test('are buttons, reachable by Tab and named', async ({ page }) => {
        /*
         * The codebase's oldest accessibility complaint, cited by name in P1-5's own
         * source. Measured before this row, the page's complete tab order was Easy,
         * Medium, Hard, the board, Check, Hint, Reset, Archive -- the arrows appeared
         * nowhere, so a keyboard could reach every control in the game except the one that
         * changes which puzzle you play.
         */
        const stops = await tabOrder(page)
        expect(stops.some(s => /next puzzle/i.test(s))).toBe(true)

        await expect(page.getByRole('button', { name: /next puzzle/i })).toBeVisible()
        await expect(page.getByRole('button', { name: /previous puzzle/i })).toBeVisible()
    })

    test('and carry nothing else into the tree', async ({ page }) => {
        /*
         * The arrow is one decorative path, drawn twice and rotated. Without
         * `aria-hidden` it is not harmless: measured, the button computes to
         *
         *     button "Next puzzle, 1 of 3":
         *       - img
         *
         * -- the name is unaffected, because `aria-label` wins, but the button gains an
         * unnamed picture inside it for a screen reader to walk into and announce. With
         * the attribute the button is a leaf. Checked by comparison rather than reasoned
         * about: the first version of this row had no test for it and the mutation that
         * removed the attribute survived.
         */
        const snapshot = await page.locator('[data-level="next"]').ariaSnapshot()
        expect(snapshot.trim()).toBe('- button "Next puzzle, 1 of 3"')
    })

    test('work from the keyboard alone', async ({ page }) => {
        const next = page.getByRole('button', { name: /next puzzle/i })
        await next.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('button', { name: /next puzzle, 2 of 3/i })).toBeVisible()
    })

    test('say they are unavailable rather than merely looking grey', async ({ page }) => {
        /*
         * `filter: grayscale` reaches nobody using a screen reader, and the old handler
         * simply did nothing when pressed -- a control that silently ignores you.
         *
         * Both ends, because they are separate props: a mutation that dropped `disabled`
         * from the *next* arrow survived a version of this test that only checked level 1,
         * where next is enabled anyway and the assertion said nothing about it.
         */
        const previous = page.getByRole('button', { name: /previous puzzle/i })
        const next = page.getByRole('button', { name: /next puzzle/i })

        await expect(previous).toBeDisabled()
        await expect(next).toBeEnabled()

        await next.click()
        await expect(previous).toBeEnabled()
        await expect(next).toBeEnabled()

        await next.click()      // level 3 of 3: the far end
        await expect(page.getByRole('button', { name: /next puzzle, 3 of 3/i })).toBeDisabled()
        await expect(previous).toBeEnabled()
    })
})

test.describe('difficulty', () => {
    test('says which one is selected, not only which one is blue', async ({ page }) => {
        /*
         * Measured before this row: three buttons, no state on any of them, and the only
         * signal was `background-color`. Unreadable to a screen reader and to anyone who
         * cannot separate that blue from that grey.
         */
        await expect(page.getByRole('button', { name: /easy/i })).toHaveAttribute('aria-pressed', 'true')
        await expect(page.getByRole('button', { name: /medium/i })).toHaveAttribute('aria-pressed', 'false')

        await page.getByRole('button', { name: /medium/i }).click()
        await expect(page.getByRole('button', { name: /medium/i })).toHaveAttribute('aria-pressed', 'true')
        await expect(page.getByRole('button', { name: /easy/i })).toHaveAttribute('aria-pressed', 'false')
    })

    test('and shows it in a channel that is not colour', async ({ page }) => {
        // The rule D10-g established for the line labels, applied to the one other place
        // in the UI where state was carried by colour alone.
        const selected = page.locator('[data-difficulty][data-selected]')
        await expect(selected).toHaveCount(1)
        await expect(selected).toHaveCSS('font-weight', '700')
    })
})

test.describe('the scoring key', () => {
    test('its explanations are actually exposed', async ({ page }) => {
        /*
         * P1-8 asks for real buttons here. The tray stopped being a mode selector in P1-1
         * and is now a legend, so a button would be a control that does nothing -- but the
         * defect underneath was real and is the one fixed: measured, both entries reached
         * the accessibility tree as bare unnamed `img` nodes, because `aria-label` on a
         * role-less `div` is ignored. The text was written and then dropped.
         */
        const snapshot = await page.locator('[data-legend]').ariaSnapshot()
        expect(snapshot).toMatch(/img "An upright domino scores 1/)
        expect(snapshot).toMatch(/img "A flat domino scores 0/)
    })
})

test.describe('the line targets', () => {
    test('name their own line, and are exposed at all', async ({ page }) => {
        // Measured before this row, the whole strip computed to one anonymous text run --
        // `3 2 2 2 3 2 3 3 2 2 4 0` -- with every state description discarded.
        const snapshot = await page.locator('[data-board-shell]').ariaSnapshot()
        expect(snapshot).toMatch(/img "Row 1, target/)
        expect(snapshot).toMatch(/img "Column 1, target/)
    })
})

test.describe('reduced motion', () => {
    test('the board does not shake when the player asked for less motion', async ({ page }) => {
        /*
         * `MotionConfig reducedMotion="user"` in one place at the client boundary, and
         * this is what it has to buy. Nothing in the app honoured the setting before this
         * row -- searched for, and absent from every component and stylesheet -- while the
         * board shakes, the arrows scale, the labels tween and the completion card
         * animates in.
         *
         * The shake is the one to assert on: it is a transform, which is precisely the
         * category `"user"` drops, and it is the most vestibular-hostile thing here.
         */
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.reload()
        await page.locator('[data-board-shell]').waitFor()

        // A move the rules refuse: into the wall from the top row.
        await grid(page).focus()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await page.keyboard.press('ArrowUp')

        const offsets = new Set<string>()
        for (let i = 0; i < 6; i++) {
            offsets.add(await page.locator('.board-grid').evaluate(
                el => getComputedStyle(el).transform))
            await page.waitForTimeout(30)
        }
        // Every sample identical: the grid never moved.
        expect([...offsets]).toHaveLength(1)
    })

    test('and shakes when they did not', async ({ page }) => {
        // Otherwise the test above passes on a board that simply never shakes.
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await page.reload()
        await page.locator('[data-board-shell]').waitFor()

        await grid(page).focus()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        await page.keyboard.press('ArrowUp')

        const offsets = new Set<string>()
        for (let i = 0; i < 8; i++) {
            offsets.add(await page.locator('.board-grid').evaluate(
                el => getComputedStyle(el).transform))
            await page.waitForTimeout(25)
        }
        expect(offsets.size).toBeGreaterThan(1)
    })
})
