import { describe, it, expect, beforeEach } from 'vitest'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import type { StoredPuzzle } from '@/app/stores/PuzzleDefinition'

/**
 * P0-10 characterisation tests.
 *
 * These pin the rules layer AS IT BEHAVES TODAY, before P0 changes it. They deliberately
 * do NOT assert behaviour the spec has yet to build:
 *   - undo round-trips land with P1-3
 *   - the board-full assertion in `completed` lands with P0-6
 * Adding those here would assert behaviour that does not exist and fail on arrival.
 */

const SIZE = 96 // squareSize for a 6x6 board at the default 768px boardSize

const level = (over: Partial<StoredPuzzle> = {}): StoredPuzzle => ({
    puzzleId: 'test-6x6',
    board: Array.from({ length: 6 }, () => Array(6).fill(null)),
    boardHorizontalNumbers: '0,0,0,0,0,0',
    boardVerticalNumbers: '0,0,0,0,0,0',
    ...over,
})

let root: RootStore

const makeBoard = (over: Partial<StoredPuzzle> = {}) =>
    new PuzzleSession(definitionFrom(level(over)), root)

/** Point a session's hover at cell (i,j); `fx`/`fy` are fractions within the cell. */
const hover = (s: PuzzleSession, i: number, j: number, fx = 0.5, fy = 0.5) =>
    s.setHoverPoint([j * SIZE + SIZE * fx, i * SIZE + SIZE * fy])

beforeEach(() => {
    root = new RootStore()
})

describe('squareSize', () => {
    it('divides the board width by n+2 to reserve the number gutters', () => {
        expect(makeBoard().squareSize).toBe(SIZE) // 768 / (6+2)
    })
})

describe('current{Column,Row}Sums', () => {
    // The stored JSON still calls these boardHorizontalNumbers/boardVerticalNumbers, but
    // the inverted naming now stops at the data boundary (spec D10-d2, resolved in P0-6).
    // Pinned here so the axes cannot be silently swapped.
    it('sums columns and rows on the correct axes', () => {
        const b = makeBoard()
        b.board[0][0] = 1
        b.board[1][0] = 0
        b.board[0][3] = 0
        b.board[0][4] = 2

        expect(b.currentColumnSums).toEqual([1, 0, 0, 0, 2, 0]) // per column
        expect(b.currentRowSums).toEqual([3, 0, 0, 0, 0, 0])   // per row
    })

    it('treats rocks (-1) as contributing nothing', () => {
        const b = makeBoard()
        b.board[0][0] = -1
        b.board[0][1] = 1
        expect(b.currentRowSums[0]).toBe(1)
        expect(b.currentColumnSums[0]).toBe(0)
    })
})

describe('completedByRules (fullness + targets, since P0-6)', () => {
    // The 2x2 tutorial board; its only solution is two vertical dominoes.
    const tutorial = () => definitionFrom({
        puzzleId: 'tutorial-v1',
        board: [[null, null], [null, null]],
        boardHorizontalNumbers: '1,1',
        boardVerticalNumbers: '2,0',
    })

    it('is false for an untouched board', () => {
        expect(new PuzzleSession(tutorial(), root).completedByRules).toBe(false)
    })

    it('is true once both vertical dominoes are placed', () => {
        const b = new PuzzleSession(tutorial(), root)
        b.board[0][0] = 1; b.board[1][0] = 0
        b.board[0][1] = 1; b.board[1][1] = 0
        expect(b.completedByRules).toBe(true)
    })
})

describe('setPieceOnBoard', () => {
    it('places a vertical domino as 1 above 0', () => {
        const b = makeBoard()
        root.boardsStore.setSelectedPiece(1)
        hover(b, 2, 2, 0.5, 0.9) // lower half -> extends downward
        b.setPieceOnBoard()

        expect(b.board[2][2]).toBe(1)
        expect(b.board[3][2]).toBe(0)
    })

    it('places a horizontal domino as 0 left of 2', () => {
        const b = makeBoard()
        root.boardsStore.setSelectedPiece(2)
        hover(b, 2, 2, 0.9, 0.5) // right half -> extends rightward
        b.setPieceOnBoard()

        expect(b.board[2][2]).toBe(0)
        expect(b.board[2][3]).toBe(2)
    })

    it('rejects a placement onto an occupied cell', () => {
        const b = makeBoard()
        b.board[2][2] = -1
        root.boardsStore.setSelectedPiece(1)
        hover(b, 2, 2)
        b.setPieceOnBoard()

        expect(b.board[2][2]).toBe(-1)
        expect(b.board[3][2]).toBeNull()
    })

    it('rejects a placement with no hover', () => {
        const b = makeBoard()
        b.setHoverPoint(null)
        b.setPieceOnBoard()
        expect(b.board.flat().every(c => c === null)).toBe(true)
    })

    it('falls back to the opposite neighbour when the preferred one is blocked', () => {
        // Documents the silent fall-through the spec flags in P1-1 as undiscoverable.
        const b = makeBoard()
        b.board[3][2] = -1 // block below
        root.boardsStore.setSelectedPiece(1)
        hover(b, 2, 2, 0.5, 0.9) // asks to extend DOWN, but down is blocked

        b.setPieceOnBoard()
        expect(b.board[1][2]).toBe(1) // extended UP instead
        expect(b.board[2][2]).toBe(0)
    })
})

// removePiece is covered comprehensively in tests/removePiece.test.ts (P0-7).

describe('domino pairing invariant (spec D6)', () => {
    // This invariant is what makes a sums-match-but-not-full board impossible.
    // P0-7 exists to protect it; if it ever breaks, premature wins become reachable.
    const assertPaired = (board: (number | null)[][]) => {
        for (let i = 0; i < board.length; i++) {
            for (let j = 0; j < board[i].length; j++) {
                if (board[i][j] === 1) {
                    expect(board[i + 1]?.[j], `1 at ${i},${j} must have 0 below`).toBe(0)
                }
                if (board[i][j] === 2) {
                    expect(board[i]?.[j - 1], `2 at ${i},${j} must have 0 left`).toBe(0)
                }
            }
        }
    }

    it('holds after a mix of placements', () => {
        const b = makeBoard()
        root.boardsStore.setSelectedPiece(1)
        hover(b, 0, 0, 0.5, 0.9); b.setPieceOnBoard()
        hover(b, 2, 4, 0.5, 0.9); b.setPieceOnBoard()
        root.boardsStore.setSelectedPiece(2)
        hover(b, 4, 0, 0.9, 0.5); b.setPieceOnBoard()
        hover(b, 5, 2, 0.9, 0.5); b.setPieceOnBoard()

        assertPaired(b.board)
    })

    it('holds after placements are removed again', () => {
        const b = makeBoard()
        root.boardsStore.setSelectedPiece(1)
        hover(b, 1, 1, 0.5, 0.9); b.setPieceOnBoard()
        expect(b.board[1][1]).toBe(1)

        b.removePiece(1, 1)
        assertPaired(b.board)
        expect(b.board.flat().every(c => c === null)).toBe(true)
    })
})
