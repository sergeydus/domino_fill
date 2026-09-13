import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'

/**
 * P0-4: one click, routed by the cell under the pointer.
 *
 * Removal used to hang off the piece overlay's own click handler, whose hit region
 * overhangs the cell above it by 12px (spec D4). The decision now comes from a single
 * cell index, so a piece can never claim a click aimed at a different cell.
 *
 * The hit-testing half of that fix is only observable in a real browser and lives in
 * e2e/board.spec.ts -- jsdom dispatches at whichever node a test names, so the wrong
 * node is never *chosen* and the defect cannot appear here. What is testable here is
 * the routing rule itself: which cell a pointer position resolves to, and what a click
 * on that cell does.
 */

const N = 6
let root: RootStore

const session = (rocks: [number, number][] = []) => {
    const board = Array.from({ length: N }, () => Array<number | null>(N).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: 'click-test',
        board,
        boardHorizontalNumbers: '3,3,3,3,3,3',
        boardVerticalNumbers: '3,3,3,3,3,3',
    }), root)
}

/** Centre of cell (i,j), in board coordinates. */
const centre = (s: PuzzleSession, i: number, j: number): [number, number] =>
    [j * s.squareSize + s.squareSize / 2, i * s.squareSize + s.squareSize / 2]

/** A point in the lower half of cell (i,j): placement then prefers the cell below. */
const lowerHalf = (s: PuzzleSession, i: number, j: number): [number, number] =>
    [j * s.squareSize + s.squareSize / 2, i * s.squareSize + s.squareSize * 0.9]

const clickAt = (s: PuzzleSession, point: [number, number]) => {
    s.setHoverPoint(point)
    return runInAction(() => s.activateHoveredCell())
}

beforeEach(() => { root = new RootStore() })

describe('hoveredCell', () => {
    it('is null when the pointer is not over the board', () => {
        expect(session().hoveredCell).toBeNull()
    })

    it('resolves a point to the cell containing it', () => {
        const s = session()
        s.setHoverPoint(centre(s, 3, 2))
        expect(s.hoveredCell).toEqual([3, 2])
    })

    it('resolves the first and last cells at their extremes', () => {
        const s = session()
        const c = s.squareSize

        s.setHoverPoint([0, 0])
        expect(s.hoveredCell).toEqual([0, 0])

        s.setHoverPoint([N * c - 1, N * c - 1])
        expect(s.hoveredCell).toEqual([N - 1, N - 1])
    })

    it('is null outside the grid', () => {
        const s = session()
        const c = s.squareSize

        s.setHoverPoint([-1, 10])
        expect(s.hoveredCell).toBeNull()

        s.setHoverPoint([N * c + 1, 10])
        expect(s.hoveredCell).toBeNull()

        s.setHoverPoint([10, N * c + 1])
        expect(s.hoveredCell).toBeNull()
    })
})

describe('a click on an empty cell places', () => {
    it('places the selected piece and reports it', () => {
        const s = session()
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })

        expect(clickAt(s, lowerHalf(s, 2, 2))).toBe(true)
        expect(s.board[2][2]).toBe(1)
        expect(s.board[3][2]).toBe(0)
    })

    it('reports false and changes nothing when the pointer is off the board', () => {
        const s = session()
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })
        const before = JSON.stringify(s.board)

        expect(clickAt(s, [-5, -5])).toBe(false)
        expect(JSON.stringify(s.board)).toBe(before)
    })
})

describe('a click on an occupied cell removes, and never places', () => {
    it('removes the domino from the half carrying the pips', () => {
        const s = session()
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })
        clickAt(s, lowerHalf(s, 2, 2))

        expect(clickAt(s, centre(s, 2, 2))).toBe(true)
        expect(s.board[2][2]).toBeNull()
        expect(s.board[3][2]).toBeNull()
    })

    it('removes the domino from its other half too', () => {
        const s = session()
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })
        clickAt(s, lowerHalf(s, 2, 2))

        // (3,2) holds the 0. Clicking it must remove the whole domino, not attempt a
        // placement -- an occupied cell is a removal target whatever its value.
        expect(clickAt(s, centre(s, 3, 2))).toBe(true)
        expect(s.board[2][2]).toBeNull()
        expect(s.board[3][2]).toBeNull()
    })

    it('does nothing on a rock', () => {
        const s = session([[1, 1]])
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })

        expect(clickAt(s, centre(s, 1, 1))).toBe(false)
        expect(s.board[1][1]).toBe(-1)
    })

    it('refuses to remove an ambiguously owned cell, and does not place instead', () => {
        const s = session()
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })
        // A 0 claimed by both a 1 above and a 2 to its right: removing either pair would
        // orphan the other, so `pairAt` refuses. The click must then do nothing at all.
        s.board[1][2] = 1
        s.board[2][2] = 0
        s.board[2][3] = 2
        const before = JSON.stringify(s.board)

        expect(clickAt(s, centre(s, 2, 2))).toBe(false)
        expect(JSON.stringify(s.board)).toBe(before)
    })
})

describe('setPieceOnBoard reports whether it placed', () => {
    it('is true for a legal placement and false when there is no valid pair', () => {
        const s = session()
        runInAction(() => { root.boardsStore.setSelectedPiece(1) })

        s.setHoverPoint(lowerHalf(s, 4, 4))
        expect(runInAction(() => s.setPieceOnBoard())).toBe(true)

        s.setHoverPoint(null)
        expect(runInAction(() => s.setPieceOnBoard())).toBe(false)
    })
})
