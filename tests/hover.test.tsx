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
 * The DOM wiring: P0-8 (hover belongs to the session being hovered), P1-2 (the cell comes
 * from the browser's hit-test) and P1-1's handler set.
 *
 * jsdom has no layout and no real hit-testing -- `fireEvent` dispatches at whichever node
 * the test names -- so what it can check is that each event reaches the right method with
 * the right cell. Whether the browser fires those events at all, and what it does about
 * compatibility clicks and pointer capture, is e2e/touch.spec.ts's job.
 */

let root: RootStore

const session = (n = 6, id = 'hover-test') => new PuzzleSession(definitionFrom({
    puzzleId: id,
    board: Array.from({ length: n }, () => Array(n).fill(null)),
    boardHorizontalNumbers: Array(n).fill(3).join(','),
    boardVerticalNumbers: Array(n).fill(3).join(','),
}), root)

beforeEach(() => { root = new RootStore() })
afterEach(cleanup)

describe('hover is owned by the session', () => {
    it('starts empty and highlights nothing', () => {
        const s = session()
        expect(s.hover).toBeNull()
        expect(s.highlightedPair).toBeNull()
    })

    it('clearHover drops the highlight', () => {
        const s = session()
        runInAction(() => { s.pointerDown([2, 2]) })
        s.setHover([3, 2])
        expect(s.highlightedPair).not.toBeNull()

        s.clearHover()
        expect(s.hover).toBeNull()
    })

    it('reset also clears the hover', () => {
        const s = session()
        s.setHover([1, 1])
        runInAction(() => { s.reset() })
        expect(s.hover).toBeNull()
    })

    it('refuses an index that is not a cell of this board', () => {
        const s = session()
        s.setHover([-1, 0])
        expect(s.hover).toBeNull()
        s.setHover([0, 6])
        expect(s.hover).toBeNull()
    })

    it('does not depend on the cell size', () => {
        const s = session()
        s.setHover([3, 2])
        s.setAvailableBox({ width: 200, height: 200 })
        expect(s.hoveredCell).toEqual([3, 2])
    })
})

describe('two mounted boards do not share hover', () => {
    it('hovering one board leaves the other unhighlighted', () => {
        const main = session(6, 'main')
        const tutorial = session(2, 'tutorial')

        runInAction(() => { tutorial.pointerDown([0, 0]) })
        tutorial.setHover([1, 0])

        expect(tutorial.highlightedPair).not.toBeNull()
        expect(main.hover).toBeNull()
        expect(main.highlightedPair).toBeNull()
    })

    it('clearing one board does not clear the other', () => {
        const a = session(6, 'a')
        const b = session(6, 'b')
        a.setHover([1, 1])
        b.setHover([2, 2])

        a.clearHover()
        expect(a.hover).toBeNull()
        expect(b.hoveredCell).toEqual([2, 2])
    })

    it('the global SizeStore no longer carries hover state', () => {
        expect('hoverCords' in root.sizeStore).toBe(false)
        expect('setHoverCords' in root.sizeStore).toBe(false)
    })
})

describe('ClientBoard event wiring', () => {
    const renderBoard = (s: PuzzleSession) => {
        const view = render(
            <StoreContext.Provider value={root}>
                <ClientBoard boardsStore={s} />
            </StoreContext.Provider>
        )
        const grid = view.container.querySelector('.board-grid') as HTMLElement
        expect(grid).toBeTruthy()
        return { ...view, grid }
    }

    const cell = (view: { container: HTMLElement }, i: number, j: number) =>
        view.container.querySelector(`[data-cell="${i},${j}"]`) as HTMLElement

    it('takes the cell from the event target, not from coordinates', () => {
        const s = session()
        const view = renderBoard(s)

        fireEvent.pointerMove(cell(view, 4, 3), { clientX: 0, clientY: 0 })
        expect(s.hoveredCell).toEqual([4, 3])
    })

    it('ignores a move that is not over any cell', () => {
        const s = session()
        const { grid } = renderBoard(s)

        fireEvent.pointerMove(grid, { clientX: 0, clientY: 0 })
        expect(s.hover).toBeNull()
    })

    it('a press and release on one cell is a tap', () => {
        const s = session()
        const view = renderBoard(s)
        const target = cell(view, 2, 2)

        fireEvent.pointerDown(target, { clientX: 0, clientY: 0 })
        fireEvent.pointerUp(target, { clientX: 0, clientY: 0 })

        // Four legal directions, so the tap asks rather than guessing.
        expect(s.pendingAnchor).toEqual([2, 2])
    })

    it('a press on one cell and a release on its neighbour places', () => {
        const s = session()
        const view = renderBoard(s)

        fireEvent.pointerDown(cell(view, 2, 2), { clientX: 0, clientY: 0 })
        fireEvent.pointerMove(cell(view, 3, 2), { clientX: 0, clientY: 0 })
        fireEvent.pointerUp(cell(view, 3, 2), { clientX: 0, clientY: 0 })

        expect(s.board[2][2]).toBe(1)
        expect(s.board[3][2]).toBe(0)
    })

    it('pointercancel abandons the gesture', () => {
        const s = session()
        const view = renderBoard(s)

        fireEvent.pointerDown(cell(view, 2, 2), { clientX: 0, clientY: 0 })
        fireEvent.pointerCancel(view.grid)

        expect(s.gesture).toBeNull()
        expect(s.hover).toBeNull()
        fireEvent.pointerUp(cell(view, 3, 2), { clientX: 0, clientY: 0 })
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })

    it('a drag that leaves the grid is abandoned', () => {
        const s = session()
        const view = renderBoard(s)

        fireEvent.pointerDown(cell(view, 2, 2), { clientX: 0, clientY: 0 })
        fireEvent.pointerLeave(view.grid)

        expect(s.gesture).toBeNull()
        expect(s.highlightedPair).toBeNull()
    })

    it('leaving one board does not disturb another session', () => {
        const shown = session(6, 'shown')
        const other = session(6, 'other')
        other.setHover([5, 5])

        const view = renderBoard(shown)
        fireEvent.pointerMove(cell(view, 0, 0), { clientX: 0, clientY: 0 })
        fireEvent.pointerLeave(view.grid)

        expect(shown.hover).toBeNull()
        expect(other.hoveredCell).toEqual([5, 5])
    })

    it('lostpointercapture abandons an in-flight drag', () => {
        /*
         * Capture going away before the release, with no `pointercancel` to follow. Without
         * this the drag stays armed and the eventual release places a domino the player has
         * had no feedback about.
         *
         * Tested here rather than in e2e/touch.spec.ts because the event cannot be produced
         * in Chromium: releasing an implicit touch capture takes effect but dispatches no
         * `lostpointercapture` anywhere. Measured.
         */
        const s = session()
        const view = renderBoard(s)

        fireEvent.pointerDown(cell(view, 2, 2), { clientX: 0, clientY: 0 })
        expect(s.gesture).not.toBeNull()

        fireEvent.lostPointerCapture(view.grid)
        expect(s.gesture).toBeNull()

        fireEvent.pointerUp(cell(view, 3, 2), { clientX: 0, clientY: 0 })
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })

    it('lostpointercapture leaves a pending offer alone', () => {
        // On the normal path it arrives *after* `pointerup` -- measured -- by which time an
        // ambiguous tap has already turned the gesture into a pending offer. Discarding
        // that would dismiss the candidates the tap had just put on screen.
        const s = session()
        const view = renderBoard(s)
        const target = cell(view, 2, 2)

        fireEvent.pointerDown(target, { clientX: 0, clientY: 0 })
        fireEvent.pointerUp(target, { clientX: 0, clientY: 0 })
        expect(s.pendingAnchor).toEqual([2, 2])

        fireEvent.lostPointerCapture(view.grid)
        expect(s.pendingAnchor).toEqual([2, 2])
        expect(s.candidateCells).toHaveLength(4)
    })

    it('has no click handler at all', () => {
        // Mobile synthesises a compatibility `click` after `pointerup`; a click handler
        // alongside the pointer ones would run the verb twice and place two dominoes.
        const s = session()
        const view = renderBoard(s)

        fireEvent.pointerDown(cell(view, 2, 2), { clientX: 0, clientY: 0 })
        fireEvent.pointerMove(cell(view, 3, 2), { clientX: 0, clientY: 0 })
        fireEvent.pointerUp(cell(view, 3, 2), { clientX: 0, clientY: 0 })
        const afterGesture = JSON.stringify(s.board)

        fireEvent.click(cell(view, 3, 2), { clientX: 0, clientY: 0 })
        expect(JSON.stringify(s.board)).toBe(afterGesture)
    })

    it('routes keys to the session, preventing default only when handled', () => {
        const s = session()
        const { grid } = renderBoard(s)

        // fireEvent returns false when preventDefault was called.
        expect(fireEvent.keyDown(grid, { key: 'ArrowDown' })).toBe(false)
        expect(s.focusedCell).toEqual([0, 0])

        expect(fireEvent.keyDown(grid, { key: 'q' })).toBe(true)
    })

    it('forwards all four modifiers, not just the two that pick the shortcut', () => {
        /*
         * The component's half of the undo contract. `PuzzleSession` can only refuse
         * Ctrl+Shift+Z -- the redo chord -- if it is told that shift was down; a handler
         * that forwards `ctrl` and `meta` alone makes the two chords identical before the
         * store ever sees them.
         *
         * Asserted through the DOM rather than on the store, because the defect lives in
         * the event-to-store translation, which is precisely what a store-level test
         * cannot reach.
         */
        const s = session()
        const { grid } = renderBoard(s)
        runInAction(() => { s.placeToward([2, 2], 'down') })

        // Redo chord: refused, and left to the browser.
        expect(fireEvent.keyDown(grid, { key: 'z', ctrlKey: true, shiftKey: true })).toBe(true)
        expect(s.board[2][2]).toBe(1)

        // Alt chord: likewise.
        expect(fireEvent.keyDown(grid, { key: 'z', ctrlKey: true, altKey: true })).toBe(true)
        expect(s.board[2][2]).toBe(1)

        // Plain undo still works, so the guard did not simply disable the shortcut.
        expect(fireEvent.keyDown(grid, { key: 'z', ctrlKey: true })).toBe(false)
        expect(s.board[2][2]).toBeNull()
    })

    it('leaves Shift-modified board keys to the page', () => {
        // The DOM boundary for the same rule: Shift+Arrow must reach the page (where it
        // extends a selection) rather than being consumed and prevented by the board.
        const s = session()
        const { grid } = renderBoard(s)
        runInAction(() => { s.setFocusedCell([2, 2]) })

        // fireEvent returns false when preventDefault was called, so `true` means the
        // board declined the key.
        expect(fireEvent.keyDown(grid, { key: 'ArrowDown', shiftKey: true })).toBe(true)
        expect(s.focusedCell).toEqual([2, 2])

        expect(fireEvent.keyDown(grid, { key: ' ', shiftKey: true })).toBe(true)
        expect(s.pendingAnchor).toBeNull()
    })

    it('is focusable, so the keyboard can reach it', () => {
        const s = session()
        const { grid } = renderBoard(s)
        expect(grid.tabIndex).toBe(0)
    })
})
