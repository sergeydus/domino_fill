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
 *
 * Two boards can be mounted at once -- the tutorial renders its own 2x2 over the live
 * board -- and a shared slot means the tutorial's pointer drives a phantom highlight on the
 * board behind it, each interpreting the same coordinates through its own squareSize.
 */

const SIZE = 96 // squareSize for a 6x6 board at the default 768px boardSize

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
        expect(s.hoverPoint).toBeNull()
        expect(s.highlightedPair).toBeNull()
    })

    it('highlights the pair under the pointer', () => {
        const s = session()
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })
        s.setHoverPoint([2 * SIZE + SIZE / 2, 2 * SIZE + SIZE * 0.9])

        expect(s.highlightedPair).toEqual([[2, 2], [3, 2]])
    })

    it('clearHover drops the highlight', () => {
        const s = session()
        s.setHoverPoint([2 * SIZE + SIZE / 2, 2 * SIZE + SIZE * 0.9])
        expect(s.highlightedPair).not.toBeNull()

        s.clearHover()
        expect(s.hoverPoint).toBeNull()
        expect(s.highlightedPair).toBeNull()
    })

    it('reset also clears the hover', () => {
        const s = session()
        s.setHoverPoint([10, 10])
        runInAction(() => { s.reset() })
        expect(s.hoverPoint).toBeNull()
    })
})

describe('two mounted boards do not share hover', () => {
    it('hovering one board leaves the other unhighlighted', () => {
        const main = session(6, 'main')
        const tutorial = session(2, 'tutorial')
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })

        // A point inside the small tutorial board. Under a shared global slot the 6x6
        // board would read the same coordinates through its own squareSize and light up.
        tutorial.setHoverPoint([tutorial.squareSize / 2, tutorial.squareSize * 0.9])

        expect(tutorial.highlightedPair).not.toBeNull()
        expect(main.hoverPoint).toBeNull()
        expect(main.highlightedPair).toBeNull()
    })

    it('clearing one board does not clear the other', () => {
        const a = session(6, 'a')
        const b = session(6, 'b')
        a.setHoverPoint([10, 10])
        b.setHoverPoint([20, 20])

        a.clearHover()
        expect(a.hoverPoint).toBeNull()
        expect(b.hoverPoint).toEqual([20, 20])
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
        // The grid is the element carrying the move/leave handlers.
        const grid = view.container.querySelector('.relative') as HTMLElement
        expect(grid).toBeTruthy()
        return { ...view, grid }
    }

    it('records the pointer position on move', () => {
        const s = session()
        const { grid } = renderBoard(s)

        // jsdom reports a zero rect, so clientX/clientY land directly in board coordinates.
        fireEvent.mouseMove(grid, { clientX: 150, clientY: 220 })
        expect(s.hoverPoint).toEqual([150, 220])
    })

    it('clears the hover when the pointer leaves the grid', () => {
        const s = session()
        const { grid } = renderBoard(s)

        fireEvent.mouseMove(grid, { clientX: 150, clientY: 220 })
        expect(s.hoverPoint).not.toBeNull()

        fireEvent.mouseLeave(grid)
        expect(s.hoverPoint).toBeNull()
        expect(s.highlightedPair).toBeNull()
    })

    it('leaving one board does not disturb another session', () => {
        const shown = session(6, 'shown')
        const other = session(6, 'other')
        other.setHoverPoint([5, 5])

        const { grid } = renderBoard(shown)
        fireEvent.mouseMove(grid, { clientX: 40, clientY: 40 })
        fireEvent.mouseLeave(grid)

        expect(shown.hoverPoint).toBeNull()
        expect(other.hoverPoint).toEqual([5, 5])
    })
})
