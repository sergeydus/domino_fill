// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RootStore } from '@/app/stores/RootStore'
import { CorpusSource, type LoadedDay } from '@/app/stores/corpusSource'
import { clampToCorpus, datesIn, type DayEntry, type Manifest } from '@/app/stores/corpus'
import { StoreContext } from '@/app/provider'
import DominoClient from '@/app/dominoFill/DominoClient'
import { localStorageStore } from '@/app/challenge/attemptStore'

// Keep the actual client callback, archive, banner and navigation buttons. Layout and
// drawing are irrelevant to selecting a day; the root and coordinator remain real.
vi.mock('@/app/hooks/useAvailableBoardBox', () => ({ useAvailableBoardBox: () => null }))
vi.mock('@/app/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }))
vi.mock('@/app/dominoFill/ClientBoard', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/DifficultySlider', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/Pieces/DominoPieces', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/LevelSelector', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/GameControls', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/CompletionCard', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/AdviceStrip', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/Tutorial', () => ({ default: () => null }))
vi.mock('@/app/dominoFill/feedback', () => ({
    winFeedback: vi.fn(), preloadSounds: vi.fn(), unlockSounds: vi.fn(async () => true),
}))

const FIRST = '2026-09-01'
const SECOND = '2026-09-02'
const BEFORE = '2026-08-31'
const LAST = '2036-08-31'
const noon = (date: string) => {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d, 12)
}
const manifest: Manifest = {
    version: 1, seed: 1, generatedAt: '', firstDate: FIRST, lastDate: LAST,
    days: 3653, puzzles: 32877, chunks: [],
}
const day = (date: string): DayEntry => {
    const boards = (size: string) => [1, 2, 3].map(n => ({
        puzzleId: `${date}|${size}${n}`, board: [[null, null], [null, null]],
        boardHorizontalNumbers: '1,1', boardVerticalNumbers: '2,0',
    }))
    return { date, easyBoards: boards('e'), mediumBoards: boards('m'), hardBoards: boards('h') }
}
const response = (requested: string): LoadedDay => {
    const selected = clampToCorpus(requested, manifest)
    return { day: day(selected.date), requested, clamped: selected.clamped }
}
const deferred = () => {
    let resolve!: (value: LoadedDay) => void
    const promise = new Promise<LoadedDay>(done => { resolve = done })
    return { promise, resolve }
}
const roots: RootStore[] = []
const mount = async (date: string, challenge = true) => {
    vi.setSystemTime(noon(date))
    const corpus = new CorpusSource()
    const load = vi.spyOn(corpus, 'loadDay').mockImplementation(async requested => response(requested))
    vi.spyOn(corpus, 'loadManifest').mockResolvedValue(manifest)
    vi.spyOn(corpus, 'loadChunk').mockImplementation(async month => ({
        month, version: 1, days: datesIn(month).filter(d => d >= FIRST && d <= LAST).map(day),
    }))
    const root = new RootStore(corpus, { challenge, coordinator: {
        clock: () => ({ wall: Date.now(), mono: 100 }),
        openStore: async () => localStorageStore(window.localStorage),
        listen: () => () => {}, schedule: () => () => {},
    } })
    roots.push(root)
    await act(async () => {
        await root.start()
        render(<StoreContext.Provider value={root}><DominoClient /></StoreContext.Provider>)
    })
    await screen.findByRole('button', { name: 'Archive' })
    await act(async () => { await root.challenge?.refresh() })
    const selected = () => {
        const session = root.boardsStore.currentBoard!
        return { session, binding: root.challenge!.bindings.get(session)! }
    }
    const clock = async (next: string) => {
        await act(async () => {
            vi.setSystemTime(noon(next))
            root.challenge?.tick()
            await root.challenge?.refresh()
        })
    }
    return { root, load, selected, clock }
}
const archiveDate = async (date: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    return screen.findByRole('button', { name: new RegExp(`^${date},`) })
}
const archiveClosed = async () => {
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Puzzle archive' })).toBeNull())
}
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    window.localStorage.clear()
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

describe('the actual archive and banner selection callbacks', () => {
    it('clicking the current first date in the archive keeps the corrected board playable', async () => {
        const h = await mount(BEFORE)
        const { session, binding } = h.selected()
        act(() => { expect(session.placeToward([0, 0], 'down')).toBe(true) })
        fireEvent.click(await archiveDate(FIRST))
        await archiveClosed()
        expect(h.root.challenge!.isCovered(binding)).toBe(false)
        expect(h.selected().session).toBe(session)
        expect(session.board).toEqual([[1, null], [0, null]])
        expect(session.moves).toHaveLength(1)
        act(() => { session.undo() })
        expect(session.board).toEqual(session.definition.initialBoard)
        act(() => { expect(session.placeToward([0, 0], 'down')).toBe(true) })
    })
    it('Play today fetches the corrected first date after a delayed earlier archive pick', async () => {
        const h = await mount(SECOND)
        const button = await archiveDate(SECOND)
        const late = deferred()
        h.load.mockImplementationOnce(() => late.promise)
        fireEvent.click(button)
        await h.clock(BEFORE)
        // A rollover arrives before the older explicit navigation request finishes.
        await act(async () => { window.dispatchEvent(new Event('focus')) })
        await waitFor(() => expect(h.root.boardsStore.viewingDate).toBe(FIRST))
        expect(h.root.boardsStore.pendingDay).toBeNull()
        await act(async () => { late.resolve(response(SECOND)) })
        await archiveClosed()
        expect(h.root.boardsStore.viewingDate).toBe(SECOND)
        expect(h.root.boardsStore.today).toBe(FIRST)
        fireEvent.click(screen.getByRole('button', { name: 'Play today' }))
        await waitFor(() => expect(h.root.boardsStore.viewingDate).toBe(FIRST))
        const { session, binding } = h.selected()
        expect(h.root.challenge!.isCovered(binding)).toBe(false)
        act(() => { expect(session.placeToward([0, 0], 'down')).toBe(true) })
    })
    it('Play today adopts a held before-clamped response without fetching it again', async () => {
        const h = await mount(SECOND)
        await act(async () => { expect(await h.selected().session.startChallenge()).toBe(true) })
        act(() => { expect(h.selected().session.placeToward([0, 0], 'down')).toBe(true) })
        await h.clock(BEFORE)
        await act(async () => { window.dispatchEvent(new Event('focus')) })
        await waitFor(() => expect(h.root.boardsStore.pendingDay?.date).toBe(FIRST))
        expect(h.root.boardsStore.viewingDate).toBe(SECOND)
        h.load.mockClear()
        fireEvent.click(screen.getByRole('button', { name: 'Play today' }))
        await waitFor(() => expect(h.root.boardsStore.viewingDate).toBe(FIRST))
        expect(h.root.challenge!.isCovered(h.selected().binding)).toBe(false)
        expect(h.root.boardsStore.pendingDayClamp).toBeNull()
        expect(h.load).not.toHaveBeenCalled()
    })
    it('a clock corrected into the corpus during a selection load restores the cover', async () => {
        const h = await mount(BEFORE)
        const button = await archiveDate(FIRST)
        const late = deferred()
        h.load.mockImplementationOnce(() => late.promise)
        fireEvent.click(button)
        await h.clock(FIRST)
        expect(h.root.boardsStore.clockClamp).toBe('before')
        await act(async () => { late.resolve(response(FIRST)) })
        await archiveClosed()
        expect(h.root.challenge!.isCovered(h.selected().binding)).toBe(true)
        expect(h.root.challenge!.canStart(h.selected().binding)).toBe(true)
    })
    it('a clock corrected before the corpus during a selection load inherits before provenance', async () => {
        const h = await mount(FIRST)
        const button = await archiveDate(FIRST)
        const late = deferred()
        h.load.mockImplementationOnce(() => late.promise)
        fireEvent.click(button)
        await h.clock(BEFORE)
        expect(h.root.boardsStore.clockClamp).toBeNull()
        await act(async () => { late.resolve(response(FIRST)) })
        await archiveClosed()
        const { session, binding } = h.selected()
        expect(h.root.challenge!.isCovered(binding)).toBe(false)
        expect(h.root.challenge!.canStart(binding)).toBe(false)
        act(() => { expect(session.placeToward([0, 0], 'down')).toBe(true) })
    })
    it('a failed archive selection preserves the visible corrected board and its mode', async () => {
        const h = await mount(BEFORE)
        const { session, binding } = h.selected()
        act(() => { expect(session.placeToward([0, 0], 'down')).toBe(true) })
        const button = await archiveDate(FIRST)
        h.load.mockRejectedValueOnce(new Error('selected day unavailable'))
        fireEvent.click(button)
        const alert = await screen.findByRole('alert')
        expect(alert.textContent).toBe(`${FIRST} could not be loaded.`)
        expect(h.selected().session).toBe(session)
        expect(session.board).toEqual([[1, null], [0, null]])
        expect(h.root.challenge!.isCovered(binding)).toBe(false)
        expect(h.root.boardsStore.viewingClamp).toBe('before')
    })
    it('default roots keep casual moves when the archive picks the current first date', async () => {
        const h = await mount(BEFORE, false)
        const session = h.root.boardsStore.currentBoard!
        act(() => { expect(session.placeToward([0, 0], 'down')).toBe(true) })
        fireEvent.click(await archiveDate(FIRST))
        await archiveClosed()
        expect(h.root.challenge).toBeNull()
        expect(h.root.boardsStore.currentBoard).toBe(session)
        expect(session.moves).toHaveLength(1)
        act(() => { session.undo() })
        expect(session.board).toEqual(session.definition.initialBoard)
    })
})
