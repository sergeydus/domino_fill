// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autorun } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { CorpusSource, type LoadedDay } from '@/app/stores/corpusSource'
import type { DayEntry } from '@/app/stores/corpus'
import { localStorageStore } from '@/app/challenge/attemptStore'
import type { CoordinatorOptions } from '@/app/challenge/coordinator'
import { readProgress } from '@/app/stores/progressStorage'

vi.mock('@/app/dominoFill/feedback', () => ({ winFeedback: vi.fn() }))

const FIRST = '2026-09-01'
const LAST = '2036-08-31'
const noon = (date: string) => {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d, 12).getTime()
}
const day = (date: string): DayEntry => {
    const boards = (size: string) => [1, 2, 3].map(n => ({
        puzzleId: `${date}|${size}${n}`, board: [[null, null], [null, null]],
        boardHorizontalNumbers: '1,1', boardVerticalNumbers: '2,0',
    }))
    return { date, easyBoards: boards('e'), mediumBoards: boards('m'), hardBoards: boards('h') }
}
const response = (date: string, requested = date, clamped: LoadedDay['clamped'] = null): LoadedDay =>
    ({ day: day(date), requested, clamped })
const loadDay = async (requested: string) => requested < FIRST ? response(FIRST, requested, 'before')
    : requested > LAST ? response(LAST, requested, 'after') : response(requested)
const roots: RootStore[] = []
const harness = (date: string, extra: Partial<CoordinatorOptions> = {}) => {
    let wall = noon(date)
    const store = localStorageStore(window.localStorage)
    const root = new RootStore(new CorpusSource(), { challenge: true, coordinator: {
        clock: () => ({ wall, mono: 100 }), openStore: async () => store, loadDay,
        listen: () => () => {}, schedule: () => () => {},
        ...extra,
    } })
    roots.push(root)
    const service = root.challenge!
    const receive = (loaded: LoadedDay) => root.boardsStore.receiveDay(loaded)
    const selected = () => {
        const session = root.boardsStore.currentBoard!
        return { session, binding: service.bindings.get(session)! }
    }
    return { root, service, store, receive, selected, setTime: (time: number) => { wall = time } }
}
const firstColumn = [[1, null], [0, null]]
const solve = (h: ReturnType<typeof harness>, at: number) => {
    const { session } = h.selected()
    expect(session.placeToward([0, 0], 'down')).toBe(true)
    h.setTime(at)
    expect(session.placeToward([0, 1], 'down')).toBe(true)
}
const finishedFirst = async () => {
    const h = harness(FIRST)
    h.receive(response(FIRST))
    await h.root.start()
    expect(await h.selected().session.startChallenge()).toBe(true)
    solve(h, noon(FIRST) + 20)
    await vi.waitFor(() => expect(h.selected().binding.attempt?.result).toEqual({ kind: 'solved', ms: 20 }))
    return h
}
beforeEach(() => { window.localStorage.clear() })
afterEach(() => {
    for (const root of roots.splice(0)) {
        root.dispose()
        root.boardsStore.disposePersist?.()
    }
    vi.restoreAllMocks()
})

describe('explicit corpus-clamp provenance', () => {
    it('a before-clamp is uncovered and playable before initialization, with synchronous advice', async () => {
        const h = harness('2026-08-31')
        h.receive(response(FIRST, '2026-08-31', 'before'))
        const { session, binding } = h.selected()
        const opening = h.root.start()
        expect(h.root.boardsStore.viewingDate).toBe(FIRST)
        expect(h.root.boardsStore.deviceToday).toBe('2026-08-31')
        expect(h.service.isCovered(binding)).toBe(false)
        expect(session.placeToward([0, 0], 'down')).toBe(true)
        expect(session.requestHint()).not.toBeInstanceOf(Promise)
        expect(session.hint()).not.toBeNull()
        expect(session.check()).not.toBeNull()
        expect(await session.startChallenge()).toBe(false)
        await opening
        expect(session.board).toEqual(firstColumn)
        expect(h.service.isCovered(binding)).toBe(false)
        expect(readProgress(binding.puzzleId)?.board).toEqual(firstColumn)
    })
    it('a before-clamp solve persists casual progress without an attempt, evidence or Practice', async () => {
        const h = harness('2026-08-31')
        h.receive(response(FIRST, '2026-08-31', 'before'))
        await h.root.start()
        const { session, binding } = h.selected()
        solve(h, noon('2026-08-31') + 30)
        expect(session.completed).toBe(true)
        expect(readProgress(binding.puzzleId)?.completed).toBe(true)
        expect(readProgress(binding.puzzleId)?.solveEvidence).toBeUndefined()
        expect(binding.pendingFinish).toBeNull()
        expect(binding.practice).toBeNull()
        expect(await h.store.readAll()).toEqual([])
        session.undo()
        expect(binding.practice).toBeNull()
        expect(binding.solveEvidence).toBeUndefined()
    })
    it('ready before-clamp advice stays synchronous without an assistance transaction', async () => {
        const h = harness('2026-08-31')
        h.receive(response(FIRST, '2026-08-31', 'before'))
        await h.root.start()
        const { session } = h.selected()
        const change = vi.spyOn(h.store, 'change')
        expect(session.requestHint()).not.toBeInstanceOf(Promise)
        expect(session.requestCheck()).not.toBeInstanceOf(Promise)
        expect(session.advice).not.toBeNull()
        expect(change).not.toHaveBeenCalled()
        expect(await h.store.readAll()).toEqual([])
    })
    it('an unclamped future day remains covered and cannot Start or mutate', async () => {
        const h = harness('2026-08-31')
        h.receive(response(FIRST))
        await h.root.start()
        const { session, binding } = h.selected()
        expect(h.service.isCovered(binding)).toBe(true)
        expect(await session.startChallenge()).toBe(false)
        expect(session.placeToward([0, 0], 'down')).toBe(false)
        expect(session.hint()).toBeNull()
        expect(await h.store.readAll()).toEqual([])
    })
    it('after-clamp at lastDate plus one remains covered, requires Start and records a timed result', async () => {
        const h = harness('2036-09-01')
        h.receive(response(LAST, '2036-09-01', 'after'))
        await h.root.start()
        const { session, binding } = h.selected()
        expect(h.service.isCovered(binding)).toBe(true)
        expect(session.placeToward([0, 0], 'down')).toBe(false)
        expect(h.service.canStart(binding)).toBe(true)
        h.root.boardsStore.setDay(day(LAST))
        expect(h.selected().session).toBe(session)
        expect(h.service.isCovered(binding)).toBe(true)
        expect(await session.startChallenge()).toBe(true)
        h.receive(response(LAST, '2036-09-01', 'after'))
        solve(h, noon('2036-09-01') + 40)
        await vi.waitFor(() => expect(binding.attempt?.result).toEqual({ kind: 'solved', ms: 40 }))
        expect(binding.beforeClamp).toBe(false)
    })
    it('after-clamp at lastDate plus two is ordinary casual archive play', async () => {
        const h = harness('2036-09-02')
        h.receive(response(LAST, '2036-09-02', 'after'))
        await h.root.start()
        const { session, binding } = h.selected()
        expect(h.service.isCovered(binding)).toBe(false)
        expect(session.placeToward([0, 0], 'down')).toBe(true)
        expect(session.hint()).not.toBeNull()
        expect(await session.startChallenge()).toBe(false)
        expect(await h.store.readAll()).toEqual([])
    })
    it('matching refetch changes only provenance, preserves moves, and publishes the new cover', async () => {
        const h = harness('2026-08-31')
        h.receive(response(FIRST, '2026-08-31', 'before'))
        await h.root.start()
        const { session, binding } = h.selected()
        session.placeToward([0, 0], 'down')
        const cover: boolean[] = []
        const stop = autorun(() => { cover.push(h.service.isCovered(binding)) })
        try {
            h.receive(response(FIRST))
            expect(h.selected().session).toBe(session)
            expect(h.selected().binding).toBe(binding)
            expect(session.board).toEqual(firstColumn)
            expect(session.moves).toHaveLength(1)
            expect(cover.at(-1)).toBe(true)
            h.receive(response(FIRST, '2026-08-31', 'before'))
            expect(cover.at(-1)).toBe(false)
            expect(session.board).toEqual(firstColumn)
        } finally { stop() }
    })
    it('held before-clamp provenance cannot uncover the active future board and survives adoption', async () => {
        const h = harness(LAST)
        h.receive(response(LAST))
        await h.root.start()
        const original = h.selected()
        await original.session.startChallenge()
        original.session.placeToward([0, 0], 'down')
        h.setTime(noon('2026-08-31'))
        h.receive(response(FIRST, '2026-08-31', 'before'))
        h.service.tick()
        expect(h.root.boardsStore.clockClamp).toBe('before')
        expect(h.selected().session).toBe(original.session)
        expect(original.binding.clamp).toBeNull()
        expect(h.service.isCovered(original.binding)).toBe(true)
        expect(h.root.boardsStore.pendingDay?.date).toBe(FIRST)
        h.root.boardsStore.adoptPendingDay()
        const adopted = h.selected()
        expect(adopted.session).not.toBe(original.session)
        expect(adopted.binding.date).toBe(FIRST)
        expect(h.service.isCovered(adopted.binding)).toBe(false)
        expect(adopted.session.placeToward([0, 0], 'down')).toBe(true)
        expect(h.root.boardsStore.pendingDay).toBeNull()
        expect(h.root.boardsStore.pendingDayClamp).toBeNull()
    })
    it('held after-clamp provenance keeps the active before-clamp and adopts an ordinary challenge', async () => {
        const h = harness('2026-08-31')
        h.receive(response(FIRST, '2026-08-31', 'before'))
        await h.root.start()
        const original = h.selected()
        original.session.placeToward([0, 0], 'down')
        h.setTime(noon('2036-09-01'))
        h.receive(response(LAST, '2036-09-01', 'after'))
        h.service.tick()
        expect(original.binding.clamp).toBe('before')
        expect(h.selected().session).toBe(original.session)
        h.root.boardsStore.adoptPendingDay()
        const adopted = h.selected()
        await h.service.whenBound([adopted.session])
        expect(adopted.binding.clamp).toBe('after')
        expect(h.service.isCovered(adopted.binding)).toBe(true)
        expect(await adopted.session.startChallenge()).toBe(true)
    })
    it('superseding a pending response clears its clamp and keeps the selected response mode', async () => {
        const h = harness(LAST)
        h.receive(response(LAST))
        await h.root.start()
        const { session, binding } = h.selected()
        await session.startChallenge()
        session.placeToward([0, 0], 'down')
        h.receive(response(FIRST, '2026-08-31', 'before'))
        expect(h.root.boardsStore.pendingDayClamp).toBe('before')
        h.receive(response(LAST))
        expect(h.root.boardsStore.pendingDay).toBeNull()
        expect(h.root.boardsStore.pendingDayClamp).toBeNull()
        expect(binding.clamp).toBeNull()
        expect(session.board).toEqual(firstColumn)
    })
    it('a matching refetch cannot replace another response\'s pending provenance', async () => {
        const h = harness('2026-08-31')
        h.receive(response(FIRST, '2026-08-31', 'before'))
        await h.root.start()
        h.selected().session.placeToward([0, 0], 'down')
        h.setTime(noon('2026-09-02'))
        h.receive(response('2026-09-02'))
        expect(h.root.boardsStore.pendingDay?.date).toBe('2026-09-02')
        h.setTime(noon('2026-08-31'))
        h.receive(response(FIRST, '2026-08-31', 'before'))
        h.service.tick()
        expect(h.root.boardsStore.clockClamp).toBe('before')
        expect(h.root.boardsStore.pendingDay?.date).toBe('2026-09-02')
        h.root.boardsStore.adoptPendingDay()
        const adopted = h.selected()
        expect(h.service.isCovered(adopted.binding)).toBe(true)
        expect(adopted.session.placeToward([0, 0], 'down')).toBe(false)
    })
    it.each([true, false])('initialization failure leaves only a before-clamp casual: %s', async before => {
        const h = harness(before ? '2026-08-31' : FIRST, {
            loadDay: async () => { throw new Error('offline') },
        })
        h.receive(response(FIRST, before ? '2026-08-31' : FIRST, before ? 'before' : null))
        await h.root.start()
        const { session, binding } = h.selected()
        expect(h.service.status).toBe('retry')
        expect(h.service.isCovered(binding)).toBe(!before)
        expect(await session.startChallenge()).toBe(false)
        expect(session.placeToward([0, 0], 'down')).toBe(before)
        if (before) {
            expect(session.hint()).not.toBeNull()
            expect(readProgress(binding.puzzleId)?.board).toEqual(firstColumn)
        } else {
            expect(session.hint()).toBeNull()
            expect(readProgress(binding.puzzleId)).toBeNull()
        }
        expect(await h.store.readAll()).toEqual([])
    })
    it('a corrected response stays casual after the clock enters its window until an unclamped refetch', async () => {
        const h = harness('2026-08-31')
        h.receive(response(FIRST, '2026-08-31', 'before'))
        await h.root.start()
        const { session, binding } = h.selected()
        h.setTime(noon(FIRST))
        h.service.tick()
        await h.service.refresh()
        expect(h.service.isCovered(binding)).toBe(false)
        expect(h.service.canStart(binding)).toBe(false)
        expect(await session.startChallenge()).toBe(false)
        expect(session.placeToward([0, 0], 'down')).toBe(true)
        h.receive(response(FIRST))
        expect(h.service.isCovered(binding)).toBe(true)
        expect(await session.startChallenge()).toBe(true)
        expect(session.board).toEqual(session.definition.initialBoard)
    })
    it('before-clamp refetch clears live solve evidence and hides the clock without rewriting a fixed result', async () => {
        const h = await finishedFirst()
        const { session, binding } = h.selected()
        const first = await h.store.read(binding.puzzleId)
        expect(binding.solveEvidence).toBeDefined()
        h.setTime(noon('2026-08-31'))
        h.receive(response(FIRST, '2026-08-31', 'before'))
        expect(binding.solveEvidence).toBeUndefined()
        expect(h.selected().session).toBe(session)
        h.setTime(noon(FIRST) + 100)
        h.service.tick()
        await h.service.refresh()
        expect(h.service.elapsedFor(binding)).toBeNull()
        expect(await h.store.read(binding.puzzleId)).toEqual(first)
        h.root.boardsStore.setLevel(1)
        expect(h.selected().session).toBe(session)
        session.reset()
        solve(h, noon(FIRST) + 150)
        expect(binding.practice).toBeNull()
        expect(binding.pendingFinish).toBeNull()
        expect(readProgress(binding.puzzleId)?.solveEvidence).toBeUndefined()
        expect(await h.store.read(binding.puzzleId)).toEqual(first)
    })
    it('before-clamp refetch discards an existing Practice run', async () => {
        const h = await finishedFirst()
        const { session, binding } = h.selected()
        session.undo()
        expect(binding.practice).not.toBeNull()
        h.setTime(noon('2026-08-31'))
        h.receive(response(FIRST, '2026-08-31', 'before'))
        expect(binding.practice).toBeNull()
        expect(session.board).toEqual(firstColumn)
        expect(binding.attempt?.result).toEqual({ kind: 'solved', ms: 20 })
    })
    it('new-root before-clamp hydration omits old solve evidence and preserves the fixed record', async () => {
        const h = await finishedFirst()
        const { binding } = h.selected()
        const first = await h.store.read(binding.puzzleId)
        expect(readProgress(binding.puzzleId)?.solveEvidence).toBeDefined()
        h.root.dispose()
        const reopened = harness('2026-08-31')
        reopened.receive(response(FIRST, '2026-08-31', 'before'))
        await reopened.root.start()
        reopened.root.boardsStore.setLevel(1)
        const restored = reopened.selected()
        expect(restored.binding.solveEvidence).toBeUndefined()
        expect(restored.session.completed).toBe(true)
        expect(await reopened.store.read(restored.binding.puzzleId)).toEqual(first)
    })
})
