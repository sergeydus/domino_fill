// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autorun, runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { CorpusSource, type LoadedDay } from '@/app/stores/corpusSource'
import { definitionFrom, type StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import type { CoordinatorOptions } from '@/app/challenge/coordinator'
import { localStorageStore, memoryAttemptStore, type AttemptStore } from '@/app/challenge/attemptStore'
import { finish, markAssisted, start } from '@/app/challenge/attempt'
import { addDays } from '@/app/challenge/window'
import { readProgress, writeProgress, type PuzzleProgress } from '@/app/stores/progressStorage'
import type { DayEntry } from '@/app/stores/corpus'

vi.mock('@/app/dominoFill/feedback', () => ({ winFeedback: vi.fn() }))

const DAY = '2026-10-10'
const T0 = new Date(2026, 9, 10, 12).getTime()
const puzzle = (id: string): StoredPuzzle => ({
    puzzleId: id, board: [[null, -1], [null, -1]],
    boardHorizontalNumbers: '1,0', boardVerticalNumbers: '1,0',
})
const day = (date = DAY): DayEntry => ({
    date,
    easyBoards: [1, 2, 3].map(i => puzzle(`${date}|e${i}`)),
    mediumBoards: [1, 2, 3].map(i => puzzle(`${date}|m${i}`)),
    hardBoards: [1, 2, 3].map(i => puzzle(`${date}|h${i}`)),
})
const loaded = (date: string): LoadedDay => ({ day: day(date), requested: date, clamped: null })
const deferred = <T,>() => {
    let resolve!: (v: T) => void
    const promise = new Promise<T>(r => { resolve = r })
    return { promise, resolve }
}
const roots: RootStore[] = []
const harness = (extra: Partial<CoordinatorOptions> = {}, store: AttemptStore = memoryAttemptStore()) => {
    let wall = T0, mono = 100
    const loadDay = vi.fn(async (date: string) => loaded(date))
    const openStore = vi.fn(async () => store)
    const listen = vi.fn<NonNullable<CoordinatorOptions['listen']>>(() => vi.fn())
    const schedule = vi.fn(() => vi.fn())
    const root = new RootStore(new CorpusSource(), { challenge: true, coordinator: {
        openStore, loadDay, listen, schedule, clock: () => ({ wall, mono }), ...extra,
    } })
    roots.push(root)
    root.boardsStore.setDay(day())
    const service = root.challenge!
    const session = root.boardsStore.currentBoard!
    const binding = service.bindings.get(session)!
    return { root, service, session, binding, store, openStore, loadDay, listen, schedule,
        setTime: (w: number, m = mono) => { wall = w; mono = m } }
}
const begin = (h: ReturnType<typeof harness>) => h.service.change(h.binding,
    current => start(current, { puzzleId: h.binding.puzzleId, definitionHash: h.binding.definition.definitionHash, date: h.binding.date }, T0, DAY))
const saved = (id: string, extras: Partial<PuzzleProgress> = {}): PuzzleProgress => ({
    definitionHash: definitionFrom(puzzle(id)).definitionHash,
    board: [[null, -1], [null, -1]], completed: false, savedAt: T0, ...extras,
})
beforeEach(() => { window.localStorage.clear() })
afterEach(() => { for (const root of roots.splice(0)) root.dispose(); vi.restoreAllMocks() })

describe('inactive ownership and binding', () => {
    it('publishes the opening mode to an observer that read it before initialization', async () => {
        const writer = vi.fn(() => true)
        const h = harness({ writeProgress: writer })
        const modes: boolean[] = []
        const stop = autorun(() => { modes.push(h.service.unsaved) })
        try {
            expect(modes).toEqual([false])
            await h.service.start()
            expect(modes.at(-1)).toBe(true)
            await begin(h); h.session.placeToward([0, 0], 'down')
            expect(writer).not.toHaveBeenCalled()
        } finally { stop() }
    })
    it('does no challenge work in a default root', async () => {
        const openStore = vi.fn(async () => memoryAttemptStore())
        const root = new RootStore(new CorpusSource(), { coordinator: { openStore } })
        roots.push(root)
        root.boardsStore.setDay(day())
        await root.start()
        expect(root.challenge).toBeNull()
        expect(openStore).not.toHaveBeenCalled()
    })
    it('binds every daily session by explicit date, preserves matching sessions and rejects invalid dates', () => {
        const h = harness()
        expect(h.service.bindings.size).toBe(9)
        expect(h.binding.date).toBe(DAY)
        h.root.boardsStore.setDay(day())
        expect(h.root.boardsStore.currentBoard).toBe(h.session)
        expect(h.service.bindings.get(h.session)).toBe(h.binding)
        const standalone = new PuzzleSession(definitionFrom(puzzle('standalone')), h.root)
        expect(h.service.bindings.has(standalone)).toBe(false)
        expect(() => h.service.bind(standalone, '2026-02-31')).toThrow(/calendar/)
    })
    it('covers today and future, while archive dates stay casual even before initialization', () => {
        const h = harness()
        expect(h.service.isCovered(h.binding)).toBe(true)
        const future = h.service.bind(new PuzzleSession(definitionFrom(puzzle('future')), h.root), '2026-10-11')
        const old = h.service.bind(new PuzzleSession(definitionFrom(puzzle('past')), h.root), '2026-10-08')
        expect(h.service.isCovered(future)).toBe(true)
        expect(h.service.isCovered(old)).toBe(false)
    })
    it('initializes unsaved state without opening effects during construction', async () => {
        const h = harness()
        expect(h.openStore).not.toHaveBeenCalled()
        await h.root.start()
        expect(h.service.status).toBe('ready')
        expect(h.service.unsaved).toBe(true)
        expect(h.listen).toHaveBeenCalledTimes(1)
        expect(h.listen.mock.calls[0][2]).toBe(false)
        expect(h.schedule).toHaveBeenCalledTimes(1)
        expect(h.service.isCovered(h.binding)).toBe(true)
        await begin(h)
        expect(h.service.isCovered(h.binding)).toBe(false)
        h.setTime(T0 + 1234); h.service.tick()
        expect(h.service.elapsedFor(h.binding)).toBe(1234)
    })
})

describe('complete legacy initialization', () => {
    it.each(['persistent', 'memory'] as const)('retains progress cleanup semantics in %s mode', async mode => {
        const record = saved('expired-key', { savedAt: T0 - 15 * 86400000 })
        writeProgress('expired-key', record)
        const h = harness({}, mode === 'persistent' ? localStorageStore(window.localStorage) : memoryAttemptStore())
        await h.service.start()
        if (mode === 'persistent') expect(readProgress('expired-key')).toBeNull()
        else expect(readProgress('expired-key')).toEqual(record)
    })
    it('loads both actual dates across a month boundary and includes a valid empty progress record', async () => {
        const date = '2026-11-01'
        const prior = '2026-10-31'
        const record = saved(`${prior}|e1`, { savedAt: new Date(2026, 10, 1, 12).getTime() })
        const h = harness({ progress: () => ({ [`${prior}|e1`]: record }) })
        h.setTime(new Date(2026, 10, 1, 12).getTime())
        await h.service.start()
        expect(h.loadDay.mock.calls.map(([d]) => d)).toEqual([date, prior])
        expect(h.service.legacy?.marks).toEqual([`${prior}|e1`])
    })
    it('uses an existing legacy check without a fetch or rescan', async () => {
        const store = memoryAttemptStore()
        await store.legacyCheck(() => ['earlier'])
        const progress = vi.fn(() => ({}))
        const h = harness({ progress }, store)
        await h.service.start()
        expect(h.loadDay).not.toHaveBeenCalled()
        expect(h.service.legacy?.marks).toEqual(['earlier'])
    })
    it('a partial failed load never commits legacy and a retry loads the missing window', async () => {
        const store = memoryAttemptStore()
        const check = vi.spyOn(store, 'legacyCheck')
        let failed = true
        const h = harness({ loadDay: async date => {
            if (failed && date !== DAY) throw new Error('offline')
            return loaded(date)
        } }, store)
        await h.service.start()
        expect(h.service.status).toBe('retry')
        expect(check).not.toHaveBeenCalled()
        expect(h.service.isCovered(h.binding)).toBe(true)
        failed = false
        await h.service.retry()
        expect(h.service.status).toBe('ready')
        expect(check).toHaveBeenCalledTimes(1)
    })
    it('rebuilds the window if midnight passes while definitions load', async () => {
        const first = deferred<LoadedDay>()
        let count = 0
        const dates: string[] = []
        const h = harness({ loadDay: async date => {
            dates.push(date)
            if (++count === 1) return first.promise
            return loaded(date)
        } })
        const starting = h.service.start()
        await vi.waitFor(() => expect(dates).toHaveLength(2))
        h.setTime(new Date(2026, 9, 11, 0, 1).getTime())
        first.resolve(loaded(DAY))
        await starting
        expect(dates).toEqual([DAY, '2026-10-09', '2026-10-11', DAY])
        expect(h.service.status).toBe('ready')
    })
    it('excludes clamped substitute dates from marks', async () => {
        const id = `${DAY}|e1`
        const h = harness({ progress: () => ({ [id]: saved(id) }),
            loadDay: async date => ({ day: day(DAY), requested: date, clamped: 'after' }) })
        await h.service.start()
        expect(h.service.legacy?.marks).toEqual([])
    })
    it('rejects an unclamped response filed as a different requested date', async () => {
        const h = harness({ loadDay: async () => loaded('2026-10-08') })
        await h.service.start()
        expect(h.service.status).toBe('retry')
        expect(await h.store.readLegacy()).toBeNull()
    })
    it('keeps failed legacy commits retryable rather than ready', async () => {
        const store = { ...memoryAttemptStore(), kind: 'localStorage' as const,
            legacyCheck: vi.fn(async () => ({ committed: false, legacy: null })) }
        const h = harness({}, store)
        await h.service.start()
        expect(h.service.status).toBe('retry')
        expect(h.service.unsaved).toBe(false)
        expect(h.service.isCovered(h.binding)).toBe(true)
    })
    it('does not mark invalid or expired progress and keeps marked progress untouched', async () => {
        const id = `${DAY}|e1`
        const invalid = saved(`${DAY}|e2`, { definitionHash: 'wrong' })
        const expired = saved(`${DAY}|e3`, { savedAt: T0 - 15 * 86400000 })
        const record = saved(id, { board: [[1, -1], [0, -1]], completed: true })
        const h = harness({ progress: () => ({ [id]: record, [`${DAY}|e2`]: invalid, [`${DAY}|e3`]: expired }) })
        await h.service.start()
        expect(h.service.legacy?.marks).toEqual([id])
        expect(h.session.board).toEqual(record.board)
        expect(h.service.isCovered(h.binding)).toBe(false)
        expect(h.binding.attempt).toBeNull()
    })
})

describe('history, evidence and refresh', () => {
    it('retries a newly bound session’s failed opening without changing backend', async () => {
        const store = { ...memoryAttemptStore(), kind: 'localStorage' as const }
        const h = harness({}, store)
        await h.service.start()
        vi.spyOn(store, 'change').mockResolvedValueOnce({ committed: false, changed: false, attempt: null })
        h.root.boardsStore.setDay(day(addDays(DAY, -1)))
        const binding = h.service.bindings.get(h.root.boardsStore.currentBoard!)!
        await vi.waitFor(() => expect(binding.error).toBe('save'))
        expect(binding.ready).toBe(false)
        await h.service.retry()
        expect(binding.ready).toBe(true)
        expect(h.service.unsaved).toBe(false)
        expect(h.openStore).toHaveBeenCalledTimes(1)
    })
    it('samples unsaved clocks on local focus without opening any cross-tab channel', async () => {
        const channel = vi.fn()
        vi.stubGlobal('BroadcastChannel', channel)
        try {
            const h = harness({ listen: undefined })
            await h.service.start(); await begin(h)
            h.setTime(T0 + 123, 223)
            window.dispatchEvent(new Event('focus'))
            expect(h.service.elapsedFor(h.binding)).toBe(123)
            expect(channel).not.toHaveBeenCalled()
            h.service.dispose()
            h.setTime(T0 + 555, 655)
            window.dispatchEvent(new Event('focus'))
            expect(h.service.now.wall).toBe(T0 + 123)
        } finally { vi.unstubAllGlobals() }
    })
    it('settles all stored attempts using the raw device date, including unfetched IDs', async () => {
        const store = memoryAttemptStore()
        const old = { puzzleId: 'not-fetched', definitionHash: 'h', date: '2026-10-08' }
        await store.change(old.puzzleId, current => start(current, old, T0 - 86400000, old.date))
        const h = harness({}, store)
        await h.service.start()
        expect((await store.read(old.puzzleId))?.result).toEqual({ kind: 'given-up' })
    })
    it('recovers durable solved evidence before settling an unfetched expired attempt without fetching it', async () => {
        const store = localStorageStore(window.localStorage)
        const id = 'opaque-old-board'
        const definition = definitionFrom(puzzle(id))
        await store.legacyCheck(() => [])
        await store.change(id, current => start(current, { puzzleId: id, definitionHash: definition.definitionHash, date: '2026-10-08' }, T0 - 2 * 86400000, '2026-10-08'))
        writeProgress(id, saved(id, { attemptStartedAt: T0 - 2 * 86400000,
            board: [[1, -1], [0, -1]], completed: true,
            solveEvidence: { solvedAt: T0 - 86400000, solvedOn: '2026-10-09', columnTargets: '1,0', rowTargets: '1,0' } }))
        const h = harness({}, store)
        await h.service.start()
        expect((await store.read(id))?.result).toEqual({ kind: 'untimed', reason: 'finish-lost' })
        expect(h.loadDay).not.toHaveBeenCalled()
    })
    it.each(['expired', 'wrong-stamp'] as const)('does not recover %s progress evidence', async fault => {
        const store = localStorageStore(window.localStorage)
        const id = 'old-no-evidence'
        const definition = definitionFrom(puzzle(id))
        await store.change(id, current => start(current, { puzzleId: id, definitionHash: definition.definitionHash, date: '2026-10-08' }, T0 - 2 * 86400000, '2026-10-08'))
        writeProgress(id, saved(id, { savedAt: fault === 'expired' ? T0 - 15 * 86400000 : T0,
            attemptStartedAt: fault === 'wrong-stamp' ? 999 : T0 - 2 * 86400000,
            board: [[1, -1], [0, -1]], solveEvidence: { solvedAt: T0, solvedOn: '2026-10-09', columnTargets: '1,0', rowTargets: '1,0' } }))
        if (fault === 'expired') vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => { throw new Error('cleanup blocked') })
        const h = harness({}, store)
        await h.service.start()
        expect((await store.read(id))?.result).toEqual({ kind: 'given-up' })
    })
    it('a failed history read is retryable on the chosen store, never unsaved play', async () => {
        const store = { ...memoryAttemptStore(), kind: 'localStorage' as const }
        const readAll = vi.spyOn(store, 'readAll').mockResolvedValueOnce(null)
        const h = harness({}, store)
        await h.service.start()
        expect(h.service.status).toBe('retry')
        expect(h.service.unsaved).toBe(false)
        expect(h.service.isCovered(h.binding)).toBe(true)
        await h.service.retry()
        expect(h.service.status).toBe('ready')
        expect(h.openStore).toHaveBeenCalledTimes(1)
        expect(readAll).toHaveBeenCalledTimes(2)
    })
    it('refreshes inactive sessions on focus and validated channel notices without copying their boards', async () => {
        let wake!: () => void, notice!: (id: string) => void
        const store = localStorageStore(window.localStorage)
        const h = harness({ listen: (w, n) => { wake = w; notice = n; return () => {} } }, store)
        await h.service.start()
        await begin(h)
        await store.change(h.binding.puzzleId, markAssisted)
        notice(h.binding.puzzleId)
        await vi.waitFor(() => expect(h.binding.attempt?.assisted).toBe(true))
        const second = [...h.service.bindings.values()][1]
        await store.change(second.puzzleId, current => finish(start(current,
            { puzzleId: second.puzzleId, definitionHash: second.definition.definitionHash, date: DAY }, T0, DAY).next, T0 + 50, DAY))
        wake()
        await vi.waitFor(() => expect(second.finished).toBe(true))
        expect(second.session.completed).toBe(false)
        expect(h.binding.attempt?.assisted).toBe(true)
    })
    it('enumerates on changed device date, not every tick, and expires a held-back board', async () => {
        const h = harness()
        const history = vi.spyOn(h.store, 'readAll')
        await h.service.start(); await begin(h)
        h.setTime(T0 + 1000, 1100); h.service.tick()
        expect(history).toHaveBeenCalledTimes(1)
        h.setTime(new Date(2026, 9, 12, 0, 0).getTime(), 2000); h.service.tick()
        await vi.waitFor(() => expect(h.binding.attempt?.result).toEqual({ kind: 'given-up' }))
        expect(history).toHaveBeenCalledTimes(2)
        expect(h.service.isCovered(h.binding)).toBe(false)
    })
    it('merges a failed clock flag into a later transaction and never clears it by a refresh', async () => {
        const store = { ...memoryAttemptStore(), kind: 'localStorage' as const }
        const h = harness({}, store)
        await h.service.start(); await begin(h)
        const real = store.change
        const change = vi.spyOn(store, 'change').mockResolvedValueOnce({ committed: false, changed: false, attempt: h.binding.attempt })
        h.setTime(T0 - 6000, 1100); h.service.tick()
        expect(h.binding.clockErrorPending).toBe(true)
        await vi.waitFor(() => expect(change).toHaveBeenCalledTimes(1))
        change.mockImplementation(real)
        await h.service.refresh()
        expect(h.binding.attempt?.clockError).toBe(true)
        expect(h.binding.clockErrorPending).toBe(false)
        const outcome = await h.service.change(h.binding, current => finish(current, T0 + 50, DAY))
        expect(outcome.attempt?.result).toEqual({ kind: 'untimed', reason: 'clock-error' })
    })
    it.each(['hash', 'date'] as const)('rejects a valid saved attempt of different %s instead of adopting its result', async fault => {
        const h = harness()
        await h.store.change(h.binding.puzzleId, current => start(current,
            { puzzleId: h.binding.puzzleId, definitionHash: fault === 'hash' ? 'different' : h.binding.definition.definitionHash,
                date: fault === 'date' ? addDays(DAY, -1) : DAY }, T0, fault === 'date' ? addDays(DAY, -1) : DAY))
        await h.service.start()
        expect(h.binding.error).toBe('identity')
        expect(h.binding.ready).toBe(false)
        expect(h.service.isCovered(h.binding)).toBe(true)
    })
    it('keeps a future board covered even when storage already holds its attempt', async () => {
        const h = harness()
        const future = h.service.bind(new PuzzleSession(definitionFrom(puzzle('future-saved')), h.root), addDays(DAY, 1))
        await h.store.change(future.puzzleId, current => start(current,
            { puzzleId: future.puzzleId, definitionHash: future.definition.definitionHash, date: future.date }, T0, future.date))
        await h.service.start()
        expect(future.ready).toBe(true)
        expect(h.service.isCovered(future)).toBe(true)
    })
    it.each([undefined, 77, T0] as const)('restores attempt progress only with matching stamp %s', async stamp => {
        const id = `${DAY}|e1`
        const record = saved(id, { board: [[1, -1], [0, -1]], completed: true, attemptStartedAt: stamp })
        const h = harness({ progress: () => ({ [id]: record }) })
        await h.store.legacyCheck(() => [])
        await h.store.change(id, current => start(current,
            { puzzleId: id, definitionHash: h.binding.definition.definitionHash, date: DAY }, T0, DAY))
        await h.service.start()
        expect(h.session.board).toEqual(stamp === T0 ? record.board : h.binding.definition.initialBoard)
    })
})

describe('owned effects and delayed operations', () => {
    it('suppresses a late opener after disposal and closes it without listeners or timer', async () => {
        const pending = deferred<AttemptStore>()
        const store = memoryAttemptStore()
        const close = vi.spyOn(store, 'close')
        const h = harness({ openStore: () => pending.promise })
        const starting = h.service.start()
        h.service.dispose(); pending.resolve(store); await starting
        expect(close).toHaveBeenCalledTimes(1)
        expect(h.service.status).toBe('idle')
        expect(h.schedule).not.toHaveBeenCalled()
        expect(h.listen).not.toHaveBeenCalled()
        expect(h.binding.ready).toBe(false)
    })
    it('handles setup-cleanup-setup during an open without duplicate effects or store selection', async () => {
        const pending = deferred<AttemptStore>()
        const store = memoryAttemptStore()
        const open = vi.fn(() => pending.promise)
        const h = harness({ openStore: open })
        const first = h.service.start()
        h.service.dispose()
        const second = h.service.start()
        pending.resolve(store)
        await Promise.all([first, second])
        expect(h.service.status).toBe('ready')
        expect(open).toHaveBeenCalledTimes(1)
        expect(h.schedule).toHaveBeenCalledTimes(1)
    })
    it('reopens the same selected persistent backend and disposes every owned resource', async () => {
        const stores = [localStorageStore(window.localStorage), localStorageStore(window.localStorage)]
        const closes = stores.map(s => vi.spyOn(s, 'close'))
        const open = vi.fn<(kind?: AttemptStore['kind']) => Promise<AttemptStore>>(async () => stores.shift()!)
        const h = harness({ openStore: open })
        await h.service.start()
        const stopListen = h.listen.mock.results[0].value
        const stopTimer = h.schedule.mock.results[0].value
        h.service.dispose()
        expect(stopListen).toHaveBeenCalledTimes(1)
        expect(stopTimer).toHaveBeenCalledTimes(1)
        expect(closes[0]).toHaveBeenCalledTimes(1)
        await h.service.start()
        expect(open.mock.calls).toEqual([[undefined], ['localStorage']])
        expect(h.listen).toHaveBeenCalledTimes(2)
    })
    it('serializes overlapping changes and lets a fixed result dominate a later assist', async () => {
        const h = harness()
        await h.service.start(); await begin(h)
        const original = h.store.change
        const waiting = deferred<void>()
        let active = 0, maximum = 0
        h.store.change = async (id, step) => {
            maximum = Math.max(maximum, ++active)
            await waiting.promise
            const result = await original(id, step)
            active--
            return result
        }
        const finishing = h.service.change(h.binding, current => finish(current, T0 + 100, DAY))
        const assisting = h.service.change(h.binding, markAssisted)
        await vi.waitFor(() => expect(active).toBeGreaterThan(0))
        waiting.resolve()
        await Promise.all([finishing, assisting])
        expect(maximum).toBe(1)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 100 })
        expect(h.binding.attempt?.assisted).toBe(false)
    })
    it('does not publish a stale result after disposal during a transaction', async () => {
        const h = harness()
        await h.service.start(); await begin(h)
        const pending = deferred<Awaited<ReturnType<AttemptStore['change']>>>()
        h.store.change = () => pending.promise
        const changing = h.service.change(h.binding, markAssisted)
        await Promise.resolve(); await Promise.resolve()
        h.service.dispose()
        pending.resolve({ committed: true, changed: true, attempt: { ...h.binding.attempt!, assisted: true } })
        await changing
        expect(h.binding.attempt?.assisted).toBe(false)
        expect(h.binding.ready).toBe(false)
    })
})

describe('enabled-only progress retry', () => {
    it('selects the first unsolved after a new day’s fixed results finish loading', async () => {
        const h = harness()
        await h.service.start()
        const next = day(addDays(DAY, -1))
        const definition = definitionFrom(next.easyBoards[0])
        await h.store.change(definition.puzzleId, current => finish(start(current,
            { puzzleId: definition.puzzleId, definitionHash: definition.definitionHash, date: next.date }, T0 - 86400000, next.date).next,
            T0 - 86400000 + 100, next.date))
        h.root.boardsStore.setDay(next)
        await vi.waitFor(() => expect(h.root.boardsStore.level).toBe(2))
        expect(h.root.boardsStore.currentBoard!.completed).toBe(false)
    })
    it('does not override navigation while a new day’s fixed results load', async () => {
        const h = harness()
        await h.service.start()
        const next = day(addDays(DAY, -1))
        const definition = definitionFrom(next.easyBoards[0])
        await h.store.change(definition.puzzleId, current => finish(start(current,
            { puzzleId: definition.puzzleId, definitionHash: definition.definitionHash, date: next.date }, T0 - 86400000, next.date).next,
            T0 - 86400000 + 100, next.date))
        h.root.boardsStore.setDay(next)
        h.root.boardsStore.setLevel(3)
        await h.service.whenBound([...h.root.boardsStore.sessions.values()])
        await Promise.resolve()
        expect(h.root.boardsStore.level).toBe(3)
    })
    it('preserves casual archive completion after a challenge was given up', async () => {
        const store = localStorageStore(window.localStorage)
        const old = day(addDays(DAY, -2))
        const definition = definitionFrom(old.easyBoards[0])
        const startedAt = T0 - 2 * 86400000
        await store.change(definition.puzzleId, current => start(current,
            { puzzleId: definition.puzzleId, definitionHash: definition.definitionHash, date: old.date }, startedAt, old.date))
        writeProgress(definition.puzzleId, saved(definition.puzzleId,
            { board: [[1, -1], [0, -1]], completed: true, attemptStartedAt: startedAt }))
        const h = harness({}, store)
        h.root.boardsStore.setDay(old)
        await h.service.start()
        expect(h.root.boardsStore.level).toBe(2)
        expect((await store.read(definition.puzzleId))?.result).toEqual({ kind: 'given-up' })
    })
    it('keeps the disabled casual failed-write baseline instead of retrying unchanged progress', async () => {
        const root = new RootStore()
        roots.push(root)
        root.boardsStore.setDay(day())
        const set = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        root.boardsStore.currentBoard!.placeToward([0, 0], 'down')
        const attempts = set.mock.calls.length
        set.mockClear()
        root.boardsStore.persist(root.boardsStore.progressSnapshot)
        await root.start()
        expect(attempts).toBeGreaterThan(0)
        expect(set).not.toHaveBeenCalled()
        expect(readProgress(`${DAY}|e1`)).toBeNull()
    })
    it('leaves unchanged enabled boards and another tab’s saved progress untouched', async () => {
        const writer = vi.fn(() => true)
        const h = harness({ writeProgress: writer }, { ...memoryAttemptStore(), kind: 'localStorage' as const })
        await h.service.start()
        const other = saved(h.binding.puzzleId, { board: [[1, -1], [0, -1]], completed: true })
        writeProgress(h.binding.puzzleId, other)
        h.root.boardsStore.persist(h.root.boardsStore.progressSnapshot)
        expect(writer).not.toHaveBeenCalled()
        expect(readProgress(h.binding.puzzleId)).toEqual(other)
        h.service.retryProgress()
        expect(writer).not.toHaveBeenCalled()
    })
    it('retains failed progress and retries the original generation without restamping', async () => {
        const writer = vi.fn(() => false)
        const store = { ...memoryAttemptStore(), kind: 'localStorage' as const }
        const h = harness({ writeProgress: writer }, store)
        await h.service.start()
        await begin(h)
        h.session.placeToward([0, 0], 'down')
        expect(writer).toHaveBeenCalled()
        expect(h.binding.progressSaveFailed).toBe(true)
        const record = writer.mock.calls.at(-1)!
        h.setTime(T0 + 1000, 1100)
        writer.mockReturnValue(true); h.service.tick()
        expect(writer.mock.calls.at(-1)).toEqual(record)
        expect(h.binding.progressSaveFailed).toBe(false)
    })
    it('a newer local mutation supersedes a failed snapshot and successful retry cannot drop its generation', async () => {
        let reentered = false
        const writer = vi.fn<(id: string, record: PuzzleProgress) => boolean>(() => {
            if (!reentered) {
                reentered = true
                h.service.captureProgress(h.binding, { ...h.binding.baseline, completed: false, board: [[null, -1], [null, -1]] })
                return true
            }
            return false
        })
        const h = harness({ writeProgress: writer }, { ...memoryAttemptStore(), kind: 'localStorage' as const })
        await h.service.start()
        h.service.captureProgress(h.binding, { ...h.binding.baseline, completed: true, board: [[1, -1], [0, -1]] })
        expect(h.binding.progressSaveFailed).toBe(true)
        writer.mockReturnValue(true)
        h.service.retryProgress()
        expect(writer.mock.calls.at(-1)![1].board).toEqual([[null, -1], [null, -1]])
        expect(h.binding.progressSaveFailed).toBe(false)
    })
    it('never writes unchanged sessions, another puzzle, or a memory-mode board to persistent storage', async () => {
        const writer = vi.fn(() => true)
        const h = harness({ writeProgress: writer })
        await h.service.start(); await begin(h)
        h.session.placeToward([0, 0], 'down')
        h.service.tick()
        expect(writer).not.toHaveBeenCalled()
        expect(readProgress(h.binding.puzzleId)).toBeNull()
        expect(h.binding.progressSaveFailed).toBe(false)
    })
    it('retries a retired session only until its pending save finishes, then removes the binding', async () => {
        const writer = vi.fn(() => false)
        const h = harness({ writeProgress: writer }, { ...memoryAttemptStore(), kind: 'localStorage' as const })
        await h.service.start()
        await begin(h)
        h.session.placeToward([0, 0], 'down')
        await vi.waitFor(() => expect(h.binding.attempt?.result).toBeDefined())
        h.root.boardsStore.setDay(day(addDays(DAY, -1)))
        expect(h.service.bindings.has(h.session)).toBe(true)
        writer.mockReturnValue(true); h.service.retryProgress()
        expect(h.service.bindings.has(h.session)).toBe(false)
    })
    it('metadata alone counts as a progress change and survives a successful enabled save', async () => {
        const h = harness({}, localStorageStore(window.localStorage))
        await h.service.start(); await begin(h)
        expect(readProgress(h.binding.puzzleId)?.attemptStartedAt).toBe(T0)
        expect(readProgress(h.binding.puzzleId)?.solveEvidence).toBeUndefined()
    })
    it('changed solve evidence triggers a metadata-only enabled progress save', async () => {
        const h = harness({}, localStorageStore(window.localStorage))
        await h.service.start(); await begin(h)
        h.session.placeToward([0, 0], 'down')
        const evidence = { solvedAt: T0 + 20, solvedOn: DAY, columnTargets: '1,0', rowTargets: '1,0' }
        runInAction(() => { h.binding.solveEvidence = evidence })
        expect(readProgress(h.binding.puzzleId)?.solveEvidence).toEqual(evidence)
    })
    it('uses fixed challenge completion for first-unsolved selection despite a Practice-like empty board', async () => {
        const h = harness()
        await h.service.start(); await begin(h)
        await h.service.change(h.binding, current => finish(current, T0 + 10, DAY))
        runInAction(() => { h.session.completed = false })
        h.root.boardsStore.selectFirstUnsolved()
        expect(h.root.boardsStore.level).toBe(2)
        expect(h.binding.finished).toBe(true)
    })
})
