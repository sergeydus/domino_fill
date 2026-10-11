// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { CorpusSource, type LoadedDay } from '@/app/stores/corpusSource'
import type { DayEntry } from '@/app/stores/corpus'
import { StoreContext } from '@/app/provider'
import DominoClient from '@/app/dominoFill/DominoClient'
import { noticeFor } from '@/app/dominoFill/ChallengeNotice'
import { formatTime, resultWords } from '@/app/dominoFill/challengeText'
import { localStorageStore, memoryAttemptStore, type AttemptStore } from '@/app/challenge/attemptStore'
import type { CoordinatorOptions } from '@/app/challenge/coordinator'
import { finish, start } from '@/app/challenge/attempt'
import { readProgress } from '@/app/stores/progressStorage'

/*
 * Slice 3a, rules 9-17: what the challenge puts on screen, rendered through the real
 * `DominoClient`, board and controls, with an enabled root. Only layout measurement, the
 * tutorial and sound are stubbed: none of them decides what is shown.
 */
vi.mock('@/app/hooks/useAvailableBoardBox', () => ({ useAvailableBoardBox: () => null }))
vi.mock('@/app/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('@/app/dominoFill/Tutorial', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/feedback', () => ({
    winFeedback: vi.fn(), feedbackFor: vi.fn(), preloadSounds: vi.fn(), unlockSounds: vi.fn(async () => true),
}))

const DAY = '2026-10-10'
const T0 = new Date(2026, 9, 10, 12).getTime()
const day = (date = DAY): DayEntry => {
    const boards = (size: string) => [1, 2, 3].map(n => ({
        puzzleId: `${date}|${size}${n}`, board: [[null, null], [null, null]],
        boardHorizontalNumbers: '1,1', boardVerticalNumbers: '2,0',
    }))
    return { date, easyBoards: boards('e'), mediumBoards: boards('m'), hardBoards: boards('h') }
}
const loaded = (date: string): LoadedDay => ({ day: day(date), requested: date, clamped: null })
const deferred = <T,>() => {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(r => { resolve = r })
    return { promise, resolve }
}

const roots: RootStore[] = []
const mount = async ({ challenge = true, store = localStorageStore(window.localStorage) as AttemptStore,
    options = {} as Partial<CoordinatorOptions>, startRoot = true } = {}) => {
    let wall = T0
    vi.setSystemTime(new Date(wall))
    const corpus = new CorpusSource()
    vi.spyOn(corpus, 'loadDay').mockImplementation(async requested => loaded(requested))
    const root = new RootStore(corpus, { challenge, coordinator: {
        clock: () => ({ wall, mono: 100 + (wall - T0) }), openStore: async () => store,
        loadDay: async date => loaded(date), listen: () => () => {}, schedule: () => () => {}, ...options,
    } })
    roots.push(root)
    await act(async () => {
        if (startRoot) await root.start()
        render(<StoreContext.Provider value={root}><DominoClient /></StoreContext.Provider>)
    })
    await screen.findByRole('button', { name: 'Archive' })
    const session = () => root.boardsStore.currentBoard!
    return {
        root, store, session,
        /** Move the clock, as the coordinator's one-second timer would see it. */
        setTime: (value: number) => act(() => {
            wall = value
            vi.setSystemTime(new Date(wall))
            root.challenge?.tick()
        }),
    }
}
type Mounted = Awaited<ReturnType<typeof mount>>

const cover = () => document.querySelector('[data-challenge-cover]')
const clock = () => document.querySelector('[data-challenge-clock]')?.textContent ?? null
const card = () => document.querySelector('[data-completion-card]')
/** Nothing of the puzzle: no grid, no cell, no rock, no line target, no description of them. */
const expectNoPuzzle = () => {
    expect(screen.queryByRole('grid')).toBeNull()
    expect(document.querySelector('[data-cell]')).toBeNull()
    expect(document.querySelector('[data-row-label]')).toBeNull()
    expect(document.querySelector('[data-col-label]')).toBeNull()
    expect(document.querySelector('[data-board-shell]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/rock|Row 1, column 1/)
}
const pressStart = async () => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start' })) })
    await waitFor(() => expect(cover()).toBeNull())
}
/** Hold every save until released, then let them through to the real store. */
const holdSaves = (store: AttemptStore) => {
    const real = store.change.bind(store)
    const gate = deferred<void>()
    const spy = vi.spyOn(store, 'change').mockImplementation(async (...args) => {
        await gate.promise
        return real(...args)
    })
    return async () => {
        spy.mockRestore()
        await act(async () => { gate.resolve() })
    }
}
const nextFrame = () => act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
/** The other eight boards of the day already solved, so the board on screen is the last. */
const solveAllBut = async (store: AttemptStore, last: string) => {
    const probe = new RootStore(new CorpusSource())
    probe.boardsStore.setDay(day())
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        for (const level of [1, 2, 3] as const) {
            probe.boardsStore.goToBoard({ difficulty, level })
            const { puzzleId, definitionHash } = probe.boardsStore.currentBoard!.definition
            if (puzzleId === last) continue
            await store.change(puzzleId, current =>
                finish(start(current, { puzzleId, definitionHash, date: DAY }, T0, DAY).next, T0 + 1_000, DAY))
        }
    }
    probe.boardsStore.disposePersist?.()
}
const win = async (m: Mounted, at: number) => {
    await act(async () => { expect(m.session().placeToward([0, 0], 'down')).toBe(true) })
    await m.setTime(at)
    await act(async () => { expect(m.session().placeToward([0, 1], 'down')).toBe(true) })
}

beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('hasSeenTutorial', 'true')
})
afterEach(() => {
    cleanup()
    for (const root of roots.splice(0)) {
        root.dispose()
        root.boardsStore.disposePersist?.()
    }
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('the cover (rules 9-12)', () => {
    it('ready: the board\'s name, today, one Start, and nothing of the puzzle', async () => {
        await mount()
        expect(cover()?.getAttribute('data-challenge-cover')).toBe('ready')
        expect(cover()?.textContent).toContain('Easy · 2×2 · puzzle 1 of 3')
        expect(cover()?.textContent).toContain('Today\'s challenge')
        expect(cover()?.textContent).toContain('Your time starts when you press Start.')
        expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
        expectNoPuzzle()
        // The legend stays, inert: the same two example pieces for every puzzle.
        const legend = document.querySelector('[data-chrome][inert] [data-legend]')
        expect(legend, 'the legend, inside an inert row').not.toBeNull()
        expect(clock()).toBe('0:00')
    })

    it('every covered state shows nothing of the puzzle, with its own words and controls', async () => {
        // preparing: before initialization
        const preparing = await mount({ startRoot: false })
        expect(cover()?.getAttribute('data-challenge-cover')).toBe('preparing')
        expect(cover()?.textContent).toContain('Getting the challenge ready…')
        expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
        expectNoPuzzle()
        cleanup()
        preparing.root.dispose()

        // unprepared: initialization failed, with Try again
        await mount({ options: { loadDay: async () => { throw new Error('offline') } } })
        expect(cover()?.getAttribute('data-challenge-cover')).toBe('unprepared')
        expect(cover()?.textContent).toContain('The challenge couldn\'t be prepared.')
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
        expectNoPuzzle()
        cleanup()

        // future: a board dated after the device's date
        const future = await mount()
        await act(async () => { future.root.boardsStore.setDay(day('2026-10-11')) })
        await waitFor(() => expect(cover()?.getAttribute('data-challenge-cover')).toBe('future'))
        expect(cover()?.textContent).toContain('This board opens on 2026-10-11.')
        expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
        expectNoPuzzle()
        cleanup()

        // mismatch: the stored attempt is another board's
        window.localStorage.clear()
        const store = localStorageStore(window.localStorage)
        const id = `${DAY}|e1`
        await store.change(id, current => start(current, { puzzleId: id, definitionHash: 'other', date: DAY }, T0, DAY))
        await mount({ store })
        expect(cover()?.getAttribute('data-challenge-cover')).toBe('mismatch')
        expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
        expectNoPuzzle()
    })

    it('starting, then a failed Start: Start disabled, then offered again with the reason', async () => {
        const m = await mount()
        const gate = deferred<void>()
        vi.spyOn(m.store, 'change').mockImplementationOnce(async () => {
            await gate.promise
            return { committed: false, changed: false, attempt: null }
        })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start' })) })
        expect(cover()?.getAttribute('data-challenge-cover')).toBe('starting')
        expect((screen.getByRole('button', { name: 'Starting…' }) as HTMLButtonElement).disabled).toBe(true)
        expectNoPuzzle()
        await act(async () => { gate.resolve() })
        await waitFor(() => expect(cover()?.textContent).toContain('Your start couldn\'t be saved, so your time hasn\'t started.'))
        expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(false)
        expectNoPuzzle()
    })

    it('Check, Hint, Undo and Reset are disabled while covered', async () => {
        await mount()
        for (const name of ['Check', 'Hint', 'Undo', 'Reset']) {
            expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled, name).toBe(true)
        }
    })

    it('Start reveals the board, and moves the keyboard onto it if Start had it', async () => {
        await mount()
        const button = screen.getByRole('button', { name: 'Start' })
        button.focus()
        await pressStart()
        expect(screen.getByRole('grid')).toBeTruthy()
        await waitFor(() => expect(screen.getByRole('grid').contains(document.activeElement)).toBe(true))
        expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(false)
    })

    it('a pointer Start leaves focus alone', async () => {
        await mount()
        const outside = screen.getByRole('button', { name: 'Archive' })
        outside.focus()
        await pressStart()
        await new Promise(resolve => requestAnimationFrame(resolve))
        expect(document.activeElement).toBe(outside)
    })

    it('a keyboard Start doesn\'t take focus back after the player moves on while it saves (codex)', async () => {
        const m = await mount()
        const button = screen.getByRole('button', { name: 'Start' })
        button.focus()
        const release = holdSaves(m.store)
        await act(async () => { fireEvent.click(button) })
        expect(cover()?.getAttribute('data-challenge-cover')).toBe('starting')
        const archive = screen.getByRole('button', { name: 'Archive' })
        act(() => { archive.focus() })
        await release()
        await waitFor(() => expect(cover()).toBeNull())
        await nextFrame()
        expect(document.activeElement, 'focus where the player put it').toBe(archive)
    })

    it('a keyboard Start doesn\'t focus another board picked while it saves (codex)', async () => {
        const m = await mount()
        // Puzzle 2 already revealed, so it has a grid that could be focused by mistake.
        await act(async () => { m.root.boardsStore.goToBoard({ difficulty: 'easy', level: 2 }) })
        await pressStart()
        await act(async () => { m.root.boardsStore.goToBoard({ difficulty: 'easy', level: 1 }) })
        const first = m.session()
        const button = screen.getByRole('button', { name: 'Start' })
        button.focus()
        const release = holdSaves(m.store)
        await act(async () => { fireEvent.click(button) })
        // Picked without moving focus, as a board change from the store would be.
        await act(async () => { m.root.boardsStore.goToBoard({ difficulty: 'easy', level: 2 }) })
        await release()
        await waitFor(() => expect(first.challengeView.kind).toBe('playing'))
        await nextFrame()
        expect(screen.getByRole('grid').contains(document.activeElement), 'puzzle 2 took focus').toBe(false)
    })
})

describe('the clock line (rules 13-14)', () => {
    it('formats whole seconds, m:ss then h:mm:ss', () => {
        expect(formatTime(0)).toBe('0:00')
        expect(formatTime(59_999)).toBe('0:59')
        expect(formatTime(60_000)).toBe('1:00')
        expect(formatTime(3_599_000)).toBe('59:59')
        expect(formatTime(3_600_000)).toBe('1:00:00')
        expect(formatTime(-5)).toBe('0:00')
    })

    it('runs while playing, marks hints, and is replaced by a clock change', async () => {
        const m = await mount()
        await pressStart()
        await m.setTime(T0 + 83_000)
        expect(clock()).toBe('1:23')
        expect(document.querySelector('[data-challenge-clock]')?.getAttribute('role')).toBe('timer')
        await act(async () => { await m.session().requestHint() })
        expect(clock()).toBe('1:23 · hints used')
        // A clock change detected and not yet saved. Set directly here: the real detection,
        // from the wall clock falling behind the monotonic one, is driven in challengeView.
        await act(async () => {
            runInAction(() => { m.root.challenge!.bindings.get(m.session())!.clockErrorPending = true })
        })
        expect(clock()).toBe('Clock changed: no time for this board')
    })

    it('says when yesterday\'s board ends', async () => {
        vi.setSystemTime(new Date(T0 + 24 * 3_600_000))
        const m = await mount()
        await m.setTime(T0 + 24 * 3_600_000)
        await act(async () => { m.root.boardsStore.setDay(day(DAY)) })
        expect(cover()?.textContent).toContain('Yesterday\'s challenge · ends at midnight')
        await pressStart()
        expect(clock()).toMatch(/ · ends at midnight$/)
    })

    it('appears for no casual board, and says so for a board played before the challenge', async () => {
        await mount({ challenge: false })
        expect(clock()).toBeNull()
        expect(cover()).toBeNull()
        // No row at all, not an empty one: every row in the column has something in it.
        const rows = [...document.querySelectorAll<HTMLElement>('[data-chrome]')]
        expect(rows.filter(row => row.childElementCount === 0), 'empty chrome rows').toEqual([])
        cleanup()

        window.localStorage.clear()
        window.localStorage.setItem('hasSeenTutorial', 'true')
        window.localStorage.setItem(`dominoFill.progress.v2.${DAY}|e1`, JSON.stringify({
            definitionHash: (await (async () => {
                const probe = new RootStore(new CorpusSource())
                probe.boardsStore.setDay(day())
                const hash = probe.boardsStore.currentBoard!.definition.definitionHash
                probe.boardsStore.disposePersist?.()
                return hash
            })()),
            board: [[1, null], [0, null]], completed: false, savedAt: T0,
        }))
        await mount()
        expect(cover()).toBeNull()
        expect(clock()).toBe('Played before the challenge · untimed')
    })
})

describe('the finish (rules 15-16)', () => {
    it('shows the time and the hints mark, then Next board across sizes', async () => {
        const m = await mount()
        await act(async () => { m.root.boardsStore.goToBoard({ difficulty: 'easy', level: 3 }) })
        await pressStart()
        await win(m, T0 + 83_000)
        await waitFor(() => expect(card()?.textContent).toContain('1:23 · no hints'))
        expect(card()?.textContent).toContain('Solved!')
        const next = screen.getByRole('button', { name: 'Next board' })
        await act(async () => { fireEvent.click(next) })
        expect([m.root.boardsStore.difficulty, m.root.boardsStore.level]).toEqual(['normal', 1])
        expect(cover()?.textContent).toContain('Medium · 2×2 · puzzle 1 of 3')
    })

    it('a hinted solve keeps its time, marked', async () => {
        const m = await mount()
        await pressStart()
        await act(async () => { await m.session().requestHint() })
        await win(m, T0 + 61_000)
        await waitFor(() => expect(card()?.textContent).toContain('1:01 · hints used'))
    })

    it('says it is saving, and while a save fails offers Try again in place of Practice', async () => {
        const m = await mount()
        await pressStart()
        vi.spyOn(m.store, 'change').mockResolvedValue({ committed: false, changed: false, attempt: null })
        await win(m, T0 + 5_000)
        await waitFor(() => expect(card()?.textContent).toContain('Your time isn\'t saved yet. Keep this page open; it\'s still trying.'))
        expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
        expect(screen.queryByRole('button', { name: 'Practice' })).toBeNull()
        expect(clock()).toBe('0:05')
    })

    it('Practice on a board with pieces resets it, undoably, into a Practice run', async () => {
        const m = await mount()
        await pressStart()
        await win(m, T0 + 5_000)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Practice' })).toBeTruthy())
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Practice' })) })
        expect(card()).toBeNull()
        expect(clock()).toBe('Practice · 0:00 · Your result: 0:05 · no hints')
        expect(m.session().canUndo).toBe(true)
        expect(m.root.challenge!.bindings.get(m.session())!.attempt?.result).toEqual({ kind: 'solved', ms: 5_000 })
    })

    it('Practice on a restored empty board starts a run directly (codex): no board change, no Undo, no write', async () => {
        const first = await mount()
        await pressStart()
        await win(first, T0 + 5_000)
        await waitFor(() => expect(first.root.challenge!.bindings.get(first.session())!.attempt?.result).toBeDefined())
        cleanup()
        first.root.dispose()
        first.root.boardsStore.disposePersist?.()
        // The board's progress is lost; the attempt and its result survive.
        const key = `dominoFill.progress.v2.${DAY}|e1`
        window.localStorage.removeItem(key)

        const m = await mount()
        // Opening lands on the first unfinished board; this one is finished, so go back to it.
        await act(async () => { m.root.boardsStore.goToBoard({ difficulty: 'easy', level: 1 }) })
        await waitFor(() => expect(card()?.textContent).toContain('0:05 · no hints'))
        expect(m.session().hasMoves).toBe(false)
        const moves = m.session().moves.length
        await m.setTime(T0 + 9_000)
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Practice' })) })
        expect(card()).toBeNull()
        expect(clock()).toBe('Practice · 0:00 · Your result: 0:05 · no hints')
        expect(m.session().moves.length).toBe(moves)
        expect(m.session().canUndo).toBe(false)
        expect(readProgress(`${DAY}|e1`)).toBeNull()
        expect(m.root.challenge!.bindings.get(m.session())!.attempt?.result).toEqual({ kind: 'solved', ms: 5_000 })
        await m.setTime(T0 + 12_000)
        expect(clock()).toBe('Practice · 0:03 · Your result: 0:05 · no hints')
    })

    it('on the last board, the card focuses Practice once the finish saves (codex)', async () => {
        const store = localStorageStore(window.localStorage) as AttemptStore
        await solveAllBut(store, `${DAY}|e1`)
        const m = await mount({ store })
        expect(cover()?.textContent).toContain('Easy · 2×2 · puzzle 1 of 3')
        await pressStart()
        const release = holdSaves(m.store)
        await win(m, T0 + 5_000)
        await waitFor(() => expect(card()?.textContent).toContain('Saving your time…'))
        expect(card()?.querySelector('button'), 'no action while the finish saves').toBeNull()
        await release()
        const practice = await screen.findByRole('button', { name: 'Practice' })
        expect(document.activeElement).toBe(practice)
    })

    it('but an action that appears late leaves focus where the player put it (codex)', async () => {
        const store = localStorageStore(window.localStorage) as AttemptStore
        await solveAllBut(store, `${DAY}|e1`)
        const m = await mount({ store })
        await pressStart()
        const release = holdSaves(m.store)
        await win(m, T0 + 5_000)
        await waitFor(() => expect(card()?.textContent).toContain('Saving your time…'))
        const archive = screen.getByRole('button', { name: 'Archive' })
        act(() => { archive.focus() })
        await release()
        await screen.findByRole('button', { name: 'Practice' })
        expect(document.activeElement).toBe(archive)
    })

    it('a late Try again takes the focus, and hands it to Practice once the save goes through', async () => {
        const store = localStorageStore(window.localStorage) as AttemptStore
        await solveAllBut(store, `${DAY}|e1`)
        const m = await mount({ store })
        await pressStart()
        const failing = vi.spyOn(m.store, 'change').mockResolvedValue({ committed: false, changed: false, attempt: null })
        await win(m, T0 + 5_000)
        const retry = await screen.findByRole('button', { name: 'Try again' })
        expect(document.activeElement, 'Try again, the card\'s only action').toBe(retry)
        failing.mockRestore()
        await act(async () => { fireEvent.click(retry) })
        const practice = await screen.findByRole('button', { name: 'Practice' })
        expect(retry.isConnected).toBe(false)
        expect(document.activeElement, 'passed on from the Try again that went').toBe(practice)
    })

    it('but not when the player had already moved on from Try again', async () => {
        const store = localStorageStore(window.localStorage) as AttemptStore
        await solveAllBut(store, `${DAY}|e1`)
        const m = await mount({ store })
        await pressStart()
        const failing = vi.spyOn(m.store, 'change').mockResolvedValue({ committed: false, changed: false, attempt: null })
        await win(m, T0 + 5_000)
        const retry = await screen.findByRole('button', { name: 'Try again' })
        expect(document.activeElement).toBe(retry)
        const archive = screen.getByRole('button', { name: 'Archive' })
        act(() => { archive.focus() })
        failing.mockRestore()
        await act(async () => { await m.root.challenge!.retry() })
        await screen.findByRole('button', { name: 'Practice' })
        expect(retry.isConnected).toBe(false)
        expect(document.activeElement).toBe(archive)
    })

    it('nor once the player has left the card and focus has fallen to the page (codex)', async () => {
        const store = localStorageStore(window.localStorage) as AttemptStore
        await solveAllBut(store, `${DAY}|e1`)
        const m = await mount({ store })
        await pressStart()
        const failing = vi.spyOn(m.store, 'change').mockResolvedValue({ committed: false, changed: false, attempt: null })
        await win(m, T0 + 5_000)
        const retry = await screen.findByRole('button', { name: 'Try again' })
        expect(document.activeElement).toBe(retry)
        const archive = screen.getByRole('button', { name: 'Archive' })
        act(() => { archive.focus() })
        // A click on plain text: focus leaves Archive for the page.
        act(() => { archive.blur() })
        expect(document.activeElement).toBe(document.body)
        failing.mockRestore()
        await act(async () => { await m.root.challenge!.retry() })
        const practice = await screen.findByRole('button', { name: 'Practice' })
        expect(retry.isConnected).toBe(false)
        expect(document.activeElement, 'Practice took focus back').not.toBe(practice)
        expect(document.activeElement).toBe(document.body)
    })

    it('a covered board never shows a card, whatever its old completion says', async () => {
        const m = await mount()
        await act(async () => { m.session().setCompleted(true) })
        expect(cover()).not.toBeNull()
        expect(card()).toBeNull()
    })

    it('casual play keeps Next level and Play again', async () => {
        const m = await mount({ challenge: false })
        await win(m, T0 + 1_000)
        await waitFor(() => expect(card()).not.toBeNull())
        expect(screen.getByRole('button', { name: 'Next level' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Play again' })).toBeTruthy()
        expect(card()?.querySelector('[data-completion-result]')).toBeNull()
        expect((screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement).disabled).toBe(false)
    })

    it('result words say why there is no time', () => {
        expect(resultWords({ kind: 'untimed', reason: 'clock-error' }, false)).toBe('Time unavailable: the device clock changed')
        expect(resultWords({ kind: 'untimed', reason: 'finish-lost' }, true)).toBe('Time unavailable: the finish wasn\'t saved in time')
        expect(resultWords({ kind: 'solved', ms: 83_000 }, true)).toBe('1:23 · hints used')
    })
})

describe('the notice (rule 17)', () => {
    it('says the browser can\'t save, in memory mode', async () => {
        await mount({ store: memoryAttemptStore() })
        expect(document.querySelector('[data-challenge-notice]')?.textContent)
            .toBe('This browser can\'t save the challenge: your times last until you close this tab.')
        expect(document.querySelector('[data-challenge-notice]')?.getAttribute('role')).toBe('status')
    })

    it('shows one message, the most important first, and none on a casual board', async () => {
        const m = await mount()
        const binding = m.root.challenge!.bindings.get(m.session())!
        expect(noticeFor(m.session())).toBeNull()
        expect(document.querySelector('[data-challenge-notice]')).toBeNull()
        runInAction(() => { binding.pending = { generation: 1, record: { ...binding.baseline, savedAt: T0 } } })
        expect(noticeFor(m.session())).toBe('Your moves aren\'t being saved. Keep this page open.')
        runInAction(() => { binding.clockErrorPending = true; binding.error = 'save' })
        expect(noticeFor(m.session())).toBe('The clock change couldn\'t be saved yet.')
        cleanup()
        const casual = await mount({ challenge: false })
        expect(noticeFor(casual.session())).toBeNull()
        cleanup()
        // An enabled root, unsaved, on an archive day: casual there too, so no notice.
        const archive = await mount({ store: memoryAttemptStore() })
        expect(noticeFor(archive.session())).not.toBeNull()
        await act(async () => { archive.root.boardsStore.setDay(day('2026-10-01')) })
        expect(archive.session().challengeView.kind).toBe('casual')
        expect(noticeFor(archive.session())).toBeNull()
        expect(document.querySelector('[data-challenge-notice]')).toBeNull()
    })
})
