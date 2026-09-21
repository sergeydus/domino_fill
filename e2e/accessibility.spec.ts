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

/** A free cell with a free cell below it, so one downward drag is always legal. */
const freeRun = async (page: Page) => {
    const n = Math.sqrt(await page.locator('[data-cell]').count())
    const rocks = new Set(await page.locator('[data-piece="rock"]').evaluateAll(
        els => els.map(el => el.getAttribute('data-at')!)))
    for (let j = 0; j < n; j++) {
        for (let i = 0; i + 1 < n; i++) {
            if (!rocks.has(`${i},${j}`) && !rocks.has(`${i + 1},${j}`)) return { i, j }
        }
    }
    throw new Error('the served board has no free vertical run')
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

    test('and nothing else, before or after a piece is placed', async ({ page }) => {
        /*
         * The visual piece layer is `pointer-events: none` and was described as purely
         * decorative, which was true of the pointer and false of the accessibility tree:
         * measured, its dominoes and rocks were eight unnamed `img` nodes *inside*
         * `role="grid"`. Before the cells were named they were the only thing in it. They
         * say nothing about which square they sit on or what they are, and naming the
         * cells does not remove them -- it leaves the noise alongside the signal.
         *
         * Asserted after a placement as well, because the layer grows a node per domino:
         * a version of this hiding only what was on screen at load would pass and then
         * leak a fresh unnamed image on every move.
         */
        const unnamedImages = async () =>
            ((await grid(page).ariaSnapshot()).match(/- img\s*$/gm) ?? []).length

        expect(await unnamedImages(), 'before playing').toBe(0)

        const { i, j } = await freeRun(page)
        await drag(page, [i, j], [i + 1, j])
        await expect(page.locator(`[data-piece][data-at="${i},${j}"]`)).toHaveCount(1)

        expect(await unnamedImages(), 'after placing a domino').toBe(0)

        // The signal is still there: rows, cells, and cells that describe what is on them.
        const snapshot = await grid(page).ariaSnapshot()
        const size = Math.sqrt(await page.locator('[data-cell]').count())
        expect((snapshot.match(/- gridcell/g) ?? []).length).toBe(size * size)
        expect(snapshot).toMatch(new RegExp(`gridcell "Row ${i + 1}, column ${j + 1}, top half`))
        expect(snapshot).toMatch(new RegExp(`gridcell "Row ${i + 2}, column ${j + 1}, bottom half`))

        // And a rock is described by the square it is on, not by an anonymous picture.
        const rock = await page.locator('[data-piece="rock"]').first().getAttribute('data-at')
        if (rock !== null) {
            const [ri, rj] = rock.split(',').map(Number)
            expect(snapshot).toContain(`gridcell "Row ${ri + 1}, column ${rj + 1}, rock"`)
        }
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

    test('is one tab stop before anything has been touched', async ({ page }) => {
        /*
         * Counted over the grid **and** its cells, from a cold page, before any focus or
         * key event.
         *
         * The first version of this row got this wrong and the first version of this
         * suite could not see it: the grid took `tabIndex={0}` while `focusedCell` was
         * null and cell `0,0` took it at the same time, so the untouched board held two
         * stops. The test that was supposed to catch it counted only `[data-cell]`, which
         * excludes the grid and therefore reported one; the other test ran after an arrow
         * key, by which point the grid had already given its stop up. Measured on the
         * shipped build: `{ gridTabIndex: 0, cellsWithZero: ["0,0"], total: 2 }`.
         */
        const stops = await page.evaluate(() => {
            const grid = document.querySelector('[role="grid"]') as HTMLElement
            const cells = [...grid.querySelectorAll('[data-cell]')] as HTMLElement[]
            return [
                ...(grid.tabIndex === 0 ? ['the grid itself'] : []),
                ...cells.filter(c => c.tabIndex === 0).map(c => `cell ${c.getAttribute('data-cell')}`),
            ]
        })
        expect(stops).toEqual(['cell 0,0'])
    })

    test('entering by Tab puts the keyboard on a square, and the first arrow moves', async ({ page }) => {
        /*
         * The consequence of the two-stop bug that a player would actually feel. Tab
         * landed on the grid rather than on a square, which left `focusedCell` null, and
         * the store spends the first arrow key initialising it -- "entering the board is
         * itself the action". Measured: tab in, press Right, and you are on `0,0`; press
         * Right again and only then do you reach `0,1`. A keypress that visibly does
         * nothing reads as a broken board.
         *
         * Fixed by having a cell tell the store when it takes focus, so arriving *is*
         * being somewhere. Driven through real Tab presses rather than `.focus()`,
         * because `.focus()` is exactly what hid the problem.
         */
        await page.locator('body').click({ position: { x: 2, y: 2 } })
        let landed: string | null = null
        for (let i = 0; i < 12 && landed === null; i++) {
            await page.keyboard.press('Tab')
            landed = await page.evaluate(() =>
                (document.activeElement as HTMLElement).getAttribute('data-cell'))
        }
        expect(landed, 'Tab never reached a square of the board').toBe('0,0')

        // Arriving is being somewhere: the store already agrees before any key is pressed.
        await expect(page.locator('[data-focus]')).toHaveAttribute('data-focus', '0,0')

        await page.keyboard.press('ArrowRight')
        await expect(page.locator('[data-focus]')).toHaveAttribute('data-focus', '0,1')
        await expect(page.locator('[data-cell="0,1"]')).toBeFocused()
    })

    test('the square that takes focus is the square the store is on', async ({ page }) => {
        /*
         * The contract: whatever puts DOM focus on a square, the store is on *that*
         * square -- so the highlight, the arrow keys and the browser cannot disagree
         * about where the keyboard is.
         *
         * Driven by a bare `.focus()` on a cell that is not the tab stop, because that is
         * the only route that isolates this handler. A non-initial gridcell carries
         * `tabIndex=-1`, which keeps it out of the tab order while leaving it
         * programmatically focusable -- which is how assistive technology moves focus in
         * a grid, and how application code would. A `.click()` cannot test it: the click
         * also fires `pointerDown`, which assigns `focusedCell` itself and would mask any
         * mistake here. That is exactly the error this test replaces -- an earlier version
         * clicked, a constant `[0, 0]` survived it, and the survivor was written off as an
         * equivalent mutant on the strength of reasoning that never checked this route.
         *
         * Measured: focus `3,4`, the store reads `3,4`, and the next arrow moves relative
         * to it rather than from the origin.
         */
        await page.locator('[data-cell="3,4"]').focus()

        await expect(page.locator('[data-focus]')).toHaveAttribute('data-focus', '3,4')
        await expect(page.locator('[data-cell="3,4"]')).toBeFocused()

        // Moving on from where focus actually is, not from where it started.
        await page.keyboard.press('ArrowRight')
        await expect(page.locator('[data-focus]')).toHaveAttribute('data-focus', '3,5')
        await expect(page.locator('[data-cell="3,5"]')).toBeFocused()
    })

    test('and the pointer agrees with it too', async ({ page }) => {
        /*
         * A small behaviour change worth pinning separately: before row 19 the focus ring
         * appeared only once the keyboard had been used, and clicking a square left it
         * wherever it was. It now follows real DOM focus.
         *
         * This one goes through `pointerDown` as well as `onFocus`, so it says the two
         * agree -- not what either does alone.
         */
        const rock = await page.locator('[data-piece="rock"]').first().getAttribute('data-at')
        test.skip(rock === null, 'the served board has no rocks')

        // A rock, so the click places nothing and there is no move to confuse the ring.
        await page.locator(`[data-cell="${rock}"]`).click()
        await expect(page.locator('[data-focus]')).toHaveAttribute('data-focus', rock!)
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
    /*
     * They are addressed by their `data-level` marker rather than by name, because the
     * name is the thing under test and changes with the level. `[data-level="next"]` is
     * the control; what it calls itself is asserted, not assumed.
     */
    const previous = (page: Page) => page.locator('[data-level="previous"]')
    const next = (page: Page) => page.locator('[data-level="next"]')

    test('are buttons, reachable by Tab and named', async ({ page }) => {
        /*
         * The codebase's oldest accessibility complaint, cited by name in P1-5's own
         * source. Measured before this row, the page's complete tab order was Easy,
         * Medium, Hard, the board, Check, Hint, Reset, Archive -- the arrows appeared
         * nowhere, so a keyboard could reach every control in the game except the one that
         * changes which puzzle you play.
         */
        const stops = await tabOrder(page)
        expect(stops.some(s => /go to puzzle/i.test(s))).toBe(true)

        await expect(page.getByRole('button', { name: 'Go to puzzle 2 of 3' })).toBeVisible()
    })

    test('name where they go, not which way they point', async ({ page }) => {
        /*
         * "Next puzzle, 1 of 3" was the first attempt at this and reads two ways: the
         * number is meant to say where you *are*, but on a button that says "next" it
         * sounds like a destination, so the control that takes you to puzzle 2 announces
         * the number 1. A button's name should answer "what happens if I press this".
         *
         * The position moves to the group, which is where a screen reader looks for the
         * context around a set of controls.
         */
        await expect(page.locator('[role="group"][aria-label^="Puzzle"]'))
            .toHaveAttribute('aria-label', 'Puzzle 1 of 3')
        await expect(next(page)).toHaveAttribute('aria-label', 'Go to puzzle 2 of 3')

        await next(page).click()

        await expect(page.locator('[role="group"][aria-label^="Puzzle"]'))
            .toHaveAttribute('aria-label', 'Puzzle 2 of 3')
        await expect(next(page)).toHaveAttribute('aria-label', 'Go to puzzle 3 of 3')
        await expect(previous(page)).toHaveAttribute('aria-label', 'Go to puzzle 1 of 3')
    })

    test('and carry nothing else into the tree', async ({ page }) => {
        /*
         * The arrow is one decorative path, drawn twice and rotated. Without
         * `aria-hidden` it is not harmless: measured, the button computes to
         *
         *     button "Go to puzzle 2 of 3":
         *       - img
         *
         * -- the name is unaffected, because `aria-label` wins, but the button gains an
         * unnamed picture inside it for a screen reader to walk into and announce. With
         * the attribute the button is a leaf. Checked by comparison rather than reasoned
         * about: the first version of this row had no test for it and the mutation that
         * removed the attribute survived.
         */
        const snapshot = await next(page).ariaSnapshot()
        expect(snapshot.trim()).toBe('- button "Go to puzzle 2 of 3"')
    })

    test('work from the keyboard alone', async ({ page }) => {
        await next(page).focus()
        await page.keyboard.press('Enter')
        await expect(next(page)).toHaveAttribute('aria-label', 'Go to puzzle 3 of 3')
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
        await expect(previous(page)).toBeDisabled()
        await expect(next(page)).toBeEnabled()

        await next(page).click()
        await expect(previous(page)).toBeEnabled()
        await expect(next(page)).toBeEnabled()

        await next(page).click()      // puzzle 3 of 3: the far end
        await expect(next(page)).toBeDisabled()
        await expect(previous(page)).toBeEnabled()
        // The disabled button names the puzzle you are already on, not a puzzle 4.
        await expect(next(page)).toHaveAttribute('aria-label', 'Go to puzzle 3 of 3')
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
