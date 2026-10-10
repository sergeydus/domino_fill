import { describe, it, expect, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { memoryAttemptStore, openAttemptStore, type AttemptStore } from '@/app/challenge/attemptStore'
import { finish, markAssisted, markClockError, start } from '@/app/challenge/attempt'

const board = { puzzleId: 'opaque', definitionHash: 'hash', date: '2026-10-10' }
const begin = (current: Parameters<typeof start>[0]) => start(current, board, 100, board.date)
const storage = (): Storage => {
    const data = new Map<string, string>([['old', 'keep']])
    return {
        get length() { return data.size }, clear: () => data.clear(),
        getItem: vi.fn(key => data.get(key) ?? null), key: index => [...data.keys()][index] ?? null,
        setItem: vi.fn((key, value) => { data.set(key, value) }), removeItem: vi.fn(key => { data.delete(key) }),
    }
}

describe('opening capability', () => {
    it('does not mistake an unavailable UUID API for blocked storage', async () => {
        const local = storage()
        vi.spyOn(crypto, 'randomUUID').mockImplementationOnce(() => { throw new Error('unsupported UUID') })
        try {
            const store = await openAttemptStore({ factory: null, storage: () => local })
            expect(store.kind).toBe('localStorage')
            expect(local.length).toBe(1)
        } finally { vi.restoreAllMocks() }
    })
    it('chooses working IndexedDB without touching the fallback', async () => {
        const fallback = vi.fn(() => storage())
        const store = await openAttemptStore({ factory: new IDBFactory(), storage: fallback })
        expect(store.kind).toBe('indexeddb')
        expect(fallback).not.toHaveBeenCalled()
        store.close()
    })
    it('probes a usable fallback without overwriting data or retaining its probe', async () => {
        const local = storage()
        const store = await openAttemptStore({ factory: null, storage: () => local })
        expect(store.kind).toBe('localStorage')
        expect(local.length).toBe(1)
        expect(local.getItem('old')).toBe('keep')
        expect(local.setItem).toHaveBeenCalledTimes(1)
        expect(local.removeItem).toHaveBeenCalledTimes(1)
    })
    it.each(['absent', 'getter', 'read', 'write', 'remove', 'mismatch'] as const)('uses memory when %s blocks the opening probe', async failure => {
        const local = storage()
        if (failure === 'read') local.getItem = () => { throw new Error('blocked read') }
        if (failure === 'write') local.setItem = () => { throw new Error('blocked write') }
        if (failure === 'remove') local.removeItem = () => { throw new Error('blocked removal') }
        if (failure === 'mismatch') local.getItem = () => null
        const store = await openAttemptStore({ factory: null, storage: () => {
            if (failure === 'getter') throw new Error('blocked getter')
            return failure === 'absent' ? null : local
        } })
        expect(store.kind).toBe('memory')
        expect((await store.change(board.puzzleId, begin)).committed).toBe(true)
    })
    it('does not overwrite a colliding probe key', async () => {
        const local = storage()
        const id = '00000000-0000-4000-8000-000000000000'
        vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(id)
        const key = `dominoFill.challenge.probe.${id}`
        local.setItem(key, 'belongs to another caller')
        const store = await openAttemptStore({ factory: null, storage: () => local })
        expect(store.kind).toBe('memory')
        expect(local.getItem(key)).toBe('belongs to another caller')
        expect(local.removeItem).not.toHaveBeenCalled()
        vi.restoreAllMocks()
    })
    it.each(['localStorage', 'indexeddb'] as const)('retains selected %s when reopening fails', async kind => {
        const store = await openAttemptStore({ kind, factory: null, storage: () => null })
        expect(store.kind).toBe(kind)
        expect(await store.readAll()).toBeNull()
        expect((await store.change(board.puzzleId, begin)).committed).toBe(false)
    })
    it('a fallback that fails after opening stays a failed persistent save', async () => {
        const local = storage()
        const store = await openAttemptStore({ factory: null, storage: () => local })
        local.setItem = () => { throw new Error('later failure') }
        expect((await store.change(board.puzzleId, begin)).committed).toBe(false)
        expect(store.kind).toBe('localStorage')
        expect(await store.read(board.puzzleId)).toBeNull()
    })
})

describe('unsaved tab records', () => {
    it('applies the normal rules in one instance and loses everything in another', async () => {
        const store = memoryAttemptStore()
        const a = await store.change(board.puzzleId, begin)
        expect(a.attempt?.startedAt).toBe(100)
        expect((await store.change(board.puzzleId, begin)).changed).toBe(false)
        await store.change(board.puzzleId, markClockError)
        await store.change(board.puzzleId, markAssisted)
        const outcome = await store.change(board.puzzleId, current => finish(current, 200, board.date))
        expect(outcome.attempt?.result).toEqual({ kind: 'hinted' })
        expect((await store.change(board.puzzleId, begin)).attempt).toEqual(outcome.attempt)
        expect(await memoryAttemptStore().readAll()).toEqual([])
    })
    it('does not broadcast an unsaved operation', async () => {
        const channel = vi.fn()
        vi.stubGlobal('BroadcastChannel', channel)
        try {
            await memoryAttemptStore().change(board.puzzleId, begin)
            expect(channel).not.toHaveBeenCalled()
        } finally { vi.unstubAllGlobals() }
    })
    it('keeps one legacy scan only within the instance', async () => {
        const store = memoryAttemptStore()
        const scan = vi.fn(() => ['old'])
        expect(await store.legacyCheck(scan)).toEqual({ committed: true, legacy: { checked: true, marks: ['old'] } })
        await store.legacyCheck(scan)
        expect(scan).toHaveBeenCalledTimes(1)
        expect(await memoryAttemptStore().readLegacy()).toBeNull()
    })
    it('refuses a step filing under another ID and catches a throwing step or scan', async () => {
        const store: AttemptStore = memoryAttemptStore()
        expect((await store.change('wrong', begin)).committed).toBe(false)
        expect((await store.change(board.puzzleId, () => { throw new Error('step') })).committed).toBe(false)
        expect((await store.legacyCheck(() => { throw new Error('scan') })).committed).toBe(false)
        expect(await store.readAll()).toEqual([])
    })
})
