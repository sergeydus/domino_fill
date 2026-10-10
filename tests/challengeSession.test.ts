// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autorun, runInAction } from 'mobx'
import { createElement } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { RootStore } from '@/app/stores/RootStore'
import { CorpusSource, type LoadedDay } from '@/app/stores/corpusSource'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom, type StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import type { DayEntry } from '@/app/stores/corpus'
import type { CoordinatorOptions } from '@/app/challenge/coordinator'
import { localStorageStore, memoryAttemptStore, type AttemptStore } from '@/app/challenge/attemptStore'
import { finish, markAssisted, start } from '@/app/challenge/attempt'
import { readProgress, writeProgress, type PuzzleProgress } from '@/app/stores/progressStorage'
import { winFeedback } from '@/app/dominoFill/feedback'
import GameControls from '@/app/dominoFill/GameControls'

vi.mock('@/app/dominoFill/feedback', () => ({ winFeedback: vi.fn() }))

const DAY = '2026-10-10'
const T0 = new Date(2026, 9, 10, 12).getTime()
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
const harness = (options: Partial<CoordinatorOptions> = {}, store = localStorageStore(window.localStorage)) => {
    let wall = T0
    let mono = 100
    const root = new RootStore(new CorpusSource(), { challenge: true, coordinator: {
        openStore: async () => store, loadDay: async date => loaded(date),
        clock: () => ({ wall, mono }), listen: () => () => {}, schedule: () => () => {}, ...options,
    } })
    roots.push(root)
    root.boardsStore.setDay(day())
    const session = root.boardsStore.currentBoard!
    const service = root.challenge!
    const binding = service.bindings.get(session)!
    return { root, service, session, binding, store,
        setTime: (value: number, monotonic = mono) => { wall = value; mono = monotonic } }
}
type Harness = ReturnType<typeof harness>
const open = async (h: Harness) => { await h.root.start() }
const begin = async (h: Harness) => {
    await open(h)
    expect(await h.session.startChallenge()).toBe(true)
}
const record = (h: Harness, extra: Partial<PuzzleProgress> = {}): PuzzleProgress => ({
    definitionHash: h.session.definition.definitionHash,
    board: [[null, null], [null, null]], completed: false, savedAt: T0, ...extra,
})
const firstColumn = [[1, null], [0, null]]
const solved = [[1, 1], [0, 0]]
const holdNext = (store: AttemptStore) => {
    const waiting = deferred<void>()
    const entered = deferred<void>()
    const original = store.change.bind(store)
    const spy = vi.spyOn(store, 'change').mockImplementationOnce(async (id, step) => {
        entered.resolve()
        await waiting.promise
        return original(id, step)
    })
    return { release: () => waiting.resolve(), entered: entered.promise, original, spy }
}
const win = (h: Harness, at = T0 + 200) => {
    expect(h.session.placeToward([0, 0], 'down')).toBe(true)
    h.setTime(at)
    expect(h.session.placeToward([0, 1], 'down')).toBe(true)
}
const fixed = async (h: Harness) => {
    await vi.waitFor(() => expect(h.binding.attempt?.result).toBeDefined())
}

beforeEach(() => { window.localStorage.clear(); vi.mocked(winFeedback).mockClear() })
afterEach(() => {
    cleanup()
    for (const root of roots.splice(0)) {
        root.dispose()
        root.boardsStore.disposePersist?.()
    }
    vi.restoreAllMocks()
})

describe('explicit Start and direct action guards', () => {
    it.each(['place', 'remove', 'reset', 'undo', 'pointer', 'keyboard', 'hint', 'check'] as const)(
        'rejects direct %s before initialization and before Start', async action => {
            const h = harness()
            const act = () => {
                if (action === 'place') h.session.placeToward([0, 1], 'down')
                if (action === 'remove') h.session.removePiece(0, 0)
                if (action === 'reset') h.session.reset()
                if (action === 'undo') h.session.undo()
                if (action === 'pointer') { h.session.pointerDown([0, 0]); h.session.pointerUp([1, 0]) }
                if (action === 'keyboard') { h.session.handleKey(' '); h.session.handleKey('ArrowDown') }
                if (action === 'hint') { h.session.hint(); void h.session.requestHint() }
                if (action === 'check') { h.session.check(); void h.session.requestCheck() }
            }
            const initial = h.session.snapshot
            act()
            expect(h.session.snapshot).toEqual(initial)
            expect(h.session.gesture).toBeNull()
            expect(h.session.adviceTick).toBe(0)
            await open(h)
            // An old tab's progress after the legacy check must also remain untouched.
            h.session.restore({ board: firstColumn, completed: false })
            const untouched = h.session.snapshot
            act()
            expect(h.session.snapshot).toEqual(untouched)
            expect(h.session.moves).toHaveLength(0)
            expect(h.session.adviceTick).toBe(0)
            expect(h.binding.attempt).toBeNull()
            expect(h.session.canChange).toBe(false)
        })
    it('keeps the cover, old progress and input until Start commits', async () => {
        const h = harness()
        await open(h)
        const old = record(h, { board: firstColumn })
        writeProgress(h.binding.puzzleId, old)
        h.session.restore(old)
        const pending = holdNext(h.store)
        h.setTime(T0 + 50)
        const starting = h.session.startChallenge()
        await pending.entered
        h.setTime(T0 + 5000)
        expect(h.service.isCovered(h.binding)).toBe(true)
        expect(h.session.canChange).toBe(false)
        expect(readProgress(h.binding.puzzleId)).toEqual(old)
        expect(h.session.board).toEqual(firstColumn)
        pending.release()
        expect(await starting).toBe(true)
        expect(h.service.isCovered(h.binding)).toBe(false)
        expect(h.binding.attempt?.startedAt).toBe(T0 + 50)
        expect(h.service.elapsedFor(h.binding)).toBe(4950)
        expect(h.session.board).toEqual(h.session.definition.initialBoard)
        expect(h.session.moves).toHaveLength(0)
        expect(h.session.completed).toBe(false)
        expect(readProgress(h.binding.puzzleId)?.attemptStartedAt).toBe(T0 + 50)
    })
    it('never exposes a new attempt with old pieces between adoption and reveal', async () => {
        const h = harness()
        await open(h)
        h.session.restore({ board: firstColumn, completed: false })
        const exposed: (number | null)[][][] = []
        const mutable: (number | null)[][][] = []
        const stop = autorun(() => {
            if (!h.service.isCovered(h.binding)) exposed.push(h.session.snapshot.board)
            if (h.session.canChange) mutable.push(h.session.snapshot.board)
        })
        try {
            expect(await h.session.startChallenge()).toBe(true)
            expect(exposed.length).toBeGreaterThan(0)
            expect(exposed.every(board => JSON.stringify(board) === '[[null,null],[null,null]]')).toBe(true)
            expect(mutable.every(board => JSON.stringify(board) === '[[null,null],[null,null]]')).toBe(true)
        } finally { stop() }
    })
    it('a failed Start preserves old progress and a retry captures a new press', async () => {
        const h = harness()
        await open(h)
        const old = record(h, { board: firstColumn })
        writeProgress(h.binding.puzzleId, old)
        h.session.restore(old)
        vi.spyOn(h.store, 'change').mockResolvedValueOnce({ committed: false, changed: true, attempt: null })
        expect(await h.session.startChallenge()).toBe(false)
        expect(h.service.isCovered(h.binding)).toBe(true)
        expect(h.session.board).toEqual(firstColumn)
        expect(readProgress(h.binding.puzzleId)).toEqual(old)
        h.setTime(T0 + 75)
        expect(await h.session.startChallenge()).toBe(true)
        expect(h.binding.attempt?.startedAt).toBe(T0 + 75)
        expect(h.session.board).toEqual(h.session.definition.initialBoard)
    })
    it('an opening legacy mark leaves its board and synchronous answers alone', async () => {
        const h = harness()
        const old = record(h, { board: firstColumn })
        writeProgress(h.binding.puzzleId, old)
        await open(h)
        expect(h.service.isCovered(h.binding)).toBe(false)
        expect(await h.session.startChallenge()).toBe(false)
        expect(h.session.board).toEqual(firstColumn)
        expect(h.session.hint()).not.toBeNull()
        expect(h.binding.attempt).toBeNull()
        h.session.reset()
        expect(h.binding.practice).toBeNull()
        expect(readProgress(h.binding.puzzleId)?.attemptStartedAt).toBeUndefined()
    })
    it('an aborted duplicate Start cannot adopt another tab’s read record or discard old progress', async () => {
        const h = harness()
        await open(h)
        const old = record(h, { board: firstColumn })
        writeProgress(h.binding.puzzleId, old)
        h.session.restore(old)
        await h.store.change(h.binding.puzzleId, current => start(current, {
            puzzleId: h.binding.puzzleId, definitionHash: h.binding.definition.definitionHash, date: DAY,
        }, T0, DAY))
        const existing = await h.store.read(h.binding.puzzleId)
        vi.spyOn(h.store, 'change').mockResolvedValueOnce({ committed: false, changed: false, attempt: existing })
        expect(await h.session.startChallenge()).toBe(false)
        expect(h.binding.attempt).toBeNull()
        expect(h.session.board).toEqual(firstColumn)
        expect(readProgress(h.binding.puzzleId)).toEqual(old)
    })
    it('resumes matching progress written by another tab before the new Start outcome', async () => {
        const h = harness()
        await open(h)
        const original = h.store.change.bind(h.store)
        vi.spyOn(h.store, 'change').mockImplementationOnce(async (id, step) => {
            const outcome = await original(id, step)
            writeProgress(id, record(h, { board: firstColumn, attemptStartedAt: outcome.attempt!.startedAt }))
            return outcome
        })
        expect(await h.session.startChallenge()).toBe(true)
        expect(h.session.board).toEqual(firstColumn)
        expect(readProgress(h.binding.puzzleId)?.board).toEqual(firstColumn)
    })
    it('recovers a matching other-tab solve arriving before the Start outcome reveals it', async () => {
        const h = harness()
        await open(h)
        const original = h.store.change.bind(h.store)
        vi.spyOn(h.store, 'change').mockImplementationOnce(async (id, step) => {
            const outcome = await original(id, step)
            writeProgress(id, record(h, { board: solved, completed: true,
                attemptStartedAt: outcome.attempt!.startedAt,
                solveEvidence: { solvedAt: T0 + 20, solvedOn: DAY,
                    columnTargets: '1,1', rowTargets: '2,0' } }))
            return outcome
        })
        expect(await h.session.startChallenge()).toBe(true)
        expect(h.binding.attempt?.result).toEqual({ kind: 'untimed', reason: 'finish-lost' })
        expect(h.session.board).toEqual(solved)
        expect(h.session.completed).toBe(true)
        expect(h.binding.pendingFinish).toBeNull()
        expect(winFeedback).not.toHaveBeenCalled()
    })
    it('duplicate Start preserves locally edited matching progress and Undo history', async () => {
        const writer = vi.fn(() => false)
        const h = harness({ writeProgress: writer })
        await begin(h)
        h.session.placeToward([0, 0], 'down')
        h.setTime(T0 + 500)
        expect(await h.session.startChallenge()).toBe(true)
        expect(h.binding.attempt?.startedAt).toBe(T0)
        expect(h.session.board).toEqual(firstColumn)
        expect(h.session.moves).toHaveLength(1)
        expect(h.binding.pending?.record.board).toEqual(firstColumn)
    })
    it('an untouched duplicate Start resumes matching moves written by another tab', async () => {
        const h = harness()
        await begin(h)
        writeProgress(h.binding.puzzleId, record(h, { board: firstColumn, attemptStartedAt: T0 }))
        h.setTime(T0 + 500)
        expect(await h.session.startChallenge()).toBe(true)
        expect(h.session.board).toEqual(firstColumn)
        expect(h.binding.attempt?.startedAt).toBe(T0)
        expect(readProgress(h.binding.puzzleId)?.board).toEqual(firstColumn)
    })
    it('reveals empty after an empty-progress failure and retries its original stamp', async () => {
        const writer = vi.fn<(id: string, value: PuzzleProgress) => boolean>(() => false)
        const h = harness({ writeProgress: writer })
        await begin(h)
        const pending = h.binding.pending!.record
        expect(h.service.isCovered(h.binding)).toBe(false)
        expect(h.session.board).toEqual(h.session.definition.initialBoard)
        expect(h.binding.progressSaveFailed).toBe(true)
        h.setTime(T0 + 500)
        writer.mockReturnValue(true)
        h.service.retryProgress()
        expect(writer.mock.calls.at(-1)?.[1]).toEqual(pending)
        expect(h.binding.progressSaveFailed).toBe(false)
    })
    it('an untouched empty retry adopts matching cross-tab moves instead of overwriting them', async () => {
        const writer = vi.fn(() => false)
        const h = harness({ writeProgress: writer })
        await begin(h)
        writeProgress(h.binding.puzzleId, record(h, { board: firstColumn, attemptStartedAt: T0 }))
        writer.mockClear()
        h.service.retryProgress()
        expect(h.session.board).toEqual(firstColumn)
        expect(h.binding.progressSaveFailed).toBe(false)
        expect(writer).not.toHaveBeenCalled()
        expect(readProgress(h.binding.puzzleId)?.board).toEqual(firstColumn)
    })
    it('an empty retry refuses a mismatched cross-tab stamp', async () => {
        const writer = vi.fn<(id: string, value: PuzzleProgress) => boolean>(() => false)
        const h = harness({ writeProgress: writer })
        await begin(h)
        writeProgress(h.binding.puzzleId, record(h, { board: firstColumn, attemptStartedAt: T0 + 1 }))
        writer.mockReturnValue(true)
        h.service.retryProgress()
        expect(h.session.board).toEqual(h.session.definition.initialBoard)
        expect(writer.mock.calls.at(-1)?.[1]).toMatchObject({ attemptStartedAt: T0,
            board: h.session.definition.initialBoard })
    })
    it('a locally edited board keeps accepted last-write-wins behaviour on retry', async () => {
        const writer = vi.fn<(id: string, value: PuzzleProgress) => boolean>(() => false)
        const h = harness({ writeProgress: writer })
        await begin(h)
        h.session.placeToward([0, 0], 'down')
        writeProgress(h.binding.puzzleId, record(h, { board: [[null, 1], [null, 0]], attemptStartedAt: T0 }))
        writer.mockReturnValue(true)
        h.service.retryProgress()
        expect(h.session.board).toEqual(firstColumn)
        expect(writer.mock.calls.at(-1)?.[1].board).toEqual(firstColumn)
    })
    it('does not synthesize starts through selectors, navigation, completion flags or refetch', async () => {
        const h = harness()
        await open(h)
        h.root.boardsStore.selectFirstUnsolved()
        h.root.boardsStore.goToNextLevel()
        h.root.boardsStore.setDifficulty('hard')
        h.session.setCompleted(true)
        h.root.boardsStore.setDay(day())
        expect(await h.store.readAll()).toEqual([])
        expect(h.binding.pendingFinish).toBeNull()
        expect(h.binding.solveEvidence).toBeUndefined()
    })
    it('reload rejects an old-version unstamped write after a valid Start', async () => {
        const h = harness()
        await begin(h)
        h.session.placeToward([0, 0], 'down')
        writeProgress(h.binding.puzzleId, record(h, { board: [[null, 1], [null, 0]] }))
        h.root.dispose()
        const reopened = harness()
        await open(reopened)
        expect(reopened.binding.attempt?.startedAt).toBe(T0)
        expect(reopened.session.board).toEqual(reopened.session.definition.initialBoard)
        expect(reopened.binding.attempt?.result).toBeUndefined()
    })
    it('a window closing while Start waits reconciles to casual without restarting the clock', async () => {
        const h = harness()
        await open(h)
        const pending = holdNext(h.store)
        const starting = h.session.startChallenge()
        await pending.entered
        h.setTime(new Date(2026, 9, 12, 12).getTime())
        pending.release()
        expect(await starting).toBe(true)
        expect(h.binding.attempt?.result).toEqual({ kind: 'given-up' })
        expect(h.service.isCovered(h.binding)).toBe(false)
        expect(h.session.canChange).toBe(true)
        expect(h.service.elapsedFor(h.binding)).toBeNull()
    })
    it('rejects a genuine future Start and future mutations even with a stored attempt', async () => {
        const h = harness()
        await begin(h)
        h.setTime(new Date(2026, 9, 9, 12).getTime())
        expect(await h.session.startChallenge()).toBe(false)
        expect(h.session.placeToward([0, 0], 'down')).toBe(false)
        await expect(h.session.requestHint()).resolves.toBeNull()
        expect(h.session.board).toEqual(h.session.definition.initialBoard)
    })
    it('disposal suppresses a pending Start without revealing or clearing its old board', async () => {
        const h = harness()
        await open(h)
        h.session.restore({ board: firstColumn, completed: false })
        const pending = holdNext(h.store)
        const starting = h.session.startChallenge()
        await pending.entered
        h.root.dispose()
        pending.release()
        expect(await starting).toBe(false)
        expect(h.session.board).toEqual(firstColumn)
        expect(h.binding.attempt).toBeNull()
        expect(h.binding.ready).toBe(false)
    })
    it('a committed-but-unobserved Start cannot clear the board after disposal', async () => {
        const h = harness()
        await open(h)
        h.session.restore({ board: firstColumn, completed: false })
        const original = h.store.change.bind(h.store)
        const committed = deferred<void>()
        const release = deferred<void>()
        vi.spyOn(h.store, 'change').mockImplementationOnce(async (id, step) => {
            const outcome = await original(id, step)
            committed.resolve()
            await release.promise
            return outcome
        })
        const starting = h.session.startChallenge()
        await committed.promise
        expect((await h.store.read(h.binding.puzzleId))?.startedAt).toBe(T0)
        h.root.dispose()
        release.resolve()
        expect(await starting).toBe(false)
        expect(h.session.board).toEqual(firstColumn)
        expect(h.binding.attempt).toBeNull()
    })
})

describe('save-before-answer assistance', () => {
    it.each(['Hint', 'Check'] as const)('the real %s control uses the asynchronous enabled request', async label => {
        const h = harness()
        await begin(h)
        const view = render(createElement(GameControls, { boardsStore: h.session }))
        const pending = holdNext(h.store)
        fireEvent.click(view.getByRole('button', { name: label }))
        await vi.waitFor(() => expect(pending.spy).toHaveBeenCalledTimes(1))
        expect(h.session.adviceTick).toBe(0)
        await act(async () => {
            pending.release()
            await vi.waitFor(() => expect(h.session.adviceTick).toBe(1))
        })
        expect(h.binding.attempt?.assisted).toBe(true)
    })
    it.each(['hint', 'check'] as const)('%s reveals nothing and blocks edits until its commit', async kind => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        const answer = kind === 'hint' ? h.session.requestHint() : h.session.requestCheck()
        await pending.entered
        expect(h.session.advice).toBeNull()
        expect(h.session.adviceTick).toBe(0)
        expect(h.session.placeToward([0, 0], 'down')).toBe(false)
        h.session.reset()
        expect(h.session.board).toEqual(h.session.definition.initialBoard)
        pending.release()
        expect(await answer).not.toBeNull()
        expect(h.session.adviceTick).toBe(1)
        expect(h.binding.attempt?.assisted).toBe(true)
        expect(h.session.canChange).toBe(true)
    })
    it('direct synchronous Hint and Check cannot bypass the enabled save boundary', async () => {
        const h = harness()
        await begin(h)
        expect(h.session.hint()).toBeNull()
        expect(h.session.check()).toBeNull()
        expect(h.session.adviceTick).toBe(0)
        expect(h.binding.attempt?.assisted).toBe(false)
    })
    it('a pending assist freezes an already active gesture and keyboard direction', async () => {
        const h = harness()
        await begin(h)
        h.session.placeToward([0, 0], 'down')
        h.session.setFocusedCell([0, 1])
        h.session.handleKey(' ')
        const pending = holdNext(h.store)
        const answer = h.session.requestHint()
        await pending.entered
        expect(h.session.pointerUp([1, 1])).toBe('none')
        expect(h.session.handleKey('ArrowDown')).toBe(false)
        expect(h.session.board).toEqual(firstColumn)
        pending.release()
        await answer
    })
    it('publishes frozen assistance availability to an observer immediately', async () => {
        const h = harness()
        await begin(h)
        const available: boolean[] = []
        const stop = autorun(() => { available.push(h.session.canChange) })
        try {
            const pending = holdNext(h.store)
            const answer = h.session.requestHint()
            await pending.entered
            expect(available.at(-1)).toBe(false)
            pending.release()
            await answer
            expect(available.at(-1)).toBe(true)
        } finally { stop() }
    })
    it('a failed assistance save reveals no answer and a later request retries', async () => {
        const h = harness()
        await begin(h)
        vi.spyOn(h.store, 'change').mockResolvedValueOnce({ committed: false, changed: true,
            attempt: { ...h.binding.attempt!, assisted: true } })
        expect(await h.session.requestHint()).toBeNull()
        expect(h.session.adviceTick).toBe(0)
        expect(h.binding.attempt?.assisted).toBe(false)
        expect(h.binding.error).toBe('save')
        expect(await h.session.requestHint()).not.toBeNull()
        expect(h.session.adviceTick).toBe(1)
        expect(h.binding.attempt?.assisted).toBe(true)
    })
    it('already-assisted committed success still publishes advice', async () => {
        const h = harness()
        await begin(h)
        await h.store.change(h.binding.puzzleId, markAssisted)
        expect(await h.session.requestCheck()).not.toBeNull()
        expect(h.session.adviceTick).toBe(1)
        expect(h.binding.attempt?.assisted).toBe(true)
    })
    it('a concurrent fixed finish wins over a late assistance answer', async () => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        const answer = h.session.requestHint()
        await pending.entered
        await pending.original(h.binding.puzzleId, current => finish(current, T0 + 40, DAY))
        pending.release()
        expect(await answer).toBeNull()
        expect(h.session.adviceTick).toBe(0)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 40 })
        expect(h.binding.attempt?.assisted).toBe(false)
    })
    it('an already-assisted concurrent result still suppresses the late answer', async () => {
        const h = harness()
        await begin(h)
        await h.session.requestCheck()
        h.session.clearAdvice()
        const before = h.session.adviceTick
        const pending = holdNext(h.store)
        const answer = h.session.requestHint()
        await pending.entered
        await pending.original(h.binding.puzzleId, current => finish(current, T0 + 40, DAY))
        pending.release()
        expect(await answer).toBeNull()
        expect(h.session.advice).toBeNull()
        expect(h.session.adviceTick).toBe(before)
        expect(h.binding.attempt?.result).toEqual({ kind: 'hinted' })
    })
    it('an assistance committed before the finish makes the solve hinted', async () => {
        const h = harness()
        await begin(h)
        await h.session.requestCheck()
        win(h)
        await fixed(h)
        expect(h.binding.attempt?.result).toEqual({ kind: 'hinted' })
    })
    it.each(['level', 'difficulty', 'away-and-back', 'difficulty-away-and-back', 'date'] as const)(
        'navigation by %s suppresses the obsolete answer', async navigation => {
            const h = harness()
            await begin(h)
            const pending = holdNext(h.store)
            const answer = h.session.requestHint()
            await pending.entered
            if (navigation === 'level') h.root.boardsStore.setLevel(2)
            if (navigation === 'difficulty') h.root.boardsStore.setDifficulty('hard')
            if (navigation === 'away-and-back') { h.root.boardsStore.setLevel(2); h.root.boardsStore.setLevel(1) }
            if (navigation === 'difficulty-away-and-back') {
                h.root.boardsStore.setDifficulty('hard'); h.root.boardsStore.setDifficulty('easy')
            }
            if (navigation === 'date') h.root.boardsStore.setDay(day('2026-10-09'))
            pending.release()
            expect(await answer).toBeNull()
            expect(h.session.adviceTick).toBe(0)
            expect(h.binding.attempt?.assisted).toBe(true)
        })
    it('disposal suppresses an obsolete answer and releases its action state', async () => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        const answer = h.session.requestCheck()
        await pending.entered
        h.root.dispose()
        pending.release()
        expect(await answer).toBeNull()
        expect(h.session.adviceTick).toBe(0)
        expect(h.binding.assisting).toBe(false)
    })
    it('disposal suppresses an already-assisted successful outcome', async () => {
        const h = harness()
        await begin(h)
        await h.session.requestHint()
        h.session.clearAdvice()
        const before = h.session.adviceTick
        const pending = holdNext(h.store)
        const answer = h.session.requestCheck()
        await pending.entered
        h.root.dispose()
        pending.release()
        expect(await answer).toBeNull()
        expect(h.session.adviceTick).toBe(before)
        expect(h.binding.assisting).toBe(false)
    })
    it('assistance arriving after expiry reveals nothing and settles the unfinished attempt', async () => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        const answer = h.session.requestCheck()
        await pending.entered
        h.setTime(new Date(2026, 9, 12, 12).getTime())
        pending.release()
        expect(await answer).toBeNull()
        expect(h.session.adviceTick).toBe(0)
        expect(h.binding.attempt?.result).toEqual({ kind: 'given-up' })
        expect(h.binding.attempt?.assisted).toBe(false)
    })
    it('rechecks the date after an assistance transaction that applied before expiry', async () => {
        const h = harness()
        await begin(h)
        const original = h.store.change.bind(h.store)
        const applied = deferred<void>()
        const release = deferred<void>()
        vi.spyOn(h.store, 'change').mockImplementationOnce(async (id, step) => {
            const outcome = await original(id, step)
            applied.resolve()
            await release.promise
            return outcome
        })
        const answer = h.session.requestHint()
        await applied.promise
        h.setTime(new Date(2026, 9, 12, 12).getTime())
        release.resolve()
        expect(await answer).toBeNull()
        expect(h.session.adviceTick).toBe(0)
        expect(h.binding.attempt?.assisted).toBe(true)
        await h.service.refresh()
        expect(h.binding.attempt?.result).toEqual({ kind: 'given-up' })
    })
})

describe('winning placement, durable evidence and pending finish', () => {
    it('writes the winning board and evidence before the surrounding action can run reactions', async () => {
        const h = harness()
        await begin(h)
        h.session.placeToward([0, 0], 'down')
        const pending = holdNext(h.store)
        h.setTime(T0 + 123)
        runInAction(() => {
            h.session.placeToward([0, 1], 'down')
            expect(h.session.completed).toBe(false)
            expect(winFeedback).not.toHaveBeenCalled()
            expect(readProgress(h.binding.puzzleId)?.solveEvidence).toMatchObject({ solvedAt: T0 + 123 })
            expect(readProgress(h.binding.puzzleId)?.board).toEqual(solved)
            h.session.reset()
            expect(h.session.board).toEqual(solved)
        })
        expect(h.session.completed).toBe(true)
        expect(winFeedback).toHaveBeenCalledTimes(1)
        await pending.entered
        pending.release()
        await fixed(h)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 123 })
    })
    it.each(['direct', 'tap', 'drag', 'keyboard', 'pick-tap', 'pick-keyboard'] as const)(
        'captures the original winning instant through %s', async path => {
            const h = harness()
            await begin(h)
            h.session.placeToward([0, 0], 'down')
            const pending = holdNext(h.store)
            h.setTime(T0 + 125)
            if (path === 'direct') h.session.placeToward([0, 1], 'down')
            if (path === 'tap') { h.session.pointerDown([0, 1]); h.session.pointerUp([0, 1]) }
            if (path === 'drag') { h.session.pointerDown([0, 1]); h.session.pointerUp([1, 1]) }
            if (path === 'keyboard') {
                h.session.setFocusedCell([0, 1]); h.session.handleKey(' '); h.session.handleKey('ArrowDown')
            }
            if (path.startsWith('pick')) {
                h.root.controls.setMode('pick')
                if (path === 'pick-tap') { h.session.pointerDown([0, 1]); h.session.pointerUp([0, 1]) }
                else { h.session.setFocusedCell([0, 1]); h.session.handleKey('Enter') }
            }
            expect(h.binding.pendingFinish).toEqual({ solvedAt: T0 + 125, solvedOn: DAY })
            expect(readProgress(h.binding.puzzleId)).toMatchObject({ board: solved,
                attemptStartedAt: T0, solveEvidence: { solvedAt: T0 + 125, solvedOn: DAY,
                    columnTargets: '1,1', rowTargets: '2,0' } })
            expect(h.session.completed).toBe(true)
            expect(winFeedback).toHaveBeenCalledTimes(1)
            await pending.entered
            h.setTime(T0 + 9000)
            pending.release()
            await fixed(h)
            expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 125 })
            expect(h.binding.attempt?.finishedAt).toBe(T0 + 125)
            expect(winFeedback).toHaveBeenCalledTimes(1)
        })
    it.each(['reset', 'undo', 'remove', 'place', 'hint', 'check', 'keyboard', 'pointer'] as const)(
        'blocks %s while the first finish is pending', async action => {
            const h = harness()
            await begin(h)
            const pending = holdNext(h.store)
            win(h)
            await pending.entered
            const before = h.session.snapshot
            const moves = h.session.moves.length
            if (action === 'reset') h.session.reset()
            if (action === 'undo') expect(h.session.undo()).toBe(false)
            if (action === 'remove') expect(h.session.removePiece(0, 0)).toBe(false)
            if (action === 'place') expect(h.session.placeToward([0, 0], 'down')).toBe(false)
            if (action === 'hint') expect(await h.session.requestHint()).toBeNull()
            if (action === 'check') expect(await h.session.requestCheck()).toBeNull()
            if (action === 'keyboard') expect(h.session.handleKey('ArrowRight')).toBe(false)
            if (action === 'pointer') { h.session.pointerDown([0, 0]); h.session.pointerUp([0, 0]) }
            expect(h.session.snapshot).toEqual(before)
            expect(h.session.moves).toHaveLength(moves)
            expect(h.session.canUndo).toBe(false)
            pending.release()
            await fixed(h)
            expect(h.session.canUndo).toBe(true)
        })
    it('a failed finish keeps its original instant and focus retry preserves a timed result', async () => {
        const h = harness()
        await begin(h)
        const original = h.store.change.bind(h.store)
        const failing = vi.spyOn(h.store, 'change').mockResolvedValue({ committed: false, changed: false,
            attempt: h.binding.attempt })
        win(h, T0 + 75)
        await vi.waitFor(() => expect(h.binding.error).toBe('save'))
        expect(h.binding.pendingFinish?.solvedAt).toBe(T0 + 75)
        expect(h.session.undo()).toBe(false)
        h.setTime(T0 + 10000)
        failing.mockImplementation(original)
        await h.service.refresh()
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 75 })
        expect(h.binding.pendingFinish).toBeNull()
        expect(h.session.canUndo).toBe(true)
    })
    it('the one-second retry finishes a failed save using its original instant', async () => {
        const h = harness()
        await begin(h)
        const original = h.store.change.bind(h.store)
        const failing = vi.spyOn(h.store, 'change').mockResolvedValue({ committed: false, changed: false,
            attempt: h.binding.attempt })
        win(h, T0 + 90)
        await vi.waitFor(() => expect(h.binding.error).toBe('save'))
        failing.mockImplementation(original)
        h.setTime(T0 + 1000)
        h.service.tick()
        await fixed(h)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 90 })
    })
    it('later saves on a different board retry the original pending finish', async () => {
        const h = harness()
        await begin(h)
        const original = h.store.change.bind(h.store)
        const failing = vi.spyOn(h.store, 'change').mockResolvedValue({ committed: false, changed: false,
            attempt: h.binding.attempt })
        win(h, T0 + 95)
        await vi.waitFor(() => expect(h.binding.error).toBe('save'))
        failing.mockImplementation(original)
        h.root.boardsStore.setLevel(2)
        h.setTime(T0 + 500)
        expect(await h.root.boardsStore.currentBoard!.startChallenge()).toBe(true)
        await fixed(h)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 95 })
    })
    it('repeated timer ticks keep at most one finish operation in flight', async () => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        win(h)
        await pending.entered
        h.setTime(T0 + 1000)
        h.service.tick()
        h.service.tick()
        h.service.tick()
        await Promise.resolve()
        expect(pending.spy).toHaveBeenCalledTimes(1)
        expect(h.binding.pendingFinish?.solvedAt).toBe(T0 + 200)
        pending.release()
        await fixed(h)
        await vi.waitFor(() => expect(h.binding.busy).toBe(0))
        expect(pending.spy).toHaveBeenCalledTimes(1)
    })
    it('publishes pending-finish availability to an observer at the winning placement', async () => {
        const h = harness()
        await begin(h)
        const available: boolean[] = []
        const stop = autorun(() => { available.push(h.session.canChange) })
        try {
            const pending = holdNext(h.store)
            win(h)
            expect(available.at(-1)).toBe(false)
            await pending.entered
            pending.release()
            await fixed(h)
            expect(available.at(-1)).toBe(true)
        } finally { stop() }
    })
    it('a failed unserved finish stays retained and the timer retries its original solve', async () => {
        const h = harness()
        await begin(h)
        const original = h.store.change.bind(h.store)
        const failing = vi.spyOn(h.store, 'change').mockResolvedValue({ committed: false, changed: false,
            attempt: h.binding.attempt })
        win(h)
        await vi.waitFor(() => expect(h.binding.error).toBe('save'))
        await vi.waitFor(() => expect(h.binding.busy).toBe(0))
        failing.mockImplementation(original)
        h.root.boardsStore.setDay(day('2026-10-09'))
        expect(h.service.bindings.has(h.session)).toBe(true)
        h.setTime(T0 + 1000)
        h.service.tick()
        await vi.waitFor(async () => expect((await h.store.read(h.binding.puzzleId))?.result)
            .toEqual({ kind: 'solved', ms: 200 }))
        await vi.waitFor(() => expect(h.service.bindings.has(h.session)).toBe(false))
    })
    it('navigation retains an unserved pending finish until its original save completes', async () => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        win(h)
        await pending.entered
        h.root.boardsStore.setDay(day('2026-10-09'))
        expect(h.service.bindings.has(h.session)).toBe(true)
        expect(h.binding.pendingFinish?.solvedAt).toBe(T0 + 200)
        pending.release()
        await vi.waitFor(() => expect(h.service.bindings.has(h.session)).toBe(false))
        expect((await h.store.read(h.binding.puzzleId))?.result).toEqual({ kind: 'solved', ms: 200 })
        expect(h.root.boardsStore.viewingDate).toBe('2026-10-09')
    })
    it('a committed finish can unlock input while progress is still unsaved', async () => {
        const writer = vi.fn<(id: string, value: PuzzleProgress) => boolean>((id, value) => writeProgress(id, value))
        const h = harness({ writeProgress: writer })
        await begin(h)
        writer.mockReturnValue(false)
        win(h)
        await fixed(h)
        expect(h.binding.progressSaveFailed).toBe(true)
        expect(h.binding.pendingFinish).toBeNull()
        expect(h.session.undo()).toBe(true)
        expect(h.binding.solveEvidence).toBeUndefined()
        expect(h.binding.pending?.record.solveEvidence).toBeUndefined()
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
    })
    it('adopts a competing fixed result instead of replacing it with the pending solve', async () => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        win(h)
        await pending.entered
        await pending.original(h.binding.puzzleId, current => finish(current, T0 + 25, DAY))
        pending.release()
        await fixed(h)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 25 })
        expect(h.binding.pendingFinish).toBeNull()
    })
    it('respects assistance committed by another tab before this finish transaction', async () => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        win(h)
        await pending.entered
        await pending.original(h.binding.puzzleId, markAssisted)
        pending.release()
        await fixed(h)
        expect(h.binding.attempt?.result).toEqual({ kind: 'hinted' })
    })
    it('recovers an earlier other-tab solve before this pending finish can fix a time', async () => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        win(h)
        await pending.entered
        writeProgress(h.binding.puzzleId, record(h, { board: solved, completed: true,
            attemptStartedAt: T0, solveEvidence: { solvedAt: T0 + 25, solvedOn: DAY,
                columnTargets: '1,1', rowTargets: '2,0' } }))
        pending.release()
        await fixed(h)
        expect(h.binding.attempt?.result).toEqual({ kind: 'untimed', reason: 'finish-lost' })
        expect(h.binding.attempt?.finishedAt).toBe(T0 + 25)
        expect(h.binding.pendingFinish).toBeNull()
    })
    it('a backwards clock detected at the winning mutation is merged into the finish', async () => {
        const h = harness()
        await begin(h)
        h.setTime(T0 + 10000, 10100)
        h.session.placeToward([0, 0], 'down')
        h.setTime(T0 + 1000, 11100)
        h.session.placeToward([0, 1], 'down')
        expect(h.binding.clockErrorPending).toBe(true)
        await fixed(h)
        expect(h.binding.attempt?.clockError).toBe(true)
        expect(h.binding.attempt?.result).toEqual({ kind: 'untimed', reason: 'clock-error' })
    })
    it('an in-window winning placement still counts when its save arrives after expiry', async () => {
        const h = harness()
        await begin(h)
        const pending = holdNext(h.store)
        win(h, T0 + 60)
        await pending.entered
        h.setTime(new Date(2026, 9, 12, 12).getTime())
        pending.release()
        await fixed(h)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 60 })
        expect(h.binding.attempt?.finishedAt).toBe(T0 + 60)
    })
    it('a placement after expiry is casual and writes no first-attempt evidence', async () => {
        const h = harness()
        await begin(h)
        h.session.placeToward([0, 0], 'down')
        h.setTime(new Date(2026, 9, 12, 12).getTime())
        h.session.placeToward([0, 1], 'down')
        expect(h.binding.pendingFinish).toBeNull()
        expect(readProgress(h.binding.puzzleId)?.solveEvidence).toBeUndefined()
        await h.service.refresh()
        expect(h.binding.attempt?.result).toEqual({ kind: 'given-up' })
        expect(h.binding.practice).toBeNull()
    })
    it('rejected placement, hydration and completion flags cannot create a first finish', async () => {
        const h = harness()
        await begin(h)
        expect(h.session.placeToward([0, 0], 'up')).toBe(false)
        h.session.restore({ board: solved, completed: true })
        h.session.setCompleted(true)
        expect(h.binding.pendingFinish).toBeNull()
        expect(h.binding.solveEvidence).toBeUndefined()
        expect((await h.store.read(h.binding.puzzleId))?.result).toBeUndefined()
    })
    it('reload recovers durable solve evidence without a fabricated timed result', async () => {
        const h = harness()
        await begin(h)
        vi.spyOn(h.store, 'change').mockResolvedValue({ committed: false, changed: false,
            attempt: h.binding.attempt })
        win(h, T0 + 80)
        await vi.waitFor(() => expect(h.binding.error).toBe('save'))
        const evidence = readProgress(h.binding.puzzleId)!.solveEvidence
        h.root.dispose()
        const reopened = harness()
        reopened.setTime(T0 + 300)
        await open(reopened)
        expect(reopened.binding.attempt?.result).toEqual({ kind: 'untimed', reason: 'finish-lost' })
        expect(reopened.binding.attempt?.finishedAt).toBe(T0 + 80)
        expect(evidence?.solvedAt).toBe(T0 + 80)
        expect(reopened.session.board).toEqual(solved)
        expect(reopened.binding.pendingFinish).toBeNull()
    })
    it('reload with both failed saves has no solve to recover', async () => {
        const writer = vi.fn<(id: string, value: PuzzleProgress) => boolean>((id, value) => writeProgress(id, value))
        const h = harness({ writeProgress: writer })
        await begin(h)
        writer.mockReturnValue(false)
        vi.spyOn(h.store, 'change').mockResolvedValue({ committed: false, changed: false,
            attempt: h.binding.attempt })
        win(h)
        await vi.waitFor(() => expect(h.binding.error).toBe('save'))
        expect(readProgress(h.binding.puzzleId)?.solveEvidence).toBeUndefined()
        h.root.dispose()
        const reopened = harness()
        await open(reopened)
        expect(reopened.binding.attempt?.result).toBeUndefined()
        expect(reopened.session.board).toEqual(reopened.session.definition.initialBoard)
    })
})

describe('Practice and casual compatibility', () => {
    it('old archive progress can save while challenge initialization is retryable', async () => {
        const h = harness({ loadDay: async () => { throw new Error('offline') } })
        h.root.boardsStore.setDay(day('2026-10-08'))
        const old = h.root.boardsStore.currentBoard!
        await open(h)
        expect(h.service.status).toBe('retry')
        expect(old.placeToward([0, 0], 'down')).toBe(true)
        expect(readProgress(old.definition.puzzleId)?.board).toEqual(firstColumn)
        expect(old.hint()).not.toBeNull()
        expect((await h.store.readAll())).toEqual([])
    })
    it('casual progress waits for backend selection and stays memory-only if no storage works', async () => {
        const pending = deferred<AttemptStore>()
        const writer = vi.fn(() => true)
        const h = harness({ openStore: () => pending.promise, writeProgress: writer })
        h.root.boardsStore.setDay(day('2026-10-08'))
        const old = h.root.boardsStore.currentBoard!
        const starting = h.root.start()
        old.placeToward([0, 0], 'down')
        expect(writer).not.toHaveBeenCalled()
        pending.resolve(memoryAttemptStore())
        await starting
        expect(h.service.unsaved).toBe(true)
        expect(old.board).toEqual(firstColumn)
        expect(h.service.bindings.get(old)?.progressSaveFailed).toBe(false)
        expect(writer).not.toHaveBeenCalled()
        expect(readProgress(old.definition.puzzleId)).toBeNull()
    })
    it('same-root hydration preserves its own failed progress generation', async () => {
        const writer = vi.fn(() => false)
        const h = harness({ writeProgress: writer })
        await begin(h)
        h.session.placeToward([0, 0], 'down')
        const pending = h.binding.pending
        h.root.dispose()
        await h.root.start()
        expect(h.session.board).toEqual(firstColumn)
        expect(h.binding.pending).toBe(pending)
        expect(h.binding.progressSaveFailed).toBe(true)
        expect(h.binding.attempt?.startedAt).toBe(T0)
    })
    it('successful Undo starts Practice and its solve freezes only the Practice time', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        const first = h.binding.attempt
        h.setTime(T0 + 500)
        expect(h.session.undo()).toBe(true)
        expect(h.binding.practice).toEqual({ startedAt: T0 + 500 })
        expect(h.binding.finished).toBe(true)
        expect(h.binding.solveEvidence).toBeUndefined()
        expect(readProgress(h.binding.puzzleId)?.solveEvidence).toBeUndefined()
        h.setTime(T0 + 850)
        h.session.placeToward([0, 1], 'down')
        expect(h.binding.practice).toEqual({ startedAt: T0 + 500, ms: 350 })
        expect(h.service.practiceElapsed(h.binding)).toBe(350)
        expect(h.binding.attempt).toEqual(first)
        expect(readProgress(h.binding.puzzleId)?.solveEvidence).toBeUndefined()
        expect(readProgress(h.binding.puzzleId)?.attemptStartedAt).toBe(T0)
    })
    it('Reset/Play again and its Undo retain history while starting new Practice runs', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        h.setTime(T0 + 400)
        h.session.reset()
        expect(h.session.moves).toHaveLength(3)
        expect(h.binding.practice).toEqual({ startedAt: T0 + 400 })
        h.setTime(T0 + 700)
        expect(h.session.undo()).toBe(true)
        expect(h.session.board).toEqual(solved)
        expect(h.binding.practice).toEqual({ startedAt: T0 + 400, ms: 300 })
        h.setTime(T0 + 900)
        h.session.reset()
        expect(h.binding.practice).toEqual({ startedAt: T0 + 900 })
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
        expect(readProgress(h.binding.puzzleId)?.solveEvidence).toBeUndefined()
    })
    it('a refused placement, empty Reset and empty Undo do not start Practice', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        h.session.restore({ board: [[null, null], [null, null]], completed: false })
        h.binding.practice = null
        expect(h.session.placeToward([0, 0], 'up')).toBe(false)
        expect(h.session.undo()).toBe(false)
        h.session.reset()
        expect(h.binding.practice).toBeNull()
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
    })
    it('a restored editable post-result board starts a new Practice clock on its first mutation', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        h.session.reset()
        h.root.dispose()
        const reopened = harness()
        reopened.setTime(T0 + 700)
        await open(reopened)
        expect(reopened.binding.practice).toBeNull()
        expect(reopened.session.completed).toBe(false)
        reopened.session.placeToward([0, 0], 'down')
        expect(reopened.binding.practice).toEqual({ startedAt: T0 + 700 })
        expect(reopened.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
    })
    it('Practice assistance is synchronous and never changes the first result', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        h.session.undo()
        const first = h.binding.attempt
        const change = vi.spyOn(h.store, 'change')
        expect(h.session.requestHint()).not.toBeInstanceOf(Promise)
        expect(h.session.check()).not.toBeNull()
        expect(change).not.toHaveBeenCalled()
        expect(h.binding.attempt).toEqual(first)
        expect(h.binding.attempt?.assisted).toBe(false)
    })
    it('removing a completed piece begins editable Practice and clears solve evidence', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        h.setTime(T0 + 500)
        expect(h.session.removePiece(0, 1)).toBe(true)
        expect(h.session.completed).toBe(false)
        expect(h.binding.practice).toEqual({ startedAt: T0 + 500 })
        expect(h.binding.solveEvidence).toBeUndefined()
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
    })
    it('Practice becomes casual at expiry and never adds first-attempt evidence', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        h.session.undo()
        h.setTime(new Date(2026, 9, 12, 12).getTime())
        h.session.placeToward([0, 1], 'down')
        expect(h.binding.practice).toBeNull()
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
        expect(readProgress(h.binding.puzzleId)?.solveEvidence).toBeUndefined()
    })
    it('a running Practice clock advances on the shared timer without changing its first result', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        h.setTime(T0 + 500)
        h.session.undo()
        h.setTime(T0 + 1250)
        h.service.tick()
        expect(h.service.practiceElapsed(h.binding)).toBe(750)
        expect(h.service.elapsedFor(h.binding)).toBe(200)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
    })
    it('publishes Practice start and elapsed time to an observer that initially saw none', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        const times: (number | null)[] = []
        const stop = autorun(() => { times.push(h.service.practiceElapsed(h.binding)) })
        try {
            h.setTime(T0 + 500)
            h.session.undo()
            expect(times.at(-1)).toBe(0)
            h.setTime(T0 + 800)
            h.service.tick()
            expect(times.at(-1)).toBe(300)
        } finally { stop() }
    })
    it('archive edits clear first-solve evidence without starting Practice', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        expect(h.binding.solveEvidence).toBeDefined()
        h.setTime(new Date(2026, 9, 12, 12).getTime())
        h.service.tick()
        h.session.removePiece(0, 1)
        expect(h.binding.solveEvidence).toBeUndefined()
        expect(h.binding.practice).toBeNull()
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
    })
    it('the shared timer discards Practice when the board becomes an archive day', async () => {
        const h = harness()
        await begin(h)
        win(h)
        await fixed(h)
        h.session.undo()
        h.setTime(new Date(2026, 9, 12, 12).getTime())
        h.service.tick()
        expect(h.binding.practice).toBeNull()
        expect(h.service.practiceElapsed(h.binding)).toBeNull()
        expect(h.session.canChange).toBe(true)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
    })
    it.each(['default', 'standalone'] as const)('%s sessions keep synchronous casual actions', async kind => {
        const root = kind === 'default' ? new RootStore() : harness().root
        if (kind === 'default') roots.push(root)
        const session = new PuzzleSession(definitionFrom(puzzle(`casual-${kind}`)), root)
        expect(session.hint()).not.toBeNull()
        expect(session.check()).not.toBeNull()
        expect(session.requestHint()).not.toBeInstanceOf(Promise)
        expect(session.placeToward([0, 0], 'down')).toBe(true)
        expect(session.removePiece(0, 0)).toBe(true)
        expect(session.undo()).toBe(true)
        session.reset()
        expect(session.board).toEqual(session.definition.initialBoard)
        expect(session.challengeBinding).toBeNull()
        expect(await session.startChallenge()).toBe(false)
    })
    it('memory mode gives normal Start, finish and Practice with no persistent progress writes', async () => {
        const writer = vi.fn(() => true)
        const h = harness({ writeProgress: writer }, memoryAttemptStore())
        await begin(h)
        expect(h.service.unsaved).toBe(true)
        win(h)
        await fixed(h)
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
        h.setTime(T0 + 400)
        h.session.undo()
        expect(h.binding.practice).toEqual({ startedAt: T0 + 400 })
        expect(writer).not.toHaveBeenCalled()
        expect(readProgress(h.binding.puzzleId)).toBeNull()
        h.root.dispose()
        await h.root.start()
        expect(h.binding.attempt?.result).toEqual({ kind: 'solved', ms: 200 })
        expect(h.session.board).toEqual(firstColumn)
        expect(h.binding.practice).toBeNull()
        const fresh = harness({}, memoryAttemptStore())
        await open(fresh)
        expect(fresh.binding.attempt).toBeNull()
        expect(fresh.service.isCovered(fresh.binding)).toBe(true)
        expect(writer).not.toHaveBeenCalled()
    })
})
