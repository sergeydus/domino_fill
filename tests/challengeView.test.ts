// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reaction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { CorpusSource, type LoadedDay } from '@/app/stores/corpusSource'
import type { PuzzleSession } from '@/app/stores/PuzzleSession'
import type { StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import type { DayEntry } from '@/app/stores/corpus'
import { isCoveredView, type CoordinatorOptions } from '@/app/challenge/coordinator'
import { localStorageStore, memoryAttemptStore, type AttemptStore } from '@/app/challenge/attemptStore'
import { finish, RULESET, start, type Attempt } from '@/app/challenge/attempt'
import { readProgress, writeProgress } from '@/app/stores/progressStorage'
import { winFeedback } from '@/app/dominoFill/feedback'

vi.mock('@/app/dominoFill/feedback', () => ({ winFeedback: vi.fn() }))

/*
 * Slice 3a, rules 6-8: the one view every component reads, the forward-only history, and
 * where "Next board" goes. Every state here comes from the real coordinator and sessions,
 * driven the way the game drives them; nothing is constructed by hand except stored records.
 */

const DAY = '2026-10-10'
const T0 = new Date(2026, 9, 10, 12).getTime()
const HOUR = 3_600_000
const puzzle = (id: string): StoredPuzzle => ({
    puzzleId: id, board: [[null, null], [null, null]],
    boardHorizontalNumbers: '1,1', boardVerticalNumbers: '2,0',
})
const day = (date = DAY): DayEntry => ({
    date,
    easyBoards: [1, 2, 3].map(i => puzzle(`${date}|e${i}`)),
    mediumBoards: [1, 2, 3].map(i => puzzle(`${date}|m${i}`)),
    hardBoards: [1, 2, 3].map(i => puzzle(`${date}|h${i}`)),
})
const loaded = (date: string): LoadedDay => ({ day: day(date), requested: date, clamped: null })
const deferred = <T,>() => {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(r => { resolve = r })
    return { promise, resolve }
}

const roots: RootStore[] = []
const harness = ({ at = T0, store = localStorageStore(window.localStorage) as AttemptStore,
    options = {} as Partial<CoordinatorOptions> } = {}) => {
    let wall = at
    let mono = 100
    const root = new RootStore(new CorpusSource(), { challenge: true, coordinator: {
        openStore: async () => store, loadDay: async date => loaded(date),
        clock: () => ({ wall, mono }), listen: () => () => {}, schedule: () => () => {}, ...options,
    } })
    roots.push(root)
    root.boardsStore.setDay(day())
    const service = root.challenge!
    const session = () => root.boardsStore.currentBoard!
    const binding = () => service.bindings.get(session())!
    const view = () => session().challengeView
    const sessionAt = (difficulty: 'easy' | 'normal' | 'hard', level: 1 | 2 | 3) => {
        const definition = (difficulty === 'easy' ? root.boardsStore.easyBoards
            : difficulty === 'normal' ? root.boardsStore.mediumBoards : root.boardsStore.hardBoards)![level - 1]
        return root.boardsStore.sessions.get(definition.puzzleId)!
    }
    return {
        root, service, store, session, binding, view, sessionAt,
        /** Move the clock; `tick` makes the coordinator read it, as its one-second timer does. */
        setTime: (value: number, monotonic = mono + (value - wall)) => { wall = value; mono = monotonic },
    }
}
type Harness = ReturnType<typeof harness>

const open = async (h: Harness) => { await h.root.start() }
const begin = async (h: Harness) => {
    await open(h)
    expect(await h.session().startChallenge()).toBe(true)
}
const win = (h: Harness, at = T0 + 200) => {
    expect(h.session().placeToward([0, 0], 'down')).toBe(true)
    h.setTime(at)
    expect(h.session().placeToward([0, 1], 'down')).toBe(true)
}
const holdNext = (store: AttemptStore) => {
    const waiting = deferred<void>()
    const entered = deferred<void>()
    const original = store.change.bind(store)
    vi.spyOn(store, 'change').mockImplementationOnce(async (id, step) => {
        entered.resolve()
        await waiting.promise
        return original(id, step)
    })
    return { release: () => waiting.resolve(), entered: entered.promise }
}
/** Store a finished attempt for a session's board, as another tab would have. */
const finishedElsewhere = async (store: AttemptStore, session: PuzzleSession, ms = 500) => {
    const board = { puzzleId: session.definition.puzzleId, definitionHash: session.definition.definitionHash, date: DAY }
    await store.change(board.puzzleId, current => start(current, board, T0, DAY))
    await store.change(board.puzzleId, current => finish(current, T0 + ms, DAY))
}

/** Every value `history` holds for `id` from now on, in order. */
const watch = (h: Harness, id: string) => {
    const values: (Attempt | undefined)[] = []
    const stop = reaction(() => h.service.history.get(id), value => { values.push(value) })
    return { values, stop }
}

/**
 * The view agrees with the coordinator's own answers (rule 6): covered exactly when
 * `isCovered`, startable when `ready`, and editable exactly in the editable views.
 */
const agrees = (h: Harness, session = h.session()) => {
    const view = session.challengeView
    const binding = h.service.bindings.get(session)!
    expect(isCoveredView(view), `covered: ${view.kind}`).toBe(h.service.isCovered(binding))
    if (view.kind === 'ready') expect(h.service.canStart(binding), 'ready can start').toBe(true)
    else if (isCoveredView(view)) expect(h.service.canStart(binding), `${view.kind} cannot start`).toBe(false)
    const editable = view.kind === 'result' || view.kind === 'legacy' || view.kind === 'casual'
        || (view.kind === 'playing' && !view.assisting)
    expect(h.service.canMutate(binding), `editable: ${view.kind}`).toBe(editable)
}

beforeEach(() => { window.localStorage.clear() })
afterEach(() => {
    for (const root of roots.splice(0)) {
        root.dispose()
        root.boardsStore.disposePersist?.()
    }
    vi.restoreAllMocks()
})

describe('boardView: every state, from real transitions (rule 6)', () => {
    it('is casual in a root with the challenge off', () => {
        const root = new RootStore(new CorpusSource())
        root.boardsStore.setDay(day())
        expect(root.boardsStore.currentBoard!.challengeView).toEqual({ kind: 'casual' })
        root.boardsStore.disposePersist?.()
    })

    it('is preparing before initialization, then ready with a Start', async () => {
        const h = harness()
        expect(h.view()).toEqual({ kind: 'preparing' })
        agrees(h)
        await open(h)
        expect(h.view()).toEqual({ kind: 'ready', startFailed: false })
        agrees(h)
    })

    it('is unprepared when initialization fails', async () => {
        const h = harness({ options: { loadDay: async () => { throw new Error('offline') } } })
        await open(h)
        expect(h.service.status).toBe('retry')
        expect(h.view()).toEqual({ kind: 'unprepared' })
        agrees(h)
    })

    it('is starting while the Start saves, and ready with startFailed after a failed Start', async () => {
        const h = harness()
        await open(h)
        const held = holdNext(h.store)
        const starting = h.session().startChallenge()
        await held.entered
        expect(h.view()).toEqual({ kind: 'starting' })
        agrees(h)
        held.release()
        expect(await starting).toBe(true)

        const other = harness({ store: localStorageStore(window.localStorage) })
        await open(other)
        other.root.boardsStore.setLevel(2)
        vi.spyOn(other.store, 'change').mockResolvedValueOnce({ committed: false, changed: false, attempt: null })
        expect(await other.session().startChallenge()).toBe(false)
        expect(other.view()).toEqual({ kind: 'ready', startFailed: true })
        agrees(other)
    })

    it('is playing with the elapsed time, and marks hints, assisting and a clock error', async () => {
        const h = harness()
        await begin(h)
        h.setTime(T0 + 61_000)
        h.service.tick()
        expect(h.view()).toEqual({
            kind: 'playing', elapsed: 61_000, assisted: false, clockError: false, assisting: false, closesTonight: false,
        })
        agrees(h)

        const held = holdNext(h.store)
        const hint = h.session().requestHint()
        await held.entered
        expect(h.view()).toMatchObject({ kind: 'playing', assisting: true, assisted: false })
        agrees(h)
        held.release()
        await hint
        expect(h.view()).toMatchObject({ kind: 'playing', assisting: false, assisted: true })

        // The wall clock falls 10 s behind the monotonic one: a clock error, shown at once,
        // before its save lands.
        h.setTime(T0 + 51_000, 100 + 62_000)
        h.service.tick()
        expect(h.view()).toMatchObject({ kind: 'playing', clockError: true })
        agrees(h)
    })

    it('says yesterday\'s board ends tonight', async () => {
        const h = harness({ at: T0 + 24 * HOUR })
        await begin(h)
        expect(h.view()).toMatchObject({ kind: 'playing', closesTonight: true })
        agrees(h)
    })

    it('is finishing at the captured instant, through ticks and a failed save', async () => {
        const h = harness()
        await begin(h)
        const held = holdNext(h.store)
        win(h, T0 + 200)
        await held.entered
        h.setTime(T0 + 9_000)
        h.service.tick()
        expect(h.view()).toEqual({ kind: 'finishing', elapsed: 200, saveFailed: false, assisted: false, clockError: false })
        agrees(h)
        held.release()
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))

        const other = harness()
        await open(other)
        other.root.boardsStore.setLevel(2)
        expect(await other.session().startChallenge()).toBe(true)
        vi.spyOn(other.store, 'change').mockResolvedValue({ committed: false, changed: false, attempt: null })
        win(other, T0 + 300)
        await vi.waitFor(() => expect(other.view()).toMatchObject({ kind: 'finishing', saveFailed: true }))
        other.setTime(T0 + 20_000)
        other.service.tick()
        expect(other.view()).toEqual({ kind: 'finishing', elapsed: 300, saveFailed: true, assisted: false, clockError: false })
        agrees(other)
    })

    it('is the result, then a Practice run, timed and then solved', async () => {
        const h = harness()
        await begin(h)
        win(h, T0 + 200)
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))
        expect(h.view()).toEqual({ kind: 'result', result: { kind: 'solved', ms: 200 }, assisted: false, practice: null })
        agrees(h)
        h.setTime(T0 + 1_000)
        expect(h.session().undo()).toBe(true)
        h.setTime(T0 + 4_000)
        h.service.tick()
        expect(h.view()).toEqual({
            kind: 'result', result: { kind: 'solved', ms: 200 }, assisted: false,
            practice: { elapsed: 3_000, solved: false },
        })
        agrees(h)
        expect(h.session().placeToward([0, 1], 'down')).toBe(true)
        expect(h.view()).toMatchObject({ kind: 'result', practice: { elapsed: 3_000, solved: true } })
    })

    it('is legacy for a board played before the challenge', async () => {
        const h = harness()
        writeProgress(h.session().definition.puzzleId, {
            definitionHash: h.session().definition.definitionHash,
            board: [[1, null], [0, null]], completed: false, savedAt: T0,
        })
        await open(h)
        expect(h.view()).toEqual({ kind: 'legacy' })
        agrees(h)
    })

    it('is future for an unclamped board after the device date, and casual once archived', async () => {
        const early = harness({ at: T0 - 24 * HOUR })
        await open(early)
        expect(early.view()).toEqual({ kind: 'future' })
        agrees(early)

        const late = harness({ at: T0 + 48 * HOUR })
        await open(late)
        expect(late.view()).toEqual({ kind: 'casual' })
        agrees(late)
    })

    it('is casual for a before-clamped board', async () => {
        const h = harness({ at: new Date(2026, 7, 30, 12).getTime() })
        h.root.boardsStore.receiveDay({ day: day(), requested: '2026-08-30', clamped: 'before' })
        await open(h)
        expect(h.view()).toEqual({ kind: 'casual' })
        agrees(h)
    })

    it('is mismatch when the stored attempt is another board\'s', async () => {
        const h = harness()
        const id = h.session().definition.puzzleId
        await h.store.change(id, current => start(current, { puzzleId: id, definitionHash: 'other', date: DAY }, T0, DAY))
        await open(h)
        expect(h.view()).toEqual({ kind: 'mismatch' })
        agrees(h)
    })
})

describe('beginPractice: only after a solved result (rule 16)', () => {
    it('starts nothing on a covered, playing or finishing board, nor during a Practice run', async () => {
        const h = harness()
        await open(h)
        const binding = () => h.service.bindings.get(h.session())!
        expect(h.service.beginPractice(binding()), 'ready').toBe(false)
        expect(await h.session().startChallenge()).toBe(true)
        expect(h.service.beginPractice(binding()), 'playing').toBe(false)
        const held = holdNext(h.store)
        win(h, T0 + 200)
        await held.entered
        expect(h.service.beginPractice(binding()), 'finishing').toBe(false)
        held.release()
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))
        expect(binding().practice).toBeNull()
        expect(h.service.beginPractice(binding()), 'a solved result').toBe(true)
        expect(binding().practice).toEqual({ startedAt: T0 + 200 })
        expect(h.service.beginPractice(binding()), 'already practising').toBe(false)
        expect(h.view()).toMatchObject({ kind: 'result', practice: { elapsed: 0, solved: false } })
    })
})

describe('history: forward only (rule 7)', () => {
    it('collects stored attempts at opening, then this root\'s Start and finish', async () => {
        const h = harness()
        await finishedElsewhere(h.store, h.sessionAt('normal', 1))
        await open(h)
        const id = (difficulty: 'easy' | 'normal', level: 1 | 2 | 3) => h.sessionAt(difficulty, level).definition.puzzleId
        expect(h.service.history.get(id('normal', 1))?.result).toEqual({ kind: 'solved', ms: 500 })
        expect(await h.session().startChallenge()).toBe(true)
        expect(h.service.history.get(id('easy', 1))?.result).toBeUndefined()
        win(h, T0 + 200)
        await vi.waitFor(() => expect(h.service.history.get(id('easy', 1))?.result).toEqual({ kind: 'solved', ms: 200 }))
    })

    it('takes another tab\'s result on refresh', async () => {
        const h = harness()
        await open(h)
        const other = h.sessionAt('hard', 3)
        await finishedElsewhere(h.store, other, 700)
        await h.service.refresh()
        expect(h.service.history.get(other.definition.puzzleId)?.result).toEqual({ kind: 'solved', ms: 700 })
    })

    it('works the same in memory mode', async () => {
        const h = harness({ store: memoryAttemptStore() })
        await begin(h)
        expect(h.service.history.get(h.session().definition.puzzleId)?.startedAt).toBe(T0)
    })

    it('keeps a finish committed while an older snapshot was being read', async () => {
        const h = harness()
        await begin(h)
        const id = h.session().definition.puzzleId
        const read = h.store.readAll.bind(h.store)
        const taken = deferred<void>()
        const gate = deferred<void>()
        vi.spyOn(h.store, 'readAll').mockImplementationOnce(async () => {
            const snapshot = await read()
            taken.resolve()
            await gate.promise
            return snapshot
        })
        const refreshing = h.service.refresh()
        await taken.promise
        win(h, T0 + 200)
        await vi.waitFor(() => expect(h.service.history.get(id)?.result).toEqual({ kind: 'solved', ms: 200 }))
        // Every value the entry takes from here on: refresh's own per-board transaction
        // re-reads storage afterwards, so only watching shows whether the snapshot ever
        // rolled it back in between.
        const seen = watch(h, id)
        gate.resolve()
        await refreshing
        seen.stop()
        expect(seen.values.every(attempt => attempt?.result !== undefined), 'never back to no result').toBe(true)
        expect(h.service.history.get(id)?.result).toEqual({ kind: 'solved', ms: 200 })
    })

    it('never clears a hint or clock-error flag committed while an older snapshot was read (codex)', async () => {
        const h = harness()
        await begin(h)
        const id = h.session().definition.puzzleId
        const read = h.store.readAll.bind(h.store)
        const taken = deferred<void>()
        const gate = deferred<void>()
        vi.spyOn(h.store, 'readAll').mockImplementationOnce(async () => {
            const snapshot = await read()
            taken.resolve()
            await gate.promise
            return snapshot
        })
        const refreshing = h.service.refresh()
        await taken.promise
        await h.session().requestHint()
        // The wall clock falls 10 s behind the monotonic one: a detected clock change.
        h.setTime(T0 - 10_000, 100 + 1_000)
        h.service.tick()
        await vi.waitFor(() => expect(h.service.history.get(id)).toMatchObject({ assisted: true, clockError: true }))
        const seen = watch(h, id)
        gate.resolve()
        await refreshing
        seen.stop()
        expect(seen.values.every(attempt => attempt?.assisted === true), 'the hint flag never cleared').toBe(true)
        expect(seen.values.every(attempt => attempt?.clockError === true), 'the clock flag never cleared').toBe(true)
        expect(h.service.history.get(id)).toMatchObject({ assisted: true, clockError: true })
    })

    it('keeps an entry a snapshot lacks, and everything when the read fails', async () => {
        const h = harness()
        // A board no session is bound to, so nothing but enumeration ever touches it.
        const elsewhere = { puzzleId: 'elsewhere', definitionHash: 'h', date: '2026-10-09' }
        await h.store.change(elsewhere.puzzleId, current => start(current, elsewhere, T0 - 24 * HOUR, '2026-10-09'))
        await h.store.change(elsewhere.puzzleId, current => finish(current, T0 - 23 * HOUR, '2026-10-09'))
        await open(h)
        const held = h.service.history.get('elsewhere')
        expect(held?.result).toEqual({ kind: 'solved', ms: HOUR })
        vi.spyOn(h.store, 'readAll').mockResolvedValueOnce([])
        await h.service.refresh()
        expect(h.service.history.get('elsewhere')).toBe(held)
        vi.spyOn(h.store, 'readAll').mockResolvedValueOnce(null)
        await h.service.refresh()
        expect(h.service.history.get('elsewhere')).toBe(held)
    })

    it('never lets a snapshot of a different attempt replace the held one', async () => {
        const h = harness()
        const elsewhere = { puzzleId: 'elsewhere', definitionHash: 'h', date: '2026-10-09' }
        await h.store.change(elsewhere.puzzleId, current => start(current, elsewhere, T0 - 24 * HOUR, '2026-10-09'))
        await h.store.change(elsewhere.puzzleId, current => finish(current, T0 - 23 * HOUR, '2026-10-09'))
        await open(h)
        const held = h.service.history.get('elsewhere')!
        const stranger: Attempt = { ...held, startedAt: held.startedAt + 1, result: { kind: 'solved', ms: HOUR - 1 } }
        vi.spyOn(h.store, 'readAll').mockResolvedValueOnce([stranger])
        await h.service.refresh()
        expect(h.service.history.get('elsewhere')).toBe(held)
    })
})

describe('lastFinish: this tab\'s own finish, signalled once (slice 3b, rule 8)', () => {
    const id = (h: Harness, difficulty: 'easy' | 'normal' | 'hard', level: 1 | 2 | 3) =>
        h.sessionAt(difficulty, level).definition.puzzleId

    it('signals this tab\'s finish once, and a clock error\'s untimed solve too', async () => {
        const h = harness()
        await begin(h)
        expect(h.service.lastFinish).toBeNull()
        win(h, T0 + 200)
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))
        expect(h.service.lastFinish).toEqual({ puzzleId: id(h, 'easy', 1), serial: 1 })
        // A later transaction over the same result changes nothing, and signals nothing.
        await h.service.refresh()
        expect(h.service.lastFinish?.serial).toBe(1)

        h.root.boardsStore.setLevel(2)
        expect(await h.session().startChallenge()).toBe(true)
        // The wall clock falls behind the monotonic one: the solve has no time.
        h.setTime(T0 + 100, 100 + 20_000)
        h.service.tick()
        win(h, T0 + 300)
        await vi.waitFor(() => expect(h.view()).toMatchObject({ kind: 'result', result: { kind: 'untimed', reason: 'clock-error' } }))
        expect(h.service.lastFinish).toEqual({ puzzleId: id(h, 'easy', 2), serial: 2 })
    })

    it('signals a failed save when the retry timer or a refresh finally commits it', async () => {
        const h = harness()
        await begin(h)
        vi.spyOn(h.store, 'change').mockResolvedValueOnce({ committed: false, changed: false, attempt: null })
        win(h, T0 + 200)
        await vi.waitFor(() => expect(h.view()).toMatchObject({ kind: 'finishing', saveFailed: true }))
        expect(h.service.lastFinish).toBeNull()
        h.service.tick()
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))
        expect(h.service.lastFinish).toEqual({ puzzleId: id(h, 'easy', 1), serial: 1 })

        h.root.boardsStore.setLevel(2)
        expect(await h.session().startChallenge()).toBe(true)
        vi.spyOn(h.store, 'change').mockResolvedValueOnce({ committed: false, changed: false, attempt: null })
        win(h, T0 + 400)
        await vi.waitFor(() => expect(h.view()).toMatchObject({ kind: 'finishing', saveFailed: true }))
        await h.service.refresh()
        expect(h.view()).toMatchObject({ kind: 'result', result: { kind: 'solved', ms: 200 } })
        expect(h.service.lastFinish).toEqual({ puzzleId: id(h, 'easy', 2), serial: 2 })
    })

    it('does not signal another tab\'s result, even one that wins the race to this board', async () => {
        const h = harness()
        await begin(h)
        // This tab's finish waits; another tab's finish of the same board commits first.
        const held = holdNext(h.store)
        win(h, T0 + 200)
        await held.entered
        await finishedElsewhere(h.store, h.session(), 500)
        held.release()
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))
        expect(h.view()).toMatchObject({ result: { kind: 'solved', ms: 500 } })
        // And a refresh that takes another tab's result on another board.
        await finishedElsewhere(h.store, h.sessionAt('hard', 3), 700)
        await h.service.refresh()
        expect(h.service.history.get(id(h, 'hard', 3))?.result).toEqual({ kind: 'solved', ms: 700 })
        expect(h.service.lastFinish).toBeNull()
    })

    it('does not signal another board\'s lost finish that this root recovers at the same instant', async () => {
        let notice!: (id: string) => void
        const h = harness({ options: { listen: (_wake, heard) => { notice = heard; return () => {} } } })
        await begin(h)
        // Another tab solves Hard 3 at T0 + 200, and its finish is never saved: only the
        // evidence beside its board is.
        const other = harness()
        await open(other)
        other.root.boardsStore.goToBoard({ difficulty: 'hard', level: 3 })
        expect(await other.session().startChallenge()).toBe(true)
        vi.spyOn(other.store, 'change').mockResolvedValue({ committed: false, changed: false, attempt: null })
        win(other, T0 + 200)
        await vi.waitFor(() => expect(other.view()).toMatchObject({ kind: 'finishing', saveFailed: true }))
        // This tab's finish of Easy 1, captured at that same instant, waits.
        const held = holdNext(h.store)
        win(h, T0 + 200)
        await held.entered
        // Told of Hard 3, this root recovers the lost finish: its own transaction, a change,
        // at this tab's captured instant, on another board.
        const hard = id(h, 'hard', 3)
        notice(hard)
        await vi.waitFor(() => expect(h.service.history.get(hard))
            .toMatchObject({ result: { kind: 'untimed', reason: 'finish-lost' }, finishedAt: T0 + 200 }))
        expect(h.service.lastFinish).toBeNull()
        held.release()
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))
        expect(h.service.lastFinish).toEqual({ puzzleId: id(h, 'easy', 1), serial: 1 })
    })

    it('does not signal a finish this root recovers from another tab\'s earlier solve', async () => {
        // This tab's board saves fail, so the evidence it reads back is the other tab's.
        const h = harness({ options: { writeProgress: () => false } })
        await begin(h)
        // Another tab, on the same attempt, solves it first at T0 + 100; its finish is lost.
        const other = harness()
        await open(other)
        expect(other.binding().attempt?.startedAt).toBe(T0)
        vi.spyOn(other.store, 'change').mockResolvedValue({ committed: false, changed: false, attempt: null })
        win(other, T0 + 100)
        await vi.waitFor(() => expect(other.view()).toMatchObject({ kind: 'finishing', saveFailed: true }))
        // This tab's finish at T0 + 200: its transaction recovers the earlier solve instead,
        // a change, finished at the other tab's instant.
        win(h, T0 + 200)
        await vi.waitFor(() => expect(h.view()).toMatchObject({ kind: 'result', result: { kind: 'untimed', reason: 'finish-lost' } }))
        expect(h.service.history.get(id(h, 'easy', 1))?.finishedAt).toBe(T0 + 100)
        expect(h.service.lastFinish).toBeNull()
    })

    it('does not signal another tab\'s finish of this board at the same instant (codex)', async () => {
        const h = harness()
        await begin(h)
        // This tab's finish, captured at T0 + 200, waits; another tab, started at the same
        // instant, finishes the same board at the same millisecond and commits first.
        const held = holdNext(h.store)
        win(h, T0 + 200)
        await held.entered
        await finishedElsewhere(h.store, h.session(), 200)
        held.release()
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))
        expect(h.service.history.get(id(h, 'easy', 1))?.finishedAt).toBe(T0 + 200)
        expect(h.service.lastFinish).toBeNull()
    })

    it('does not signal another tab\'s recovery of this tab\'s saved solve (codex)', async () => {
        const h = harness()
        await begin(h)
        // This tab's finish waits, with its evidence saved beside the board.
        const held = holdNext(h.store)
        win(h, T0 + 200)
        await held.entered
        // Another tab opens, finds the evidence and no finish, and recovers it at its instant.
        const other = harness({ at: T0 + 1_000 })
        await open(other)
        const recovered = other.service.history.get(id(other, 'easy', 1))
        expect(recovered).toMatchObject({ result: { kind: 'untimed', reason: 'finish-lost' }, finishedAt: T0 + 200 })
        held.release()
        await vi.waitFor(() => expect(h.view()).toMatchObject({ kind: 'result', result: { kind: 'untimed', reason: 'finish-lost' } }))
        expect(h.service.lastFinish).toBeNull()
    })

    it('does not signal a finish recovered after a reload', async () => {
        const h = harness()
        await begin(h)
        vi.spyOn(h.store, 'change').mockResolvedValue({ committed: false, changed: false, attempt: null })
        win(h, T0 + 200)
        await vi.waitFor(() => expect(h.view()).toMatchObject({ kind: 'finishing', saveFailed: true }))
        // A new tab: the winning board's saved evidence, and no captured finish.
        const reloaded = harness({ at: T0 + 1_000 })
        await open(reloaded)
        expect(reloaded.service.history.get(id(reloaded, 'easy', 1))?.result)
            .toEqual({ kind: 'untimed', reason: 'finish-lost' })
        expect(reloaded.service.lastFinish).toBeNull()
    })

    it('does not signal Practice, or a board given up when its day leaves the window', async () => {
        const h = harness()
        await begin(h)
        win(h, T0 + 200)
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))
        expect(h.service.beginPractice(h.binding())).toBe(true)
        expect(h.session().undo()).toBe(true)
        expect(h.session().placeToward([0, 1], 'down')).toBe(true)
        expect(h.view()).toMatchObject({ kind: 'result', practice: { solved: true } })
        expect(h.service.lastFinish?.serial).toBe(1)

        h.root.boardsStore.setLevel(2)
        expect(await h.session().startChallenge()).toBe(true)
        h.setTime(T0 + 48 * HOUR)
        await h.service.refresh()
        expect(h.service.history.get(id(h, 'easy', 2))?.result).toEqual({ kind: 'given-up' })
        expect(h.service.lastFinish?.serial).toBe(1)
    })
})

describe('a board casual by its date, before the coordinator hydrates it (slice 3b, codex)', () => {
    const ARCHIVE = '2026-10-05'
    const SAVED = [[1, null], [0, null]]
    /** Easy puzzle 1 of `date`, saved with one piece by an earlier visit. */
    const savedPiece = (date: string) => {
        const probe = new RootStore(new CorpusSource())
        probe.boardsStore.setDay(day(date))
        probe.boardsStore.goToBoard({ difficulty: 'easy', level: 1 })
        const { definition } = probe.boardsStore.currentBoard!
        probe.boardsStore.disposePersist?.()
        writeProgress(definition.puzzleId, {
            definitionHash: definition.definitionHash, board: SAVED, completed: false, savedAt: T0,
        })
        return definition.puzzleId
    }
    /** A root whose storage never opens until released, so nothing hydrates meanwhile. */
    const held = (at = T0) => {
        const opened = deferred<AttemptStore>()
        const h = harness({ at, options: { openStore: () => opened.promise } })
        const started = h.root.start()
        return { h, release: async () => { opened.resolve(h.store); await started } }
    }

    it('shows an archive day\'s saved pieces before hydration', async () => {
        const id = savedPiece(ARCHIVE)
        const { h } = held()
        h.root.boardsStore.setDay(day(ARCHIVE))
        const session = h.sessionAt('easy', 1)
        expect(session.definition.puzzleId).toBe(id)
        expect(h.service.bindings.get(session)?.ready).toBe(false)
        expect(session.challengeView).toEqual({ kind: 'casual' })
        expect(session.snapshot.board).toEqual(SAVED)
    })

    it('and a before-clamp day\'s', async () => {
        const id = savedPiece('2026-09-01')
        const { h } = held(new Date(2026, 7, 30, 12).getTime())
        // As a first load's clamp comes to; `receiveDay` would hold this earlier day back
        // from the harness's own.
        h.root.boardsStore.setDay(day('2026-09-01'), 'before')
        const session = h.sessionAt('easy', 1)
        expect(session.definition.puzzleId).toBe(id)
        expect(h.service.bindings.get(session)?.ready).toBe(false)
        expect(session.challengeView).toEqual({ kind: 'casual' })
        expect(session.snapshot.board).toEqual(SAVED)
    })

    it('leaves today\'s board as it was until hydration says whose the saved pieces are', async () => {
        // A record from an earlier attempt than the stored one: not this attempt's board.
        const probe = new RootStore(new CorpusSource())
        probe.boardsStore.setDay(day())
        probe.boardsStore.goToBoard({ difficulty: 'easy', level: 1 })
        const { definition } = probe.boardsStore.currentBoard!
        probe.boardsStore.disposePersist?.()
        writeProgress(definition.puzzleId, {
            definitionHash: definition.definitionHash, board: SAVED, completed: false, savedAt: T0,
            attemptStartedAt: T0 - 60_000,
        })
        const { h, release } = held()
        await h.store.change(definition.puzzleId, current => start(current,
            { puzzleId: definition.puzzleId, definitionHash: definition.definitionHash, date: DAY }, T0, DAY))
        const session = h.sessionAt('easy', 1)
        expect(session.snapshot.board, 'not restored before hydration').toEqual([[null, null], [null, null]])
        await release()
        await vi.waitFor(() => expect(h.service.bindings.get(session)?.ready).toBe(true))
        expect(session.snapshot.board, 'nor by it: another attempt\'s').toEqual([[null, null], [null, null]])
    })

    it('keeps the Undo of a move made before hydration (codex)', async () => {
        savedPiece(ARCHIVE)
        const { h, release } = held()
        h.root.boardsStore.setDay(day(ARCHIVE))
        const session = h.sessionAt('easy', 1)
        expect(session.placeToward([0, 1], 'down')).toBe(true)
        await release()
        await vi.waitFor(() => expect(h.service.bindings.get(session)?.ready).toBe(true))
        expect(session.undo(), 'Undo survives hydration').toBe(true)
        expect(session.snapshot.board).toEqual(SAVED)
    })

    it('keeps casual progress saved while the attempt history couldn\'t be read (codex)', async () => {
        const id = savedPiece(ARCHIVE)
        const hash = readProgress(id)!.definitionHash
        // The board had a timed result when it was today, and its progress carries that stamp.
        const startedAt = new Date(2026, 9, 5, 9).getTime()
        writeProgress(id, { ...readProgress(id)!, attemptStartedAt: startedAt })
        const real = localStorageStore(window.localStorage)
        await real.change(id, () => ({ changed: true, next: {
            puzzleId: id, definitionHash: hash, date: ARCHIVE, ruleset: RULESET, startedAt,
            assisted: false, clockError: false, result: { kind: 'solved', ms: 90_000 }, finishedAt: startedAt + 90_000,
        } }))
        // A visit whose attempt history fails, while board saves work: the move is saved
        // without the attempt's stamp.
        const broken: AttemptStore = { ...real,
            readAll: async () => null, change: async () => ({ committed: false, changed: false, attempt: null }) }
        const visit = harness({ store: broken })
        await visit.root.start()
        visit.root.boardsStore.setDay(day(ARCHIVE))
        const first = visit.sessionAt('easy', 1)
        expect(first.placeToward([0, 1], 'down')).toBe(true)
        const both = first.snapshot.board
        await vi.waitFor(() => expect(readProgress(id)?.board).toEqual(both))
        expect(readProgress(id)?.attemptStartedAt).toBeUndefined()
        visit.root.dispose()
        // Reopened with healthy storage: both pieces, before hydration and after it.
        const reopened = harness()
        await reopened.root.start()
        reopened.root.boardsStore.setDay(day(ARCHIVE))
        const session = reopened.sessionAt('easy', 1)
        expect(session.snapshot.board).toEqual(both)
        await vi.waitFor(() => expect(reopened.service.bindings.get(session)?.ready).toBe(true))
        expect(session.snapshot.board, 'hydration keeps the saved pieces').toEqual(both)
    })

    it('marks a restored winning board complete as it is built, with no celebration', async () => {
        const id = savedPiece(ARCHIVE)
        const probe = new RootStore(new CorpusSource())
        probe.boardsStore.setDay(day(ARCHIVE))
        probe.boardsStore.goToBoard({ difficulty: 'easy', level: 1 })
        const solving = probe.boardsStore.currentBoard!
        solving.placeToward([0, 0], 'down')
        solving.placeToward([0, 1], 'down')
        expect(solving.completedByRules).toBe(true)
        const winning = solving.snapshot.board
        probe.boardsStore.disposePersist?.()
        writeProgress(id, { ...readProgress(id)!, board: winning, completed: false })
        const { h } = held()
        vi.mocked(winFeedback).mockClear()
        h.root.boardsStore.setDay(day(ARCHIVE))
        expect(h.sessionAt('easy', 1).completed).toBe(true)
        // The levels store's own win reaction would also mark it, and play the win: on
        // reopening a day solved long ago.
        expect(winFeedback, 'no celebration for a board already won').not.toHaveBeenCalled()
    })

    it('fills an untouched casual board from a record only hydration reads, and never clears one', async () => {
        // The levels store reads storage when it builds the session; the coordinator reads
        // it again when it hydrates (it also migrates a v1 document then). A record that
        // arrives in between is the case.
        const id = savedPiece(ARCHIVE)
        const record = readProgress(id)!
        window.localStorage.clear()
        const { h, release } = held()
        h.root.boardsStore.setDay(day(ARCHIVE))
        const session = h.sessionAt('easy', 1)
        expect(session.snapshot.board).toEqual([[null, null], [null, null]])
        writeProgress(id, record)
        await release()
        await vi.waitFor(() => expect(h.service.bindings.get(session)?.ready).toBe(true))
        expect(session.snapshot.board).toEqual(SAVED)
    })

    it('keeps a move made before hydration on top of the saved pieces, in play and in storage', async () => {
        const id = savedPiece(ARCHIVE)
        const { h, release } = held()
        h.root.boardsStore.setDay(day(ARCHIVE))
        const session = h.sessionAt('easy', 1)
        expect(session.placeToward([0, 1], 'down')).toBe(true)
        const moved = session.snapshot.board
        expect(moved.map(row => row[0]), 'the saved piece is still there').toEqual([1, 0])
        expect(moved).not.toEqual(SAVED)
        await release()
        await vi.waitFor(() => expect(h.service.bindings.get(session)?.ready).toBe(true))
        expect(session.snapshot.board).toEqual(moved)
        expect(readProgress(id)?.board).toEqual(moved)
    })

    it('checks a board that turned timed before hydration like any timed board (codex)', async () => {
        const FIRST = '2026-09-01'
        const id = savedPiece(FIRST)
        const definition = { puzzleId: id, definitionHash: readProgress(id)!.definitionHash, date: FIRST }
        const { h, release } = held(new Date(2026, 7, 30, 12).getTime())
        // A device that has played the challenge already: its piece is not a legacy board's.
        await h.store.legacyCheck(() => [])
        await h.store.change(id, current => start(current, definition, new Date(2026, 8, 1, 9).getTime(), FIRST))
        // Built before-clamp, so casual: its unstamped piece is restored.
        h.root.boardsStore.setDay(day(FIRST), 'before')
        const session = h.sessionAt('easy', 1)
        expect(session.snapshot.board).toEqual(SAVED)
        // The clock is corrected and the same day refetched, unclamped: today's board now.
        h.setTime(new Date(2026, 8, 1, 12).getTime())
        h.root.boardsStore.receiveDay(loaded(FIRST))
        expect(h.sessionAt('easy', 1)).toBe(session)
        await release()
        await vi.waitFor(() => expect(h.service.bindings.get(session)?.ready).toBe(true))
        expect(session.challengeView.kind).toBe('playing')
        expect(session.snapshot.board, 'no unstamped piece in the timed attempt').toEqual([[null, null], [null, null]])
    })
})

describe('nextChallengeBoard (rule 8)', () => {
    it('walks Easy, Medium, Hard after the current board, crossing sizes and wrapping', async () => {
        const h = harness()
        await open(h)
        expect(h.root.boardsStore.nextChallengeBoard()).toEqual({ difficulty: 'easy', level: 2 })
        h.root.boardsStore.goToBoard({ difficulty: 'easy', level: 3 })
        expect(h.root.boardsStore.nextChallengeBoard()).toEqual({ difficulty: 'normal', level: 1 })
        h.root.boardsStore.goToBoard({ difficulty: 'hard', level: 3 })
        expect(h.root.boardsStore.nextChallengeBoard()).toEqual({ difficulty: 'easy', level: 1 })
    })

    it('skips boards with results and legacy boards', async () => {
        const h = harness()
        await finishedElsewhere(h.store, h.sessionAt('easy', 2))
        writeProgress(h.sessionAt('easy', 3).definition.puzzleId, {
            definitionHash: h.sessionAt('easy', 3).definition.definitionHash,
            board: [[1, null], [0, null]], completed: false, savedAt: T0,
        })
        await open(h)
        h.root.boardsStore.goToBoard({ difficulty: 'easy', level: 1 })
        expect(h.root.boardsStore.nextChallengeBoard()).toEqual({ difficulty: 'normal', level: 1 })
    })

    it('is null on the last board, both while its finish saves and after', async () => {
        const h = harness()
        for (const [difficulty, level] of [['easy', 2], ['easy', 3], ['normal', 1], ['normal', 2], ['normal', 3],
            ['hard', 1], ['hard', 2], ['hard', 3]] as const) {
            await finishedElsewhere(h.store, h.sessionAt(difficulty, level))
        }
        await open(h)
        h.root.boardsStore.goToBoard({ difficulty: 'easy', level: 1 })
        expect(await h.session().startChallenge()).toBe(true)
        const held = holdNext(h.store)
        win(h, T0 + 200)
        await held.entered
        expect(h.view().kind).toBe('finishing')
        expect(h.root.boardsStore.nextChallengeBoard()).toBeNull()
        held.release()
        await vi.waitFor(() => expect(h.view().kind).toBe('result'))
        expect(h.root.boardsStore.nextChallengeBoard()).toBeNull()
    })

    it('never offers the current board, even one still being played', async () => {
        const h = harness()
        for (const [difficulty, level] of [['easy', 2], ['easy', 3], ['normal', 1], ['normal', 2], ['normal', 3],
            ['hard', 1], ['hard', 2], ['hard', 3]] as const) {
            await finishedElsewhere(h.store, h.sessionAt(difficulty, level))
        }
        await open(h)
        h.root.boardsStore.goToBoard({ difficulty: 'easy', level: 1 })
        expect(h.view().kind).toBe('ready')
        expect(h.root.boardsStore.nextChallengeBoard()).toBeNull()
        expect(await h.session().startChallenge()).toBe(true)
        expect(h.view().kind).toBe('playing')
        expect(h.root.boardsStore.nextChallengeBoard()).toBeNull()
    })

    it('never offers a board whose finish is saving', async () => {
        const h = harness()
        await open(h)
        h.root.boardsStore.goToBoard({ difficulty: 'easy', level: 2 })
        expect(await h.session().startChallenge()).toBe(true)
        const held = holdNext(h.store)
        win(h, T0 + 200)
        await held.entered
        h.root.boardsStore.goToBoard({ difficulty: 'easy', level: 1 })
        expect(h.root.boardsStore.nextChallengeBoard()).toEqual({ difficulty: 'easy', level: 3 })
        held.release()
    })

    it('is null with the challenge off, and goToBoard lands exactly where it is told', () => {
        const root = new RootStore(new CorpusSource())
        root.boardsStore.setDay(day())
        expect(root.boardsStore.nextChallengeBoard()).toBeNull()
        root.boardsStore.goToBoard({ difficulty: 'hard', level: 2 })
        expect([root.boardsStore.difficulty, root.boardsStore.level]).toEqual(['hard', 2])
        root.boardsStore.disposePersist?.()
    })
})
