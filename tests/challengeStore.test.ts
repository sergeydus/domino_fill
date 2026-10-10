import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
    legacyMarks, localStorageStore, openIndexedDbStore, LOCAL_ATTEMPT_PREFIX, LOCAL_LEGACY_KEY,
    type AttemptStore,
} from '@/app/challenge/attemptStore'
import { finish, markAssisted, settle, start, type Attempt, type Board } from '@/app/challenge/attempt'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import type { PuzzleProgress } from '@/app/stores/progressStorage'

/**
 * Challenge slice 1, the storage half (NEXT-STEPS, "Challenge slice 1").
 *
 * `fake-indexeddb` is IndexedDB in memory. Each test gets its own factory, and two
 * connections to the same database from one factory stand in for two tabs (codex). It is a
 * simulation of the spec, so the scheduling these tests lean on is also measured in a real
 * browser, in e2e/challengeStorage.spec.ts.
 */

const DAY = '2026-10-09'
const BOARD: Board = { puzzleId: '2026-10-09-hard-1', definitionHash: 'h', date: DAY }
const T0 = Date.UTC(2026, 9, 9, 10)
const begin = (now = T0) => (a: Attempt | null) => start(a, BOARD, now, DAY)
const end = (now: number) => (a: Attempt | null) => finish(a, now, DAY)

let factory: IDBFactory
const open = async (): Promise<AttemptStore> => {
    const store = await openIndexedDbStore(factory, 'challenge-test')
    if (!store) throw new Error('fake IndexedDB did not open')
    return store
}

beforeEach(() => { factory = new IDBFactory() })

const memoryStorage = (): Storage => {
    const map = new Map<string, string>()
    return {
        get length() { return map.size },
        clear: () => map.clear(), getItem: key => map.get(key) ?? null,
        key: index => [...map.keys()][index] ?? null,
        removeItem: key => { map.delete(key) }, setItem: (key, value) => { map.set(key, value) },
    }
}
const rawDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = factory.open('challenge-test')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
})
const putRaw = async (entries: readonly (readonly [IDBValidKey, unknown])[]) => {
    const db = await rawDatabase()
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('attempts', 'readwrite')
            for (const [key, value] of entries) tx.objectStore('attempts').put(value, key)
            tx.oncomplete = () => resolve()
            tx.onabort = () => reject(tx.error)
        })
    } finally { db.close() }
}
const attempt = (puzzleId: string, date = DAY): Attempt =>
    start(null, { ...BOARD, puzzleId, date }, T0, date).next!
const history = (): Attempt[] => [
    attempt('opaque-active'), attempt('__proto__'), attempt('future', '2030-12-31'),
    finish(attempt('solved'), T0 + 500, DAY).next!,
    finish(markAssisted(attempt('hinted')).next, T0 + 700, DAY).next!,
    finish(attempt('clock-error'), T0 - 1, DAY).next!,
    settle(attempt('old-given-up', '2020-01-01'), '2020-01-03').next!,
]
const seed = async (kind: AttemptStore['kind'], entries: readonly (readonly [string, unknown])[]) => {
    const storage = memoryStorage()
    const store = kind === 'indexeddb' ? await open() : localStorageStore(storage)
    if (kind === 'indexeddb') await putRaw(entries)
    else for (const [key, value] of entries) storage.setItem(LOCAL_ATTEMPT_PREFIX + key, JSON.stringify(value))
    return { store, storage }
}

describe.each(['indexeddb', 'localStorage'] as const)('readAll in %s', kind => {
    it('distinguishes an empty store from a read failure', async () => {
        const { store } = await seed(kind, [])
        try { expect(await store.readAll()).toEqual([]) } finally { store.close() }
    })

    it('enumerates every permanent attempt, including finished, old, future and opaque IDs', async () => {
        const records = history()
        const { store } = await seed(kind, records.map(a => [a.puzzleId, a] as const))
        try {
            const all = await store.readAll()
            expect(all).toHaveLength(records.length)
            expect(all).toEqual(expect.arrayContaining(records))
        } finally { store.close() }
    })

    it('skips malformed records and continues to later valid records', async () => {
        const first = attempt('a-valid')
        const last = attempt('z-valid')
        const { store } = await seed(kind, [
            [first.puzzleId, first], ['b-null', null], ['c-number', 42],
            ['d-day', { ...attempt('d-day'), date: '2026-02-31' }],
            ['e-rules', { ...attempt('e-rules'), ruleset: 99 }],
            ['f-instant', { ...attempt('f-instant'), startedAt: Number.POSITIVE_INFINITY }],
            ['g-result', { ...attempt('g-result'), result: { kind: 'solved', ms: 10 }, finishedAt: T0 + 20 }],
            [last.puzzleId, last],
        ])
        try {
            expect(await store.readAll()).toEqual([first, last])
        } finally { store.close() }
    })

    it('rejects otherwise valid records filed under another puzzle key', async () => {
        const { store } = await seed(kind, [['wrong-key', attempt('elsewhere')]])
        try { expect(await store.readAll()).toEqual([]) } finally { store.close() }
    })

    it('excludes legacy metadata and other storage namespaces', async () => {
        const saved = attempt('saved')
        const { store, storage } = await seed(kind, [[saved.puzzleId, saved]])
        try {
            await store.legacyCheck(() => ['previously-played'])
            storage.setItem('dominoFill.progress.v2.saved', JSON.stringify(attempt('progress')))
            storage.setItem('dominoFill.challenge.v1.attemptFake', JSON.stringify(attempt('Fake')))
            storage.setItem('other', JSON.stringify(attempt('other')))
            expect(await store.readAll()).toEqual([saved])
            expect(await store.readLegacy()).toEqual({ checked: true, marks: ['previously-played'] })
        } finally { store.close() }
    })

    it('reads the latest committed flags and finish from another connection', async () => {
        const saved = attempt(BOARD.puzzleId)
        const { store, storage } = await seed(kind, [[saved.puzzleId, saved]])
        const other = kind === 'indexeddb' ? await open() : localStorageStore(storage)
        try {
            expect(await store.readAll()).toEqual([saved])
            await other.change(saved.puzzleId, markAssisted)
            const done = await other.change(saved.puzzleId, end(T0 + 1000))
            expect(done.committed).toBe(true)
            expect(done.attempt?.result).toEqual({ kind: 'hinted' })
            expect(await store.readAll()).toEqual([done.attempt])
        } finally { other.close(); store.close() }
    })
})

describe('IndexedDB enumeration completes as one readonly transaction', () => {
    it('rejects non-string keys instead of coercing them into puzzle IDs', async () => {
        const store = await open()
        try {
            await putRaw([[77, attempt('77')], [['array-key'], attempt('array-key')]])
            expect(await store.readAll()).toEqual([])
        } finally { store.close() }
    })

    it('waits for transaction completion and uses readonly access', async () => {
        const store = await open()
        const saved = attempt('saved')
        await putRaw([[saved.puzzleId, saved]])
        const db = await rawDatabase()
        const proto = Object.getPrototypeOf(db) as IDBDatabase
        const transaction = proto.transaction
        let completed = false
        const spy = vi.spyOn(proto, 'transaction').mockImplementation(function (this: IDBDatabase, ...args) {
            const tx = transaction.apply(this, args)
            tx.addEventListener('complete', () => { completed = true })
            return tx
        })
        try {
            const all = await store.readAll()
            expect(completed, 'enumeration must wait for the transaction').toBe(true)
            expect(spy.mock.calls).toEqual([['attempts', 'readonly']])
            expect(all).toEqual([saved])
        } finally { spy.mockRestore(); db.close(); store.close() }
    })

    it.each(['pending-request', 'end-of-cursor'] as const)(
        'discards collected attempts if the cursor transaction aborts after success (%s)', async mode => {
        const store = await open()
        await putRaw([['a', attempt('a')], ['z', attempt('z')]])
        const db = await rawDatabase()
        const proto = Object.getPrototypeOf(db.transaction('attempts').objectStore('attempts')) as IDBObjectStore
        const openCursor = proto.openCursor
        let successes = 0
        const spy = vi.spyOn(proto, 'openCursor').mockImplementation(function (this: IDBObjectStore, ...args) {
            const request = openCursor.apply(this, args)
            request.addEventListener('success', () => {
                const cursor = request.result
                if (!cursor) {
                    if (mode === 'end-of-cursor') this.transaction.abort()
                    return
                }
                successes++
                if (mode === 'pending-request') {
                    const next = cursor.continue.bind(cursor)
                    cursor.continue = key => { next(key); this.transaction.abort() }
                }
            })
            return request
        })
        try {
            expect(await store.readAll(), 'aborted scan must not return partial history').toBeNull()
            expect(successes).toBe(mode === 'pending-request' ? 1 : 2)
        } finally { spy.mockRestore(); db.close(); store.close() }
    })

    it('reports cursor setup failure rather than an empty history', async () => {
        const store = await open()
        const db = await rawDatabase()
        const proto = Object.getPrototypeOf(db.transaction('attempts').objectStore('attempts')) as IDBObjectStore
        const spy = vi.spyOn(proto, 'openCursor').mockImplementation(() => { throw new Error('Unreadable') })
        try { expect(await store.readAll()).toBeNull() }
        finally { spy.mockRestore(); db.close(); store.close() }
    })

    it('reports a closed connection rather than an empty history', async () => {
        const store = await open()
        store.close()
        expect(await store.readAll()).toBeNull()
    })
})

describe('localStorage enumeration reads without rewriting and reports failures', () => {
    it('skips corrupt JSON and never reads or writes unrelated keys', async () => {
        const storage = memoryStorage()
        storage.setItem(LOCAL_ATTEMPT_PREFIX + 'broken', '{not JSON')
        storage.setItem(LOCAL_ATTEMPT_PREFIX + 'valid', JSON.stringify(attempt('valid')))
        storage.setItem(LOCAL_LEGACY_KEY, JSON.stringify({ checked: true, marks: ['old'] }))
        storage.setItem('unrelated', 'kept')
        const get = vi.spyOn(storage, 'getItem')
        const set = vi.spyOn(storage, 'setItem')
        const remove = vi.spyOn(storage, 'removeItem')
        try {
            const all = await localStorageStore(storage).readAll()
            expect(set).not.toHaveBeenCalled()
            expect(remove).not.toHaveBeenCalled()
            expect(all).toEqual([attempt('valid')])
            expect(get.mock.calls).toEqual([[LOCAL_ATTEMPT_PREFIX + 'broken'], [LOCAL_ATTEMPT_PREFIX + 'valid']])
        } finally { get.mockRestore(); set.mockRestore(); remove.mockRestore() }
        expect(storage.getItem(LOCAL_ATTEMPT_PREFIX + 'broken')).toBe('{not JSON')
        expect(storage.getItem('unrelated')).toBe('kept')
    })

    it('reports missing storage rather than an empty history', async () => {
        expect(await localStorageStore(null).readAll()).toBeNull()
    })

    it.each(['length', 'key', 'getItem'] as const)('discards the scan when %s throws', async operation => {
        const storage = memoryStorage()
        storage.setItem(LOCAL_ATTEMPT_PREFIX + 'a', JSON.stringify(attempt('a')))
        storage.setItem(LOCAL_ATTEMPT_PREFIX + 'z', JSON.stringify(attempt('z')))
        const spy = operation === 'length'
            ? vi.spyOn(storage, 'length', 'get').mockImplementation(() => { throw new Error('Blocked') })
            : vi.spyOn(storage, operation).mockImplementation((value: string | number) => {
                if (value === 0) return LOCAL_ATTEMPT_PREFIX + 'a'
                if (value === LOCAL_ATTEMPT_PREFIX + 'a') return JSON.stringify(attempt('a'))
                throw new Error('Blocked after first record')
            })
        try { expect(await localStorageStore(storage).readAll()).toBeNull() }
        finally { spy.mockRestore() }
    })
})

/**
 * Make every `put` on this factory's object stores abort its transaction the moment the
 * request succeeds: the case rule 16 exists for. Patched on the prototype, which every store
 * object shares, and undone by the returned function.
 */
const abortAfterPutSucceeds = async (): Promise<() => void> => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open('prototype-probe')
        request.onupgradeneeded = () => request.result.createObjectStore('s')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
    const proto = Object.getPrototypeOf(db.transaction('s', 'readwrite').objectStore('s')) as IDBObjectStore
    db.close()
    const put = proto.put
    proto.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
        const request = put.apply(this, args)
        request.addEventListener('success', () => this.transaction.abort())
        return request
    }
    return () => { proto.put = put }
}

describe('saved means the transaction completed (rule 16)', () => {
    it('a change is committed, and reads back as written', async () => {
        const store = await open()
        const outcome = await store.change(BOARD.puzzleId, begin())
        expect(outcome).toMatchObject({ committed: true, changed: true })
        expect(await store.read(BOARD.puzzleId)).toEqual(outcome.attempt)
        store.close()
    })

    it('nothing counts as saved when the transaction aborts after its request succeeded', async () => {
        const store = await open()
        const restore = await abortAfterPutSucceeds()
        try {
            const outcome = await store.change(BOARD.puzzleId, begin())
            expect(outcome).toEqual({ committed: false, changed: false, attempt: null })
            const legacy = await store.legacyCheck(() => ['x'])
            expect(legacy).toEqual({ committed: false, legacy: null })
        } finally {
            restore()
        }
        expect(await store.read(BOARD.puzzleId)).toBeNull()
        expect(await store.readLegacy()).toBeNull()
        store.close()
    })

    it('a step that throws saves nothing', async () => {
        const store = await open()
        const outcome = await store.change(BOARD.puzzleId, () => { throw new Error('boom') })
        expect(outcome.committed).toBe(false)
        expect(await store.read(BOARD.puzzleId)).toBeNull()
        store.close()
    })
})

describe('two tabs: two connections to one database (rule 15)', () => {
    it('one Start wins, and the other resumes it', async () => {
        const [a, b] = [await open(), await open()]
        const [first, second] = await Promise.all([
            a.change(BOARD.puzzleId, begin(T0)),
            b.change(BOARD.puzzleId, begin(T0 + 500)),
        ])
        expect([first.changed, second.changed].filter(Boolean)).toHaveLength(1)
        const winner = first.changed ? first.attempt : second.attempt
        expect(first.attempt).toEqual(winner)
        expect(second.attempt).toEqual(winner)
        expect(await b.read(BOARD.puzzleId)).toEqual(winner)
        a.close(); b.close()
    })

    it('two finishes fix one result', async () => {
        const [a, b] = [await open(), await open()]
        await a.change(BOARD.puzzleId, begin())
        const [first, second] = await Promise.all([
            a.change(BOARD.puzzleId, end(T0 + 1000)),
            b.change(BOARD.puzzleId, end(T0 + 2000)),
        ])
        expect([first.changed, second.changed].filter(Boolean)).toHaveLength(1)
        const fixed = (await a.read(BOARD.puzzleId))?.result
        expect(fixed).toEqual((first.changed ? first : second).attempt?.result)
        a.close(); b.close()
    })

    it('the hint commits first: the finish is a solve with a hint', async () => {
        const [a, b] = [await open(), await open()]
        await a.change(BOARD.puzzleId, begin())
        const [hint, done] = await Promise.all([
            a.change(BOARD.puzzleId, markAssisted),
            b.change(BOARD.puzzleId, end(T0 + 1000)),
        ])
        expect(hint.changed).toBe(true)
        expect(done.attempt?.result).toEqual({ kind: 'hinted' })
        a.close(); b.close()
    })

    it('the finish commits first: its result stays fixed, and the later hint sets nothing', async () => {
        const [a, b] = [await open(), await open()]
        await a.change(BOARD.puzzleId, begin())
        const [done, hint] = await Promise.all([
            b.change(BOARD.puzzleId, end(T0 + 1000)),
            a.change(BOARD.puzzleId, markAssisted),
        ])
        expect(done.attempt?.result).toEqual({ kind: 'solved', ms: 1000 })
        // The hint's transaction found the result: nothing set, so no hint is to be shown,
        // and the tab is handed the fixed result instead.
        expect(hint.changed).toBe(false)
        expect(hint.attempt?.result).toEqual({ kind: 'solved', ms: 1000 })
        expect((await a.read(BOARD.puzzleId))?.assisted).toBe(false)
        a.close(); b.close()
    })
})

describe('a stored record that doesn\'t parse reads as no attempt', () => {
    it('so a Start can overwrite it', async () => {
        const store = await open()
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = factory.open('challenge-test')
            request.onsuccess = () => resolve(request.result)
        })
        await new Promise<void>(resolve => {
            const tx = db.transaction('attempts', 'readwrite')
            tx.objectStore('attempts').put({ puzzleId: BOARD.puzzleId, startedAt: 'garbage' }, BOARD.puzzleId)
            tx.oncomplete = () => resolve()
        })
        db.close()
        expect(await store.read(BOARD.puzzleId)).toBeNull()
        expect((await store.change(BOARD.puzzleId, begin())).changed).toBe(true)
        store.close()
    })
})

describe('a record is bound to its key (codex)', () => {
    /** An otherwise valid attempt of another board. */
    const elsewhere = (): Attempt =>
        start(null, { ...BOARD, puzzleId: '2026-10-09-hard-2' }, T0 - 60_000, DAY).next!

    /** A step that would write another board's record under the requested key. */
    const misfile = () => ({ next: elsewhere(), changed: true })

    it('IndexedDB: another board\'s record under this key is no attempt, and Start makes a fresh one', async () => {
        const store = await open()
        const db = await new Promise<IDBDatabase>(resolve => {
            const request = factory.open('challenge-test')
            request.onsuccess = () => resolve(request.result)
        })
        await new Promise<void>(resolve => {
            const tx = db.transaction('attempts', 'readwrite')
            tx.objectStore('attempts').put(elsewhere(), BOARD.puzzleId)
            tx.oncomplete = () => resolve()
        })
        db.close()
        expect(await store.read(BOARD.puzzleId)).toBeNull()
        const outcome = await store.change(BOARD.puzzleId, begin())
        expect(outcome).toMatchObject({ committed: true, changed: true })
        expect(outcome.attempt?.puzzleId).toBe(BOARD.puzzleId)
        expect(outcome.attempt?.startedAt).toBe(T0)
        store.close()
    })

    it('IndexedDB: a step can\'t file a record under another board\'s key', async () => {
        const store = await open()
        expect(await store.change(BOARD.puzzleId, misfile)).toEqual({ committed: false, changed: false, attempt: null })
        expect(await store.read(BOARD.puzzleId)).toBeNull()
        store.close()
    })

    it('localStorage: the same, both ways', async () => {
        const map = new Map<string, string>()
        const storage = {
            get length() { return map.size },
            clear: () => map.clear(),
            getItem: (key: string) => map.get(key) ?? null,
            key: (index: number) => [...map.keys()][index] ?? null,
            removeItem: (key: string) => { map.delete(key) },
            setItem: (key: string, value: string) => { map.set(key, value) },
        } as Storage
        storage.setItem(LOCAL_ATTEMPT_PREFIX + BOARD.puzzleId, JSON.stringify(elsewhere()))
        const store = localStorageStore(storage)
        expect(await store.read(BOARD.puzzleId)).toBeNull()

        expect(await store.change(BOARD.puzzleId, misfile)).toEqual({ committed: false, changed: false, attempt: null })
        expect(JSON.parse(storage.getItem(LOCAL_ATTEMPT_PREFIX + BOARD.puzzleId)!).puzzleId).toBe('2026-10-09-hard-2')

        const outcome = await store.change(BOARD.puzzleId, begin())
        expect(outcome.attempt?.puzzleId).toBe(BOARD.puzzleId)
        expect(JSON.parse(storage.getItem(LOCAL_ATTEMPT_PREFIX + BOARD.puzzleId)!).puzzleId).toBe(BOARD.puzzleId)
    })
})

describe('the legacy check (rule 13)', () => {
    /** A 2x2 whose right column is rock: one upright domino in the left column solves it. */
    const definition = (puzzleId: string) => definitionFrom({
        puzzleId,
        board: [[null, -1], [null, -1]] as (number | null)[][],
        boardHorizontalNumbers: '1,0',
        boardVerticalNumbers: '1,0',
    })
    const ids = ['played', 'emptied', 'wrong-hash', 'moved-rock', 'malformed', 'unsaved', 'no-definition']
    const definitions = ids.slice(0, 6).map(definition)
    const hashOf = (id: string) => definitions.find(d => d.puzzleId === id)?.definitionHash ?? 'none'
    const record = (id: string, board: (number | null)[][], over: Partial<PuzzleProgress> = {}): PuzzleProgress =>
        ({ definitionHash: hashOf(id), board, completed: false, savedAt: T0, ...over })
    const progress: Record<string, PuzzleProgress> = {
        played: record('played', [[1, -1], [0, -1]], { completed: true }),
        // Place, then Reset: the board is empty again, but the record exists because it changed.
        emptied: record('emptied', [[null, -1], [null, -1]]),
        'wrong-hash': record('wrong-hash', [[1, -1], [0, -1]], { definitionHash: 'other' }),
        'moved-rock': record('moved-rock', [[-1, null], [null, -1]]),
        // A 1 with nothing beneath it: no sequence of moves makes this.
        malformed: record('malformed', [[1, -1], [null, -1]]),
        'no-definition': { definitionHash: 'x', board: [[null, -1], [null, -1]], completed: false, savedAt: T0 },
    }

    it('marks every valid record, an empty one included, and nothing else', () => {
        expect(legacyMarks(definitions, progress)).toEqual(['played', 'emptied'])
    })

    it('writes the marks and its done flag together, and runs once', async () => {
        const store = await open()
        const first = await store.legacyCheck(() => legacyMarks(definitions, progress))
        expect(first).toEqual({ committed: true, legacy: { checked: true, marks: ['played', 'emptied'] } })
        let scanned = false
        const second = await store.legacyCheck(() => { scanned = true; return ['other'] })
        expect(scanned).toBe(false)
        expect(second.legacy?.marks).toEqual(['played', 'emptied'])
        store.close()
    })

    it('two tabs opening together scan once', async () => {
        const [a, b] = [await open(), await open()]
        let scans = 0
        const scan = () => { scans++; return legacyMarks(definitions, progress) }
        const [x, y] = await Promise.all([a.legacyCheck(scan), b.legacyCheck(scan)])
        expect(scans).toBe(1)
        expect(x.legacy).toEqual(y.legacy)
        a.close(); b.close()
    })
})

describe('the localStorage fallback', () => {
    const memory = (failWrites = false): Storage => {
        const map = new Map<string, string>()
        return {
            get length() { return map.size },
            clear: () => map.clear(),
            getItem: key => map.get(key) ?? null,
            key: index => [...map.keys()][index] ?? null,
            removeItem: key => { map.delete(key) },
            setItem: (key, value) => {
                if (failWrites) throw new Error('QuotaExceededError')
                map.set(key, value)
            },
        }
    }

    it('keeps one key per attempt, and one for the legacy check', async () => {
        const storage = memory()
        const store = localStorageStore(storage)
        expect(store.kind).toBe('localStorage')
        const outcome = await store.change(BOARD.puzzleId, begin())
        expect(outcome).toMatchObject({ committed: true, changed: true })
        expect(JSON.parse(storage.getItem(LOCAL_ATTEMPT_PREFIX + BOARD.puzzleId)!)).toEqual(outcome.attempt)
        await store.legacyCheck(() => ['a'])
        expect(JSON.parse(storage.getItem(LOCAL_LEGACY_KEY)!)).toEqual({ checked: true, marks: ['a'] })
        expect((await store.legacyCheck(() => ['b'])).legacy?.marks).toEqual(['a'])
    })

    it('reads what doesn\'t parse as missing', async () => {
        const storage = memory()
        storage.setItem(LOCAL_ATTEMPT_PREFIX + BOARD.puzzleId, '{not json')
        storage.setItem(LOCAL_LEGACY_KEY, '{"checked":false}')
        const store = localStorageStore(storage)
        expect(await store.read(BOARD.puzzleId)).toBeNull()
        expect(await store.readLegacy()).toBeNull()
    })

    it('saved means setItem didn\'t throw', async () => {
        const store = localStorageStore(memory(true))
        expect(await store.change(BOARD.puzzleId, begin())).toEqual({ committed: false, changed: false, attempt: null })
        expect(await store.legacyCheck(() => ['a'])).toEqual({ committed: false, legacy: null })
        // With no storage at all, nothing is ever saved.
        expect((await localStorageStore(null).change(BOARD.puzzleId, begin())).committed).toBe(false)
    })
})

describe('choosing the store', () => {
    it('is no IndexedDB store where there is no IndexedDB', async () => {
        expect(await openIndexedDbStore(undefined)).toBeNull()
    })
})
