import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBDatabase as FakeDatabase, IDBFactory } from 'fake-indexeddb'
import type { Page } from '@playwright/test'
import { arm, instrument, release } from '@/e2e/challengeTransaction'

// These tests exercise the real IDB instrument and page callbacks, not Playwright's poll helper.
vi.mock('@playwright/test', () => ({ expect: vi.fn() }))

const originalTransaction = FakeDatabase.prototype.transaction
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalDatabase = Object.getOwnPropertyDescriptor(globalThis, 'IDBDatabase')
let factory: IDBFactory
let databases: IDBDatabase[]
let pending: Map<IDBTransaction, Promise<string>>
const page = {
    evaluate: (fn: (value: unknown) => unknown, value: unknown) => Promise.resolve(fn(value)),
} as unknown as Page
const totals = () => ({ created: window.challengeTransaction.created, settled: window.challengeTransaction.settled })

const open = (name = 'dominoFill.challenge'): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = factory.open(name)
    request.onupgradeneeded = () => {
        request.result.createObjectStore('attempts')
        request.result.createObjectStore('meta')
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => { databases.push(request.result); resolve(request.result) }
})
const transaction = (db: IDBDatabase, mode: IDBTransactionMode = 'readwrite', store = 'attempts') => {
    const tx = db.transaction(store, mode)
    const done = new Promise<string>(resolve => {
        tx.addEventListener('complete', () => resolve('complete'))
        tx.addEventListener('abort', () => resolve('abort'))
    })
    pending.set(tx, done)
    void done.then(() => pending.delete(tx))
    return { tx, done }
}
const written = (tx: IDBTransaction, value = { saved: true }) => new Promise<void>((resolve, reject) => {
    const request = tx.objectStore('attempts').put(value, 'puzzle')
    request.onsuccess = () => resolve()
    request.onerror = event => { event.preventDefault(); reject(request.error) }
})

beforeEach(() => {
    // Catch a patch/global left behind by any previous test in this worker.
    expect(FakeDatabase.prototype.transaction).toBe(originalTransaction)
    expect(Object.getOwnPropertyDescriptor(globalThis, 'window')).toEqual(originalWindow)
    expect(Object.getOwnPropertyDescriptor(globalThis, 'IDBDatabase')).toEqual(originalDatabase)
    factory = new IDBFactory()
    databases = []
    pending = new Map()
    vi.stubGlobal('window', {})
    vi.stubGlobal('IDBDatabase', FakeDatabase)
    instrument()
})
afterEach(async () => {
    // Also release real pending requests when a mutation fails before its normal release.
    window.challengeTransaction.abort = true
    window.challengeTransaction.release = true
    const waits = [...pending.values()]
    for (const tx of pending.keys()) { try { tx.abort() } catch { /* Already terminal. */ } }
    await Promise.all(waits)
    for (const db of databases) db.close()
    FakeDatabase.prototype.transaction = originalTransaction
    vi.unstubAllGlobals()
    expect(FakeDatabase.prototype.transaction).toBe(originalTransaction)
    expect(Object.getOwnPropertyDescriptor(globalThis, 'window')).toEqual(originalWindow)
    expect(Object.getOwnPropertyDescriptor(globalThis, 'IDBDatabase')).toEqual(originalDatabase)
})

describe('passive lifetime transaction counts', () => {
    it('counts an unarmed no-op completion, without setting armed flags', async () => {
        const { done } = transaction(await open())
        expect(totals()).toEqual({ created: 1, settled: 0 })
        expect(await done).toBe('complete')
        expect(totals(), 'an unarmed completion settles').toEqual({ created: 1, settled: 1 })
        expect(window.challengeTransaction).toMatchObject({ active: false, completed: false, writes: [] })
    })

    it('counts an unarmed abort as settled', async () => {
        const { tx, done } = transaction(await open())
        tx.abort()
        expect(await done).toBe('abort')
        expect(totals(), 'an unarmed abort settles').toEqual({ created: 1, settled: 1 })
        expect(window.challengeTransaction.completed).toBe(false)
    })

    it('does not confuse write success with settlement', async () => {
        const { tx, done } = transaction(await open())
        let atSuccess: ReturnType<typeof totals> | undefined
        const request = tx.objectStore('attempts').put({ saved: true }, 'puzzle')
        request.onsuccess = () => { atSuccess = totals() }
        await done
        expect(atSuccess).toEqual({ created: 1, settled: 0 })
        expect(totals()).toEqual({ created: 1, settled: 1 })
    })

    it('counts outstanding work while the real hold blocks a second connection', async () => {
        const first = await open()
        const second = await open()
        await arm(page)
        const a = transaction(first)
        await written(a.tx)
        const b = transaction(second)
        b.tx.objectStore('attempts').get('puzzle')
        expect(totals(), 'both readwrites are outstanding').toEqual({ created: 2, settled: 0 })
        expect(window.challengeTransaction).toMatchObject({ active: true, completed: false, writes: [{ saved: true }] })
        await release(page)
        expect(await Promise.all([a.done, b.done])).toEqual(['complete', 'complete'])
        expect(totals()).toEqual({ created: 2, settled: 2 })
        expect(window.challengeTransaction).toMatchObject({ active: false, completed: true })
    })

    it('keeps the armed abort and request-success flags unchanged', async () => {
        const db = await open()
        await arm(page)
        const { tx, done } = transaction(db)
        await written(tx)
        expect(window.challengeTransaction.writes).toEqual([{ saved: true }])
        expect(window.challengeTransaction.active).toBe(true)
        await release(page, true)
        expect(await done).toBe('abort')
        expect(totals(), 'an armed abort settles too').toEqual({ created: 1, settled: 1 })
        expect(window.challengeTransaction).toMatchObject({ active: false, completed: false, writes: [{ saved: true }] })
    })

    it('never resets either lifetime count when re-armed', async () => {
        const db = await open()
        await transaction(db).done
        await arm(page)
        expect(totals(), 'arm keeps both lifetime totals').toEqual({ created: 1, settled: 1 })
        await transaction(db).done
        await arm(page, 'meta')
        expect(totals(), 're-arm keeps both lifetime totals').toEqual({ created: 2, settled: 2 })
    })

    it('settles a counted transaction even when the armed store does not match', async () => {
        const db = await open()
        await arm(page, 'meta')
        await transaction(db).done
        expect(totals()).toEqual({ created: 1, settled: 1 })
        expect(window.challengeTransaction).toMatchObject({ armed: 'meta', active: false, completed: false })
    })

    it('excludes readonly transactions and other databases, but includes meta readwrites', async () => {
        const db = await open()
        await transaction(db, 'readonly').done
        await transaction(await open('unrelated')).done
        expect(totals(), 'only challenge readwrites count').toEqual({ created: 0, settled: 0 })
        await transaction(db, 'readwrite', 'meta').done
        expect(totals()).toEqual({ created: 1, settled: 1 })
    })
})
