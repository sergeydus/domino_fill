import { test, expect, type Page } from '@playwright/test'
import { BASE_URL, VISUAL_URL } from './server'
import { pinDay, LATE_IN_A_MONTH } from './calendar'
import { ARCHIVE_DAY } from './openBoard'
import type { Attempt } from '../app/challenge/attempt'
import { drag } from './play'
import { arm, heldWrite, instrument, probe, release } from './challengeTransaction'

test.use({ baseURL: VISUAL_URL })

type State = {
    status: string, ready: boolean, covered: boolean, canStart: boolean, canMutate: boolean,
    starting: boolean, assisting: boolean, error: string | null, puzzleId: string,
    attempt: Attempt | null, pendingFinish: { solvedAt: number, solvedOn: string } | null,
    practice: { startedAt: number, ms?: number } | null, finished: boolean,
    board: (number | null)[][], advice: { kind: string } | null,
}
const state = async (page: Page): Promise<State> =>
    JSON.parse(await page.locator('[data-challenge-state]').innerText())
const open = async (page: Page, paused = false) => {
    await pinDay(page, LATE_IN_A_MONTH)
    await page.addInitScript(instrument)
    await page.goto(`/visual/challenge${paused ? '?paused=1' : ''}`)
    await expect(page.locator('[data-challenge-state]')).toBeVisible()
    if (!paused) await expect.poll(async () => (await state(page)).ready).toBe(true)
}
const pair = async (page: Page, isolateSaveRace = false) => {
    const pauseProgressNotice = () => {
        // Register before the coordinator so progress notices cannot mask the specific
        // notification channel or save ordering under test.
        window.addEventListener('storage', event => {
            if (event.key?.startsWith('dominoFill.progress.')) event.stopImmediatePropagation()
        })
    }
    if (isolateSaveRace) await page.addInitScript(pauseProgressNotice)
    await open(page)
    const other = await page.context().newPage()
    if (isolateSaveRace) await other.addInitScript(pauseProgressNotice)
    await open(other)
    return other
}
const start = async (page: Page) => {
    await page.getByRole('button', { name: 'Start fixture' }).click()
    await expect.poll(async () => (await state(page)).covered).toBe(false)
}
const settleTabs = async (...pages: Page[]) => {
    await Promise.all(pages.map(page => page.evaluate(() => window.challengeFixture!.root.challenge!.refresh())))
}
const place = (page: Page, column: number) => page.evaluate(column =>
    window.challengeFixture!.root.boardsStore.currentBoard!.placeToward([0, column], 'down'), column)
const solve = async (page: Page) => {
    expect(await place(page, 0)).toBe(true)
    expect(await place(page, 1)).toBe(true)
}
const result = async (page: Page) => {
    await expect.poll(async () => (await state(page)).attempt?.result ?? null).not.toBeNull()
    return (await state(page)).attempt!.result!
}
const readDatabase = (page: Page) => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('dominoFill.challenge')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
    try {
        return await new Promise<{ attempts: Attempt[], legacy: unknown }>((resolve, reject) => {
            const tx = db.transaction(['attempts', 'meta'], 'readonly')
            const attempts = tx.objectStore('attempts').getAll()
            const legacy = tx.objectStore('meta').get('legacy')
            tx.oncomplete = () => resolve({ attempts: attempts.result, legacy: legacy.result ?? null })
            tx.onabort = () => reject(tx.error)
        })
    } finally { db.close() }
})

test('Start stays covered through request success and an abort, then retries', async ({ page }) => {
    await open(page)
    await arm(page)
    await page.getByRole('button', { name: 'Start fixture' }).click()
    await heldWrite(page)
    expect((await state(page)).covered, 'request success is not a committed Start').toBe(true)
    expect(await place(page, 0), 'input before Start commits').toBe(false)
    await drag(page, [0, 0], [1, 0])
    expect((await state(page)).board, 'real board gesture before Start commits').toEqual([[null, null], [null, null]])
    // Since slice 3a (rule 12) the button itself is off while Start saves; the session's
    // own guard still refuses the same call made directly.
    await expect(page.getByRole('button', { name: 'Hint', exact: true })).toBeDisabled()
    await page.evaluate(() => { void window.challengeFixture!.root.boardsStore.currentBoard!.requestHint() })
    expect((await state(page)).advice).toBeNull()
    await release(page, true)
    await expect.poll(async () => (await state(page)).starting).toBe(false)
    expect((await state(page)).covered, 'aborted Start remains covered').toBe(true)
    expect((await readDatabase(page)).attempts).toEqual([])
    await start(page)
    expect((await readDatabase(page)).attempts).toHaveLength(1)
    await drag(page, [0, 0], [1, 0])
    expect((await state(page)).board, 'real board gesture after Start commits').toEqual([[1, null], [0, null]])
})

test('legacy transaction abort keeps the board covered and permits a real retry', async ({ page }) => {
    await open(page, true)
    await arm(page, 'meta')
    await page.getByRole('button', { name: 'Initialize', exact: true }).click()
    await heldWrite(page)
    expect((await state(page)).covered).toBe(true)
    expect((await state(page)).canStart).toBe(false)
    await release(page, true)
    await expect.poll(async () => (await state(page)).status).toBe('retry')
    expect((await readDatabase(page)).legacy).toBeNull()
    await page.getByRole('button', { name: 'Retry saves' }).click()
    await expect.poll(async () => (await state(page)).ready).toBe(true)
    expect((await readDatabase(page)).legacy).toEqual({ checked: true, marks: [] })
    await start(page)
})

test('competing Starts overlap and both adopt the one committed attempt', async ({ page }) => {
    const other = await pair(page)
    await arm(page)
    await page.getByRole('button', { name: 'Start fixture' }).click()
    await heldWrite(page)
    const before = (await probe(other)).created
    await other.getByRole('button', { name: 'Start fixture' }).click()
    await expect.poll(async () => (await probe(other)).created).toBeGreaterThan(before)
    expect((await probe(page)).active, 'A still holds the store after B creates its transaction').toBe(true)
    expect((await state(other)).starting).toBe(true)
    expect((await state(other)).covered).toBe(true)
    await release(page)
    await expect.poll(async () => (await state(other)).covered).toBe(false)
    const saved = (await readDatabase(other)).attempts
    expect(saved).toHaveLength(1)
    expect((await state(page)).attempt).toEqual(saved[0])
    expect((await state(other)).attempt).toEqual(saved[0])
})

test('competing finishes overlap and retain the first result', async ({ page }) => {
    const other = await pair(page, true)
    await start(other)
    await start(page)
    await settleTabs(page, other)
    await arm(page)
    await solve(page)
    await heldWrite(page)
    const first = (await probe(page)).writes[0] as Attempt
    const before = (await probe(other)).created
    await solve(other)
    await expect.poll(async () => (await probe(other)).created).toBeGreaterThan(before)
    expect((await probe(page)).active).toBe(true)
    expect((await state(other)).pendingFinish).not.toBeNull()
    await release(page)
    expect(await result(other)).toEqual(first.result)
    expect((await readDatabase(other)).attempts[0].result).toEqual(first.result)
})

for (const advice of ['Hint', 'Check'] as const) {
    test(`${advice} remains unpublished after request success and abort`, async ({ page }) => {
        await open(page)
        await start(page)
        await arm(page)
        await page.getByRole('button', { name: advice, exact: true }).click()
        await heldWrite(page)
        expect((await state(page)).advice, 'advice waits for transaction completion').toBeNull()
        expect(await place(page, 0), 'assistance freezes mutations').toBe(false)
        await release(page, true)
        await expect.poll(async () => (await state(page)).assisting).toBe(false)
        expect((await state(page)).advice, 'aborted advice is never published').toBeNull()
        expect((await readDatabase(page)).attempts[0].assisted).toBe(false)
        await page.getByRole('button', { name: advice, exact: true }).click()
        await expect.poll(async () => (await state(page)).advice).not.toBeNull()
        expect((await readDatabase(page)).attempts[0].assisted).toBe(true)
    })

    for (const first of ['advice', 'finish'] as const) {
        test(`${advice} versus finish, ${first} commits first`, async ({ page }) => {
            const other = await pair(page, true)
            // The finisher starts using its own page clock. pinDay is calendar pinning;
            // two pages' absolute test clocks are not a shared stopwatch.
            await start(other)
            await start(page)
            await settleTabs(page, other)
            await place(other, 0)
            const owner = first === 'advice' ? page : other
            const queued = first === 'advice' ? other : page
            await arm(owner)
            if (first === 'advice') await page.getByRole('button', { name: advice, exact: true }).click()
            else expect(await place(other, 1)).toBe(true)
            await heldWrite(owner)
            const before = (await probe(queued)).created
            if (first === 'advice') expect(await place(other, 1)).toBe(true)
            else await page.getByRole('button', { name: advice, exact: true }).click()
            await expect.poll(async () => (await probe(queued)).created).toBeGreaterThan(before)
            expect((await probe(owner)).active, 'the competing transaction was created during the hold').toBe(true)
            expect((await state(page)).advice).toBeNull()
            await release(owner)
            const finished = await result(other)
            // Timed either way since 2026-10-11 (a hint keeps the clock); the advice that
            // committed first is what marks the attempt as hinted.
            expect(finished.kind).toBe('solved')
            expect((await state(other)).attempt!.assisted).toBe(first === 'advice')
            await expect.poll(async () => (await state(page)).assisting).toBe(false)
            if (first === 'finish') expect((await state(page)).advice, 'late advice is suppressed').toBeNull()
            else await expect.poll(async () => (await state(page)).advice).not.toBeNull()
            expect((await readDatabase(page)).attempts[0].result).toEqual(finished)
        })
    }
}

test('a lost finish recovers on reload and Practice preserves the fixed result', async ({ page }) => {
    await open(page)
    await start(page)
    await arm(page)
    await solve(page)
    await heldWrite(page)
    const pending = (await state(page)).pendingFinish!
    const id = (await state(page)).puzzleId
    const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`dominoFill.progress.v2.${id}`)!), id)
    expect(saved.solveEvidence.solvedAt).toBe(pending.solvedAt)
    expect(saved.solveEvidence.solvedOn).toBe(LATE_IN_A_MONTH)
    // Since slice 3a (rule 12) the button is off while the finish saves; the session's own
    // guard still refuses a direct Reset.
    await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled()
    await page.evaluate(() => window.challengeFixture!.root.boardsStore.currentBoard!.reset())
    expect((await state(page)).board, 'Reset is blocked while the first finish is pending').toEqual(saved.board)
    // Stop automatic retries, abort the real finish transaction, then reopen the real page.
    await page.evaluate(() => window.challengeFixture!.stop())
    await release(page, true)
    await expect.poll(async () => (await probe(page)).active).toBe(false)
    expect((await readDatabase(page)).attempts[0].result).toBeUndefined()
    await page.reload()
    await expect.poll(async () => (await state(page)).ready).toBe(true)
    await page.getByRole('button', { name: 'Board one', exact: true }).click()
    const recovered = await result(page)
    expect((await state(page)).attempt!.finishedAt).toBe(pending.solvedAt)
    expect((await state(page)).board).toEqual(saved.board)
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect.poll(async () => (await state(page)).practice).not.toBeNull()
    await solve(page)
    await expect.poll(async () => (await state(page)).practice?.ms).not.toBeUndefined()
    expect((await state(page)).attempt!.result).toEqual(recovered)
    expect((await state(page)).finished).toBe(true)
    expect((await readDatabase(page)).attempts[0].result).toEqual(recovered)
    const practice = await page.evaluate(id => JSON.parse(localStorage.getItem(`dominoFill.progress.v2.${id}`)!), id)
    expect(practice.solveEvidence, 'Practice emits no recovery evidence').toBeUndefined()
})

for (const channel of ['BroadcastChannel', 'focus'] as const) {
    test(`${channel} reconciles another tab's fixed result`, async ({ page }) => {
        if (channel === 'focus') await page.context().addInitScript(() => {
            Object.defineProperty(window, 'BroadcastChannel', { value: undefined })
        })
        const other = await pair(page, true)
        await start(other)
        await start(page)
        await settleTabs(page, other)
        await solve(page)
        const finished = await result(page)
        if (channel === 'focus') {
            expect((await state(other)).attempt?.result ?? null, 'no BroadcastChannel or progress wake').toBeNull()
            await other.evaluate(() => window.dispatchEvent(new Event('focus')))
        }
        await expect.poll(async () => (await state(other)).attempt?.result ?? null).toEqual(finished)
        expect((await state(other)).finished).toBe(true)
    })
}

test('the production page plays an archive day casually and records no attempt for it', async ({ page }) => {
    // Until slice 3b this checked the public page wrote no challenge storage at all. It is
    // the challenge now (rule 16), so its legacy check runs at opening; casual play is an
    // archive day's, and that must still record nothing.
    await pinDay(page, LATE_IN_A_MONTH)
    await page.goto(`${BASE_URL}/`)
    await page.getByRole('button', { name: 'Skip', exact: true }).click()
    await expect(page.locator('[data-challenge-cover="ready"]')).toBeVisible()
    await page.getByRole('button', { name: 'Archive' }).click()
    await page.locator(`[data-archive-day="${ARCHIVE_DAY}"]`).click()
    await expect(page.getByRole('grid')).toBeVisible()
    await expect(page.locator('[data-challenge-cover]')).toHaveCount(0)
    expect(await readDatabase(page)).toEqual({ attempts: [], legacy: { checked: true, marks: [] } })
    await page.getByRole('button', { name: 'Hint', exact: true }).click()
    await expect(page.locator('[data-advice-kind="hint"]')).toBeVisible()
    const free = await page.locator('[data-cell]').evaluateAll(cells => {
        const empty = new Set(cells.filter(cell => !cell.getAttribute('aria-label')!.includes('rock'))
            .map(cell => cell.getAttribute('data-cell')!))
        for (const key of empty) {
            const [row, column] = key.split(',').map(Number)
            if (empty.has(`${row + 1},${column}`)) return [row, column]
        }
        return null
    })
    expect(free, 'public board has an available placement').not.toBeNull()
    await drag(page, [free![0], free![1]], [free![0] + 1, free![1]])
    await expect(page.locator('[data-piece]:not([data-piece="rock"])')).toHaveCount(1)
    expect((await readDatabase(page)).attempts).toEqual([])
})
