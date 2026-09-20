import { test, expect, type Page } from '@playwright/test'
import { openBoard, waitForBoard } from './openBoard'
import { drag } from './play'

/**
 * The archive, and the day that is not taken away (spec P1-6/P1-7, row 18d).
 *
 * The unit tests pin the policy; this pins the wiring, and it is the only place three
 * things are checked at all:
 *
 *   - the corpus really is **fetched**, as static content-hashed files, and only the month
 *     that is needed. A bundled import would pass every unit test and put 10.8 MB in the
 *     JavaScript graph;
 *   - a day reached through the archive restores the board the player left there, out of a
 *     real `localStorage` rather than the in-memory double the unit tests must use;
 *   - the calendar the player sees is bounded by today, so tomorrow's puzzle is unreachable.
 */

const requests: WeakMap<Page, string[]> = new WeakMap()

/** Record every corpus asset the page asks for. */
const watchCorpus = async (page: Page) => {
    const seen: string[] = []
    requests.set(page, seen)
    page.on('request', request => {
        const url = new URL(request.url()).pathname
        if (url.startsWith('/puzzles/')) seen.push(url)
    })
}

const corpusRequests = (page: Page) => requests.get(page) ?? []

const openArchive = async (page: Page) => {
    await page.locator('[data-open-archive]').click()
    await expect(page.locator('[data-archive]')).toBeVisible()
}

/** The dates the grid is offering. */
const offeredDates = (page: Page) =>
    page.locator('[data-archive-day]').evaluateAll(
        els => els.map(el => el.getAttribute('data-archive-day')!))

/** A free cell with a free cell below it, so one downward drag is always legal. */
const freeRun = async (page: Page) => {
    const n = Math.sqrt(await page.locator('[data-cell]').count())
    const rocks = new Set(await page.locator('[data-piece="rock"]').evaluateAll(
        els => els.map(el => el.getAttribute('data-at')!)
    ))
    for (let j = 0; j < n; j++) {
        for (let i = 0; i + 1 < n; i++) {
            if (!rocks.has(`${i},${j}`) && !rocks.has(`${i + 1},${j}`)) return { i, j }
        }
    }
    throw new Error('the served board has no free vertical run')
}

/**
 * What board is on screen, from its content alone.
 *
 * Rock positions plus every target label. No marker is added to production markup for the
 * tests' benefit -- and a fingerprint over the definition is a better witness anyway: it
 * changes exactly when the *puzzle* changes, which is the thing being claimed.
 */
const boardFingerprint = async (page: Page) => {
    const rocks = await page.locator('[data-piece="rock"]').evaluateAll(
        els => els.map(el => el.getAttribute('data-at')).sort().join('|'))
    const labels = await page.locator('[data-line-state]').evaluateAll(
        els => els.map(el => el.textContent).join(','))
    return `${rocks}//${labels}`
}

const pieces = async (page: Page) =>
    (await page.locator('[data-piece]:not([data-piece="rock"])').evaluateAll(
        els => els.map(el => `${el.getAttribute('data-piece')}@${el.getAttribute('data-at')}`)
    )).sort()

test.describe('the corpus is fetched, not bundled', () => {
    test('startup asks for the index and exactly one month', async ({ page }) => {
        await watchCorpus(page)
        await openBoard(page)

        const asked = corpusRequests(page)
        expect(asked.filter(url => url.endsWith('/index.json'))).toHaveLength(1)
        const chunks = asked.filter(url => !url.endsWith('/index.json'))
        expect(chunks, 'one month, not the whole corpus').toHaveLength(1)
        // Content-hashed, which is what lets it be cached forever.
        expect(chunks[0]).toMatch(/\/puzzles\/\d{4}-\d{2}\.[0-9a-f]{16}\.json$/)
    })

    test('the served page carries no puzzle chunk in its JavaScript', async ({ page }) => {
        /*
         * The bundling question, asked of the thing that actually ships. Ten years of
         * content is 10.8 MB minified; an `import` of it would be invisible to every other
         * test here and fatal to the first load.
         */
        await openBoard(page)
        const scripts = await page.locator('script[src]').evaluateAll(
            els => els.map(el => (el as HTMLScriptElement).src))

        for (const src of scripts) {
            const body = await (await page.request.get(src)).text()
            expect(body, `${src} carries chunk content`).not.toMatch(/"mediumBoards"\s*:/)
        }
    })
})

test.describe('the archive', () => {
    test.beforeEach(async ({ page }) => { await openBoard(page) })

    test('opens on the month the player is looking at', async ({ page }) => {
        await openArchive(page)
        const month = await page.locator('[data-archive-month]').innerText()
        expect(month).toMatch(/^\d{4}-\d{2}$/)

        const dates = await offeredDates(page)
        expect(dates.length).toBeGreaterThan(0)
        expect(dates.every(date => date.startsWith(month))).toBe(true)
    })

    test('never offers a day that has not happened yet', async ({ page }) => {
        /*
         * The corpus is published ten years ahead, so every one of those dates exists as a
         * file. Offering them would hand out tomorrow's puzzle, which is the one thing a
         * daily game must not do.
         */
        await openArchive(page)
        const today = await page.evaluate(() => {
            const pad = (n: number) => String(n).padStart(2, '0')
            const now = new Date()
            return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
        })

        for (const date of await offeredDates(page)) expect(date <= today).toBe(true)
        // And there is no way to page forward past the current month.
        await expect(page.locator('[data-archive-next]')).toBeDisabled()
    })

    test('opening it costs no extra fetch for the month already on screen', async ({ page }) => {
        // The cache earns its keep here: the board fetched this month at startup, and the
        // panel is looking at the same one.
        await watchCorpus(page)
        await page.reload()
        await waitForBoard(page)
        const before = corpusRequests(page).length

        await openArchive(page)
        expect(corpusRequests(page).length).toBe(before)
    })

    test('paging to another month fetches exactly that month', async ({ page }) => {
        await watchCorpus(page)
        await page.reload()
        await waitForBoard(page)
        await openArchive(page)
        const before = corpusRequests(page).length

        /*
         * Skipped while today falls in the corpus's own first month, which is where the
         * calendar stands as this is written: there is no earlier month to page to, and no
         * later one either, because the grid stops at today. Both buttons are then correctly
         * disabled and there is nothing to measure. The property itself is pinned in
         * `tests/boardSelection.test.ts`, which does not depend on the date.
         */
        const stuck = await page.locator('[data-archive-prev]').isDisabled()
        test.skip(stuck, 'today is in the first published month; no other month is reachable')

        await page.locator('[data-archive-prev]').click()
        await expect.poll(() => corpusRequests(page).length).toBe(before + 1)
        // Exactly one month, and it is the one now displayed.
        const month = await page.locator('[data-archive-month]').innerText()
        expect(corpusRequests(page).at(-1)).toContain(`/puzzles/${month}.`)
    })

    test('going to an earlier day changes the board and says which day it is', async ({ page }) => {
        await openArchive(page)
        const dates = await offeredDates(page)
        // The first day of the month on screen: always in the past or today, never later.
        const target = dates[0]

        await page.locator(`[data-archive-day="${target}"]`).click()
        await expect(page.locator('[data-archive]')).toBeHidden()

        await expect(page.locator('[data-viewing-date]')).toContainText(target)
    })
})

test.describe('the day you left is still there', () => {
    test('a board played on an archive day is restored on the way back', async ({ page }) => {
        /*
         * The row-17 obligation, end to end and against real browser storage. Leaving a day
         * retires its sessions -- deliberately, so the Map does not grow by nine every
         * midnight -- so this is a genuine restore by `puzzleId`, with the `definitionHash`
         * checked, and not a session that happened to survive.
         */
        await openBoard(page)
        await openArchive(page)
        const dates = await offeredDates(page)
        const older = dates[0]
        const other = dates[1] ?? dates[0]
        test.skip(older === other, 'needs two archive days to move between')

        await page.locator(`[data-archive-day="${older}"]`).click()
        await expect(page.locator('[data-viewing-date]')).toContainText(older)

        const { i, j } = await freeRun(page)
        await drag(page, [i, j], [i + 1, j])
        const placed = await pieces(page)
        expect(placed.length, 'the move landed').toBeGreaterThan(0)

        // Away to another day, then back.
        await openArchive(page)
        await page.locator(`[data-archive-day="${other}"]`).click()
        await expect(page.locator('[data-viewing-date]')).toContainText(other)
        expect(await pieces(page), 'a different day starts empty').toEqual([])

        await openArchive(page)
        await page.locator(`[data-archive-day="${older}"]`).click()
        await expect(page.locator('[data-viewing-date]')).toContainText(older)

        expect(await pieces(page)).toEqual(placed)
    })

    test('an archive day survives a reload, because the date is the key', async ({ page }) => {
        await openBoard(page)
        await openArchive(page)
        const older = (await offeredDates(page))[0]
        await page.locator(`[data-archive-day="${older}"]`).click()
        await expect(page.locator('[data-viewing-date]')).toContainText(older)

        const { i, j } = await freeRun(page)
        await drag(page, [i, j], [i + 1, j])
        const placed = await pieces(page)

        // A reload starts on *today*, which is correct -- the archive is somewhere you go,
        // not somewhere you stay. What must survive is the position.
        await page.reload()
        await waitForBoard(page)
        await openArchive(page)
        await page.locator(`[data-archive-day="${older}"]`).click()
        await expect(page.locator('[data-viewing-date]')).toContainText(older)

        expect(await pieces(page)).toEqual(placed)
    })
})

test.describe('midnight does not take the board away', () => {
    /*
     * The row-17 obligation at its source, in a real browser with a real clock.
     *
     * Everything else here tests the archive; this tests what the archive was needed *for*.
     * `useDayRollover` polls the local calendar day, and before this row the new day was
     * adopted the moment it noticed -- retiring the sessions for the puzzles it stopped
     * serving, which took a half-played board off the screen mid-move.
     *
     * The clock is Playwright's, installed before the page loads so the app's own
     * `new Date()` is the one being moved.
     */
    const justBeforeMidnight = () => {
        const now = new Date()
        now.setHours(23, 59, 0, 0)
        return now
    }

    test('an in-play board survives the day changing, and today is offered', async ({ page }) => {
        await page.clock.install({ time: justBeforeMidnight() })
        await page.addInitScript(() => localStorage.setItem('hasSeenTutorial', 'true'))
        await page.goto('/')
        await waitForBoard(page)

        const { i, j } = await freeRun(page)
        await drag(page, [i, j], [i + 1, j])
        const placed = await pieces(page)
        expect(placed.length, 'the move landed').toBeGreaterThan(0)
        const yesterday = await page.locator('[data-viewing-date]').count()
        expect(yesterday, 'no banner while the day is simply today').toBe(0)

        // Past midnight, and far enough for the poll to notice.
        await page.clock.fastForward('02:00')

        // The banner appears; the board does not move.
        await expect(page.locator('[data-day-banner]')).toBeVisible()
        await expect(page.locator('[data-viewing-date]')).toContainText('A new puzzle is ready')
        expect(await pieces(page), 'the board was taken away').toEqual(placed)

        // And it is one click to today, which really is a different board.
        const held = await boardFingerprint(page)
        await page.locator('[data-go-to-today]').click()
        await expect(page.locator('[data-day-banner]')).toBeHidden()
        await expect.poll(() => boardFingerprint(page)).not.toBe(held)
    })

    test('an untouched board is simply replaced, with nothing to click', async ({ page }) => {
        // The other half of the rule. A prompt for a board nobody has touched would be a
        // daily interruption protecting nothing.
        await page.clock.install({ time: justBeforeMidnight() })
        await page.addInitScript(() => localStorage.setItem('hasSeenTutorial', 'true'))
        await page.goto('/')
        await waitForBoard(page)
        const before = await boardFingerprint(page)

        await page.clock.fastForward('02:00')

        await expect(page.locator('[data-day-banner]')).toBeHidden()
        await expect.poll(() => boardFingerprint(page)).not.toBe(before)
    })
})
