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

beforeEach(() => {
    root = new RootStore()
})

describe('squareSize', () => {
    // The full geometry surface lives in tests/geometry.test.ts; this is the one case the
    // hit-test points in this file are derived from.
    it('reserves one 0.7-cell gutter and fits inside the available width', () => {
        const b = makeBoard()
        expect(b.squareSize).toBe(Math.floor((768 - 8) / (6 + 0.7)))
        expect(b.shellWidth).toBeLessThanOrEqual(b.availableWidth)
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

describe('placeToward', () => {
    it('places an upright domino as 1 above 0', () => {
        const b = makeBoard()
        expect(b.placeToward([2, 2], 'down')).toBe(true)

        expect(b.board[2][2]).toBe(1)
        expect(b.board[3][2]).toBe(0)
    })

    it('dragging up is not the same placement as dragging down', () => {
        // The direction fixes the pip values, not just the shape: the anchor is the top
        // half going down and the bottom half going up.
        const b = makeBoard()
        expect(b.placeToward([2, 2], 'up')).toBe(true)

        expect(b.board[1][2]).toBe(1)
        expect(b.board[2][2]).toBe(0)
    })

    it('places a flat domino as 0 left of 2', () => {
        const b = makeBoard()
        expect(b.placeToward([2, 2], 'right')).toBe(true)

        expect(b.board[2][2]).toBe(0)
        expect(b.board[2][3]).toBe(2)
    })

    it('dragging left carries the 2 on the anchor', () => {
        const b = makeBoard()
        expect(b.placeToward([2, 2], 'left')).toBe(true)

        expect(b.board[2][1]).toBe(0)
        expect(b.board[2][2]).toBe(2)
    })

    it('refuses a placement onto an occupied cell, and changes nothing', () => {
        const b = makeBoard()
        b.board[2][2] = -1
        expect(b.placeToward([2, 2], 'down')).toBe(false)

        expect(b.board[2][2]).toBe(-1)
        expect(b.board[3][2]).toBeNull()
    })

    it('refuses a placement whose neighbour is occupied', () => {
        const b = makeBoard()
        b.board[3][2] = -1
        expect(b.placeToward([2, 2], 'down')).toBe(false)
        expect(b.board[2][2]).toBeNull()
    })

    it('refuses a placement off the edge of the board', () => {
        const b = makeBoard()
        expect(b.placeToward([0, 0], 'up')).toBe(false)
        expect(b.placeToward([0, 0], 'left')).toBe(false)
        expect(b.board.flat().every(c => c === null)).toBe(true)
    })

    it('never falls through to the opposite direction', () => {
        // The defect P1-1 names: the old rule asked to extend DOWN, found it blocked, and
        // silently placed UP instead -- violating the stated rule exactly when the board
        // gets interesting. A refused direction is now simply refused.
        const b = makeBoard()
        b.board[3][2] = -1

        expect(b.placeToward([2, 2], 'down')).toBe(false)
        expect(b.board[1][2]).toBeNull()
        expect(b.board[2][2]).toBeNull()
    })
})

describe('legalDirections', () => {
    it('lists every direction a domino fits', () => {
        const b = makeBoard()
        expect(b.legalDirections([2, 2]).sort()).toEqual(['down', 'left', 'right', 'up'])
    })

    it('excludes blocked neighbours and the board edge', () => {
        const b = makeBoard()
        b.board[1][0] = -1
        expect(b.legalDirections([0, 0]).sort()).toEqual(['right'])
    })

    it('is empty for an occupied cell', () => {
        const b = makeBoard()
        b.board[2][2] = -1
        expect(b.legalDirections([2, 2])).toEqual([])
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

    it('holds after a mix of placements in every direction', () => {
        const b = makeBoard()
        b.placeToward([0, 0], 'down')
        b.placeToward([3, 4], 'up')
        b.placeToward([4, 0], 'right')
        b.placeToward([5, 3], 'left')

        assertPaired(b.board)
    })

    it('holds after placements are removed again', () => {
        const b = makeBoard()
        b.placeToward([1, 1], 'down')
        expect(b.board[1][1]).toBe(1)

        b.removePiece(1, 1)
        assertPaired(b.board)
        expect(b.board.flat().every(c => c === null)).toBe(true)
    })
})
