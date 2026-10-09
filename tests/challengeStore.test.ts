import { describe, it, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
    legacyMarks, localStorageStore, openIndexedDbStore, LOCAL_ATTEMPT_PREFIX, LOCAL_LEGACY_KEY,
    type AttemptStore,
} from '@/app/challenge/attemptStore'
import { finish, markAssisted, start, type Attempt, type Board } from '@/app/challenge/attempt'
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
