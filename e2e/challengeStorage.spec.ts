import { test, expect, type Page } from '@playwright/test'

/**
 * The premise the challenge's attempt store rests on (Ruleset v1, rule 15; NEXT-STEPS,
 * "Challenge slice 1"), measured in a real browser rather than read in the spec.
 *
 * Two pages in one browser context share IndexedDB as two tabs do. The store's guarantee --
 * two tabs can't both start an attempt or fix two results -- holds only if the browser runs
 * their overlapping `readwrite` transactions one at a time. So: page A holds a `readwrite`
 * transaction open; page B creates its own on the same store *while A's is still active*;
 * and A's must complete before B's first request succeeds. Proving the overlap, not just
 * the order, is the point (codex): two transactions that never overlapped would pass an
 * order check by accident.
 *
 * This tests the browser, on a raw test database, not `attemptStore.ts`, which nothing on
 * screen uses yet; the two-tab tests through the module come with the wiring. The harness
 * drives Chromium only, so Firefox and Safari aren't measured.
 *
 * Measured while writing this, 2026-10-09: Chromium made B wait even when its transaction
 * was on a *different* store of the same database -- stricter than the spec, which only
 * requires it for overlapping scopes, and harmless here, since the store keeps every attempt
 * in one. With B on a different *database*, B's write succeeded within a millisecond while
 * A was busy, so the wait isn't A's request chain starving B.
 */

type Probe = {
    __release: boolean
    __aActive: boolean
    /** What B's first request read, boxed, so "B hasn't run" differs from "B read nothing". */
    __bFirstRead: { value: unknown } | null
}
const probe = (page: Page) => page.evaluate(() => ({ ...(window as unknown as Probe) }))

/**
 * The order is proved by what B *reads*, not by timestamps. Timestamps from two pages can't
 * be compared that finely: measured, B's success read 0.1 ms before A's completion, two
 * pages' `performance.timeOrigin` disagreeing by about that much. Instead A makes one last
 * write only after it is released, and B's first request reads the key. B can see a write
 * only once its transaction committed, so B reading A's last write means A had completed
 * before B's first request ran.
 */
test('two tabs\' overlapping readwrite transactions run one at a time', async ({ page }) => {
    const other = await page.context().newPage()
    // Any page of the app's origin will do; IndexedDB belongs to the origin.
    await page.goto('/')
    await other.goto('/')
    const name = 'challenge-premise'

    // A: create the store, then open a readwrite transaction and keep it busy with a chain
    // of requests until released, then make its last write. A transaction stays active while
    // it has requests pending.
    await page.evaluate(async name => {
        const w = window as unknown as Probe
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name, 1)
            request.onupgradeneeded = () => request.result.createObjectStore('s')
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
        w.__release = false
        w.__aActive = true
        const transaction = db.transaction('s', 'readwrite')
        const store = transaction.objectStore('s')
        store.put('a, busy', 'k')
        const spin = () => {
            const request = store.get('k')
            request.onsuccess = () => {
                if (w.__release) store.put('a, last', 'k')
                else spin()
            }
        }
        spin()
        transaction.oncomplete = () => { w.__aActive = false }
        // Let the transaction get under way before B arrives.
        await new Promise(resolve => setTimeout(resolve, 100))
    }, name)
    expect((await probe(page)).__aActive, 'A is running').toBe(true)

    // B: create an overlapping readwrite transaction on the same store; its first request
    // reads the key, and then it writes.
    await other.evaluate(async name => {
        const w = window as unknown as Probe
        w.__bFirstRead = null
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name, 1)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
        const store = db.transaction('s', 'readwrite').objectStore('s')
        const read = store.get('k')
        read.onsuccess = () => {
            w.__bFirstRead = { value: read.result }
            store.put('b', 'k')
        }
    }, name)

    // A was still active when B's transaction was created: it completes only on release,
    // and it hasn't been released.
    expect((await probe(page)).__aActive, 'A was still active after B was created').toBe(true)

    // Give B every chance to run if it could: it must still be waiting.
    await other.waitForTimeout(500)
    expect((await probe(other)).__bFirstRead, 'B ran while A was active').toBeNull()

    await page.evaluate(() => { (window as unknown as Probe).__release = true })
    await expect.poll(async () => (await probe(other)).__bFirstRead, { timeout: 5_000 }).not.toBeNull()

    // B's first request saw A's last write, which A made only after release, in the
    // transaction it then committed: A had completed before B's first request ran.
    expect((await probe(other)).__bFirstRead, 'B\'s first request ran after A completed').toEqual({ value: 'a, last' })
    expect((await probe(page)).__aActive, 'A completed').toBe(false)

    // And B's write is the one that stands, after A's.
    const value = await other.evaluate(async name => new Promise<unknown>(resolve => {
        const request = indexedDB.open(name, 1)
        request.onsuccess = () => {
            const get = request.result.transaction('s', 'readonly').objectStore('s').get('k')
            get.onsuccess = () => resolve(get.result)
        }
    }), name)
    expect(value).toBe('b')
    await other.close()
})
