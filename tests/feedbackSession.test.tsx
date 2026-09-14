// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runInAction } from 'mobx'
import { render, cleanup, act } from '@testing-library/react'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { StoreContext } from '@/app/provider'
import ClientBoard from '@/app/dominoFill/ClientBoard'

/**
 * Feedback must not leak across puzzles (spec P1-5).
 *
 * `ClientBoard` is not remounted when the player changes level or difficulty: `DominoClient`
 * renders it with no `key`, so the component survives while its `boardsStore` prop becomes a
 * different `PuzzleSession`. The counters that decide "has anything happened since I last
 * looked" are component refs, and sessions are cached and keep their own counters, so a
 * naive comparison compares one puzzle's history with another's.
 *
 * What that does to a player: finish a move on level 1, switch to an untouched level 2, and
 * the fresh board buzzes as though it had just refused something it was never asked to do.
 */

const controls = vi.hoisted(() => ({
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    set: vi.fn(),
    mount: vi.fn(() => () => { }),
    // motion subscribes the visual element to the controls on mount; a stub without this
    // is not an `AnimationControls` and the component crashes before any assertion.
    subscribe: vi.fn(() => () => { }),
}))

vi.mock('motion/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('motion/react')>()
    return { ...actual, useAnimationControls: () => controls }
})

let root: RootStore
let vibrate: ReturnType<typeof vi.fn>
let play: ReturnType<typeof vi.fn>

/** A 4x4 with room to place and, at [1,1]..[2,2], a box to be refused in. */
const session = (puzzleId: string, rocks: [number, number][] = []) => {
    const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId,
        board,
        boardHorizontalNumbers: '3,3,3,3',
        boardVerticalNumbers: '3,3,3,3',
    }), root)
}

/** Boxed in on all four sides: every move from [1,1] is refused. */
const boxed = (id: string) => session(id, [[0, 1], [2, 1], [1, 0], [1, 2]])

const renderBoard = (s: PuzzleSession) => render(
    <StoreContext.Provider value={root}>
        <ClientBoard boardsStore={s} />
    </StoreContext.Provider>
)

const quiet = () => {
    vibrate.mockClear()
    play.mockClear()
    controls.start.mockClear()
    controls.stop.mockClear()
    controls.set.mockClear()
}

/** Nothing was felt, heard, or seen to move. */
const nothingHappened = () => {
    expect(vibrate, 'vibration').not.toHaveBeenCalled()
    expect(play, 'sound').not.toHaveBeenCalled()
    expect(controls.start, 'shake').not.toHaveBeenCalled()
}

beforeEach(() => {
    root = new RootStore()
    vibrate = vi.fn()
    play = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play)
})

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete (navigator as Partial<Navigator>).vibrate
})

describe('switching puzzles does not replay the last one', () => {
    it('an untouched board is silent and still when it arrives', () => {
        const one = session('one')
        const two = session('two')
        const view = renderBoard(one)

        act(() => { runInAction(() => { one.pointerDown([0, 0]); one.pointerUp([1, 0]) }) })
        expect(one.lastOutcome).toBe('placed')
        quiet()

        // Level 2, never touched: its counters are zero, level 1's are not.
        act(() => { view.rerender(
            <StoreContext.Provider value={root}><ClientBoard boardsStore={two} /></StoreContext.Provider>
        ) })

        nothingHappened()
    })

    it('a fresh board does not shake for a refusal that happened on another board', () => {
        const one = boxed('one')
        const two = session('two')
        const view = renderBoard(one)

        act(() => { runInAction(() => { one.pointerDown([1, 1]); one.pointerUp([1, 1]) }) })
        expect(one.lastOutcome).toBe('none')
        expect(one.rejectionTick).toBeGreaterThan(0)
        quiet()

        act(() => { view.rerender(
            <StoreContext.Provider value={root}><ClientBoard boardsStore={two} /></StoreContext.Provider>
        ) })

        expect(two.rejectionTick).toBe(0)
        nothingHappened()
    })

    it('switching back does not replay what that board did last time', () => {
        const one = session('one')
        const two = session('two')
        const view = renderBoard(one)

        act(() => { runInAction(() => { one.pointerDown([0, 0]); one.pointerUp([1, 0]) }) })
        act(() => { view.rerender(
            <StoreContext.Provider value={root}><ClientBoard boardsStore={two} /></StoreContext.Provider>
        ) })
        quiet()

        // Back to level 1, whose session still remembers `placed` and its tick.
        act(() => { view.rerender(
            <StoreContext.Provider value={root}><ClientBoard boardsStore={one} /></StoreContext.Provider>
        ) })

        nothingHappened()
    })

    it('a shake in flight is stopped rather than carried onto the next board', () => {
        const one = boxed('one')
        const two = session('two')
        const view = renderBoard(one)

        act(() => { runInAction(() => { one.pointerDown([1, 1]); one.pointerUp([1, 1]) }) })
        expect(controls.start).toHaveBeenCalled()   // the shake really started
        quiet()

        act(() => { view.rerender(
            <StoreContext.Provider value={root}><ClientBoard boardsStore={two} /></StoreContext.Provider>
        ) })

        // The animation controls are shared with the next board, so leaving one running
        // would finish it on a puzzle that never earned it.
        expect(controls.stop).toHaveBeenCalled()
        expect(controls.start).not.toHaveBeenCalled()
    })

    it('and the new board still responds to its own moves afterwards', () => {
        // The reset must not be a mute switch: the point is to skip the stale event, not to
        // stop listening.
        const one = session('one')
        const two = boxed('two')
        const view = renderBoard(one)

        act(() => { runInAction(() => { one.pointerDown([0, 0]); one.pointerUp([1, 0]) }) })
        act(() => { view.rerender(
            <StoreContext.Provider value={root}><ClientBoard boardsStore={two} /></StoreContext.Provider>
        ) })
        quiet()

        act(() => { runInAction(() => { two.pointerDown([1, 1]); two.pointerUp([1, 1]) }) })

        expect(two.lastOutcome).toBe('none')
        expect(controls.start).toHaveBeenCalled()
        expect(vibrate).toHaveBeenCalledWith(25)
    })
})
