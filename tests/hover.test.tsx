// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runInAction } from 'mobx'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { StoreContext } from '@/app/provider'
import ClientBoard from '@/app/dominoFill/ClientBoard'

/**
 * P0-8: hover belongs to the board being hovered, not to a global slot.
 * P1-2: the cell comes from the browser's hit-test, not from coordinate arithmetic.
 *
 * Two boards can be mounted at once -- the tutorial renders its own 2x2 over the live
 * board -- and a shared slot means the tutorial's pointer drives a phantom highlight on
 * the board behind it.
 */

let root: RootStore

const session = (n = 6, id = 'hover-test') => new PuzzleSession(definitionFrom({
    puzzleId: id,
    board: Array.from({ length: n }, () => Array(n).fill(null)),
    boardHorizontalNumbers: Array(n).fill(3).join(','),
    boardVerticalNumbers: Array(n).fill(3).join(','),
}), root)

const centre = (i: number, j: number) => ({ i, j, fx: 0.5, fy: 0.5 })
const lowerHalf = (i: number, j: number) => ({ i, j, fx: 0.5, fy: 0.9 })

beforeEach(() => { root = new RootStore() })
afterEach(cleanup)

describe('hover is owned by the session', () => {
    it('starts empty and highlights nothing', () => {
        const s = session()
        expect(s.hover).toBeNull()
        expect(s.highlightedPair).toBeNull()
    })

    it('highlights the pair under the pointer', () => {
        const s = session()
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })
        s.setHover(lowerHalf(2, 2))

        expect(s.highlightedPair).toEqual([[2, 2], [3, 2]])
    })

    it('the half of the cell decides which way the domino points', () => {
        const s = session()
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })

        s.setHover({ i: 2, j: 2, fx: 0.5, fy: 0.9 })
        expect(s.highlightedPair).toEqual([[2, 2], [3, 2]])

        s.setHover({ i: 2, j: 2, fx: 0.5, fy: 0.1 })
        expect(s.highlightedPair).toEqual([[2, 2], [1, 2]])
    })

    it('clearHover drops the highlight', () => {
        const s = session()
        s.setHover(lowerHalf(2, 2))
        expect(s.hover).not.toBeNull()

        s.clearHover()
        expect(s.hover).toBeNull()
        expect(s.highlightedPair).toBeNull()
    })

    it('reset also clears the hover', () => {
        const s = session()
        s.setHover(centre(1, 1))
        runInAction(() => { s.reset() })
        expect(s.hover).toBeNull()
    })
})

describe('two mounted boards do not share hover', () => {
    it('hovering one board leaves the other unhighlighted', () => {
        const main = session(6, 'main')
        const tutorial = session(2, 'tutorial')
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })

        tutorial.setHover(lowerHalf(0, 0))

        expect(tutorial.highlightedPair).not.toBeNull()
        expect(main.hover).toBeNull()
        expect(main.highlightedPair).toBeNull()
    })

    it('clearing one board does not clear the other', () => {
        const a = session(6, 'a')
        const b = session(6, 'b')
        a.setHover(centre(1, 1))
        b.setHover(centre(2, 2))

        a.clearHover()
        expect(a.hover).toBeNull()
        expect(b.hoveredCell).toEqual([2, 2])
    })

    it('the global SizeStore no longer carries hover state', () => {
        expect('hoverCords' in root.sizeStore).toBe(false)
        expect('setHoverCords' in root.sizeStore).toBe(false)
    })
})

describe('ClientBoard pointer handling', () => {
    const renderBoard = (s: PuzzleSession) => {
        const view = render(
            <StoreContext.Provider value={root}>
                <ClientBoard boardsStore={s} />
            </StoreContext.Provider>
        )
        const grid = view.container.querySelector('.relative') as HTMLElement
        expect(grid).toBeTruthy()
        return { ...view, grid }
    }

    const cell = (view: { container: HTMLElement }, i: number, j: number) =>
        view.container.querySelector(`[data-cell="${i},${j}"]`) as HTMLElement

    /**
     * Give one cell a real rect. jsdom has no layout, so every `getBoundingClientRect()`
     * is zeros; the handler still resolves the cell from the hit-test, and only the
     * half-of-the-cell fraction needs a box.
     */
    const withRect = (el: HTMLElement, rect: Partial<DOMRect>) => {
        el.getBoundingClientRect = () => ({
            x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
            toJSON: () => ({}), ...rect,
        }) as DOMRect
    }

    it('takes the cell from the event target, not from coordinates', () => {
        const s = session()
        const view = renderBoard(s)

        // Dispatched at the cell itself: this is what the browser's hit-test produces,
        // and the index is read back off the element rather than computed.
        fireEvent.mouseMove(cell(view, 4, 3), { clientX: 0, clientY: 0 })
        expect(s.hoveredCell).toEqual([4, 3])
    })

    it('reads the half of the cell from that one cell rect', () => {
        const s = session()
        const view = renderBoard(s)
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })

        const target = cell(view, 2, 2)
        withRect(target, { left: 100, top: 200, width: 40, height: 40 })

        // 36px down a 40px cell: the lower half, so the domino points down.
        fireEvent.mouseMove(target, { clientX: 120, clientY: 236 })
        expect(s.highlightedPair).toEqual([[2, 2], [3, 2]])

        // 4px down: the upper half, so it points up instead.
        fireEvent.mouseMove(target, { clientX: 120, clientY: 204 })
        expect(s.highlightedPair).toEqual([[2, 2], [1, 2]])
    })

    it('treats a cell with no layout as hovered at its centre', () => {
        // jsdom reports a zero rect. The cell is still known for certain -- only the half
        // is not -- so the hover survives rather than being discarded.
        const s = session()
        const view = renderBoard(s)

        fireEvent.mouseMove(cell(view, 1, 1), { clientX: 0, clientY: 0 })
        expect(s.hover).toEqual({ i: 1, j: 1, fx: 0.5, fy: 0.5 })
    })

    it('ignores a move that is not over any cell', () => {
        const s = session()
        const { grid } = renderBoard(s)

        fireEvent.mouseMove(grid, { clientX: 5, clientY: 5 })
        expect(s.hover).toBeNull()
    })

    it('clears the hover when the pointer leaves the grid', () => {
        const s = session()
        const view = renderBoard(s)

        fireEvent.mouseMove(cell(view, 2, 2), { clientX: 0, clientY: 0 })
        expect(s.hover).not.toBeNull()

        fireEvent.mouseLeave(view.grid)
        expect(s.hover).toBeNull()
        expect(s.highlightedPair).toBeNull()
    })

    it('leaving one board does not disturb another session', () => {
        const shown = session(6, 'shown')
        const other = session(6, 'other')
        other.setHover(centre(5, 5))

        const view = renderBoard(shown)
        fireEvent.mouseMove(cell(view, 0, 0), { clientX: 0, clientY: 0 })
        fireEvent.mouseLeave(view.grid)

        expect(shown.hover).toBeNull()
        expect(other.hoveredCell).toEqual([5, 5])
    })
})

describe('a click resolves its own cell', () => {
    const renderBoard = (s: PuzzleSession) => render(
        <StoreContext.Provider value={root}>
            <ClientBoard boardsStore={s} />
        </StoreContext.Provider>
    )
    const cell = (view: { container: HTMLElement }, i: number, j: number) =>
        view.container.querySelector(`[data-cell="${i},${j}"]`) as HTMLElement

    it('places without any preceding pointer move', () => {
        // The click used to act on whatever the last move had stored, so a click with no
        // move before it placed nothing at all.
        const s = session()
        const view = renderBoard(s)
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })

        fireEvent.click(cell(view, 2, 3), { clientX: 0, clientY: 0 })

        expect(s.board[2][3]).not.toBeNull()
    })

    it('acts on the clicked cell, not on a stale hover', () => {
        const s = session()
        const view = renderBoard(s)
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })

        s.setHover({ i: 0, j: 0, fx: 0.5, fy: 0.9 })
        fireEvent.click(cell(view, 4, 4), { clientX: 0, clientY: 0 })

        expect(s.hoveredCell).toEqual([4, 4])
        expect(s.board[4][4]).not.toBeNull()
        expect(s.board[0][0]).toBeNull()
        expect(s.board[1][0]).toBeNull()
    })

    it('still does nothing when the click is not over a cell', () => {
        const s = session()
        const view = renderBoard(s)
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })
        const grid = view.container.querySelector('.relative') as HTMLElement

        fireEvent.click(grid, { clientX: 0, clientY: 0 })

        expect(s.board.flat().every(c => c === null)).toBe(true)
    })
})
