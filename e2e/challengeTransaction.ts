import { expect, type Page } from '@playwright/test'

/*
 * Holding the challenge store's save open, in a real browser: the real IndexedDB transaction
 * is kept alive by pending reads after its write succeeds, until the test releases or aborts
 * it. Shared by the slice 2 session tests and the slice 3a focus tests.
 */

export type TransactionProbe = {
    armed: 'attempts' | 'meta' | null, active: boolean, release: boolean, abort: boolean,
    created: number, writes: unknown[], completed: boolean,
}
declare global {
    interface Window { challengeTransaction: TransactionProbe }
}

/** Intercept the real store's transactions, never replace its reads, steps or writes. */
export const instrument = () => {
    const probe: TransactionProbe = {
        armed: null, active: false, release: false, abort: false,
        created: 0, writes: [], completed: false,
    }
    window.challengeTransaction = probe
    const transaction = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args) {
        const tx = transaction.apply(this, args)
        if (this.name !== 'dominoFill.challenge' || tx.mode !== 'readwrite') return tx
        probe.created++
        const target = probe.armed
        if (!target || !tx.objectStoreNames.contains(target)) return tx
        const store = tx.objectStore(target)
        // Pending requests keep a genuine IDB transaction open even after put.success.
        const spin = () => {
            const request = store.get('__fixture_hold__')
            request.onsuccess = () => {
                if (probe.abort) tx.abort()
                else if (!probe.release) spin()
            }
        }
        const put = store.put.bind(store)
        store.put = (...putArgs) => {
            const request = put(...putArgs)
            if (probe.armed !== target) return request
            probe.armed = null
            probe.active = true
            spin()
            request.addEventListener('success', () => { probe.writes.push(putArgs[0]) })
            return request
        }
        // objectStore returns this same object in a transaction, as required by IDB.
        tx.addEventListener('complete', () => {
            probe.active = false
            probe.completed = true
        })
        tx.addEventListener('abort', () => { probe.active = false })
        return tx
    }
}

export const probe = (page: Page) => page.evaluate(() => ({ ...window.challengeTransaction }))
export const arm = (page: Page, store: 'attempts' | 'meta' = 'attempts') => page.evaluate(store => {
    Object.assign(window.challengeTransaction, {
        armed: store, active: false, release: false, abort: false, writes: [], completed: false,
    })
}, store)
export const release = (page: Page, abort = false) => page.evaluate(abort => {
    window.challengeTransaction.abort = abort
    window.challengeTransaction.release = true
}, abort)
export const heldWrite = async (page: Page) => {
    await expect.poll(async () => (await probe(page)).writes.length).toBeGreaterThan(0)
    expect((await probe(page)).active, 'transaction remains active after put.success').toBe(true)
}
