import { describe, it, expect, beforeEach } from 'vitest'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'

/**
 * P0-7: removePiece resolves the complete pair before mutating anything.
 *
 * This is load-bearing for the D6 invariant. Every 1 must have a 0 below it and every 2 a 0
 * to its left; a half-removal leaves an orphan, and orphans are the only route by which a
 * board whose sums match can still have empty cells. So every rejection must be total --
 * no partial mutation, ever.
 */

const N = 6
let root: RootStore

const session = (rocks: [number, number][] = []) => {
    const board = Array.from({ length: N }, () => Array<number | null>(N).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: 'rm-test',
        board,
        boardHorizontalNumbers: '3,3,3,3,3,3',
        boardVerticalNumbers: '3,3,3,3,3,3',
    }, 'rm-test'), root)
}

/** Place a vertical domino with its top at (i,j): 1 above, 0 below. */
const vertical = (s: PuzzleSession, i: number, j: number) => {
    s.board[i][j] = 1; s.board[i + 1][j] = 0
}
/** Place a horizontal domino with its right half at (i,j): 0 left, 2 right. */
const horizontal = (s: PuzzleSession, i: number, j: number) => {
    s.board[i][j - 1] = 0; s.board[i][j] = 2
}

const snapshot = (s: PuzzleSession) => JSON.stringify(s.board)
const isEmpty = (s: PuzzleSession) => s.board.flat().every(c => c === null)

/** Every 1 has a 0 below and every 2 a 0 to its left (spec D6). */
const assertPaired = (s: PuzzleSession) => {
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            if (s.board[i][j] === 1) expect(s.board[i + 1]?.[j], `1 at ${i},${j}`).toBe(0)
            if (s.board[i][j] === 2) expect(s.board[i]?.[j - 1], `2 at ${i},${j}`).toBe(0)
            if (s.board[i][j] === 0) {
                const owners = [s.board[i - 1]?.[j] === 1, s.board[i]?.[j + 1] === 2]
                expect(owners.filter(Boolean).length, `0 at ${i},${j} owners`).toBe(1)
            }
        }
    }
}

beforeEach(() => { root = new RootStore() })

describe('removing from either half', () => {
    it('removes a vertical domino from its 1 (top) half', () => {
        const s = session(); vertical(s, 2, 2)
        expect(s.removePiece(2, 2)).toBe(true)
        expect(isEmpty(s)).toBe(true)
    })

    it('removes a vertical domino from its 0 (bottom) half', () => {
        const s = session(); vertical(s, 2, 2)
        expect(s.removePiece(3, 2)).toBe(true)
        expect(isEmpty(s)).toBe(true)
    })

    it('removes a horizontal domino from its 2 (right) half', () => {
        const s = session(); horizontal(s, 2, 3)
        expect(s.removePiece(2, 3)).toBe(true)
        expect(isEmpty(s)).toBe(true)
    })

    it('removes a horizontal domino from its 0 (left) half', () => {
        const s = session(); horizontal(s, 2, 3)
        expect(s.removePiece(2, 2)).toBe(true)
        expect(isEmpty(s)).toBe(true)
    })
})

describe('edges', () => {
    it('removes a vertical domino at the top edge from both halves', () => {
        for (const [ri, rj] of [[0, 0], [1, 0]] as const) {
            const s = session(); vertical(s, 0, 0)
            expect(s.removePiece(ri, rj)).toBe(true)
            expect(isEmpty(s)).toBe(true)
        }
    })

    it('removes a vertical domino at the bottom edge from both halves', () => {
        for (const [ri, rj] of [[N - 2, N - 1], [N - 1, N - 1]] as const) {
            const s = session(); vertical(s, N - 2, N - 1)
            expect(s.removePiece(ri, rj)).toBe(true)
            expect(isEmpty(s)).toBe(true)
        }
    })

    it('removes a horizontal domino at the left edge from both halves', () => {
        for (const [ri, rj] of [[0, 0], [0, 1]] as const) {
            const s = session(); horizontal(s, 0, 1)
            expect(s.removePiece(ri, rj)).toBe(true)
            expect(isEmpty(s)).toBe(true)
        }
    })

    it('removes a horizontal domino at the right edge from both halves', () => {
        for (const [ri, rj] of [[N - 1, N - 2], [N - 1, N - 1]] as const) {
            const s = session(); horizontal(s, N - 1, N - 1)
            expect(s.removePiece(ri, rj)).toBe(true)
            expect(isEmpty(s)).toBe(true)
        }
    })

    it('never writes to a negative index for a 2 in column 0', () => {
        // The old implementation did `board[i][j - 1] = null` unguarded, which for j === 0
        // wrote to board[i][-1] -- an array string property, silently corrupting nothing
        // visible while poisoning flat()/every() semantics.
        const s = session()
        s.board[0][0] = 2 // orphaned 2 with no cell to its left
        expect(s.removePiece(0, 0)).toBe(false)
        expect(Object.keys(s.board[0])).not.toContain('-1')
        expect(s.board[0][0]).toBe(2)
    })

    it('never reads past the last row for a 1 in the bottom row', () => {
        const s = session()
        s.board[N - 1][0] = 1 // orphaned 1 with no cell below
        expect(() => s.removePiece(N - 1, 0)).not.toThrow()
        expect(s.removePiece(N - 1, 0)).toBe(false)
        expect(s.board[N - 1][0]).toBe(1)
    })
})

describe('rejections leave the board untouched', () => {
    it('rejects an empty cell', () => {
        const s = session(); vertical(s, 2, 2)
        const before = snapshot(s)
        expect(s.removePiece(0, 0)).toBe(false)
        expect(snapshot(s)).toBe(before)
    })

    it('rejects a rock', () => {
        const s = session([[1, 1]]); vertical(s, 3, 3)
        const before = snapshot(s)
        expect(s.removePiece(1, 1)).toBe(false)
        expect(snapshot(s)).toBe(before)
        expect(s.board[1][1]).toBe(-1)
    })

    it.each([
        ['negative row', -1, 0],
        ['negative col', 0, -1],
        ['row past end', N, 0],
        ['col past end', 0, N],
        ['far out of range', 999, 999],
        ['non-integer', 1.5, 2],
    ])('rejects out-of-range coordinates: %s', (_label, i, j) => {
        const s = session(); vertical(s, 2, 2)
        const before = snapshot(s)
        expect(() => s.removePiece(i, j)).not.toThrow()
        expect(s.removePiece(i, j)).toBe(false)
        expect(snapshot(s)).toBe(before)
    })

    it('rejects an unknown cell value', () => {
        const s = session()
        s.board[2][2] = 7
        const before = snapshot(s)
        expect(s.removePiece(2, 2)).toBe(false)
        expect(snapshot(s)).toBe(before)
    })
})

describe('orphans and corruption are refused, not guessed', () => {
    it('rejects an orphaned 1 with no 0 below', () => {
        const s = session()
        s.board[2][2] = 1
        const before = snapshot(s)
        expect(s.removePiece(2, 2)).toBe(false)
        expect(snapshot(s)).toBe(before)
    })

    it('rejects an orphaned 2 with no 0 to its left', () => {
        const s = session()
        s.board[2][2] = 2
        const before = snapshot(s)
        expect(s.removePiece(2, 2)).toBe(false)
        expect(snapshot(s)).toBe(before)
    })

    it('rejects an orphaned 0 with no owner', () => {
        const s = session()
        s.board[2][2] = 0
        const before = snapshot(s)
        expect(s.removePiece(2, 2)).toBe(false)
        expect(snapshot(s)).toBe(before)
    })

    it('rejects an ambiguous 0 owned by both a 1 above and a 2 to the right', () => {
        // Corrupt by construction: the 0 at (2,2) could belong to either domino.
        const s = session()
        s.board[1][2] = 1   // claims (2,2) as its lower half
        s.board[2][2] = 0
        s.board[2][3] = 2   // claims (2,2) as its left half
        const before = snapshot(s)

        expect(s.removePiece(2, 2)).toBe(false)
        expect(snapshot(s)).toBe(before)
    })

    it('rejects a 1 whose cell below holds another piece rather than its 0', () => {
        const s = session()
        s.board[2][2] = 1
        s.board[3][2] = 1
        const before = snapshot(s)
        expect(s.removePiece(2, 2)).toBe(false)
        expect(snapshot(s)).toBe(before)
    })

    it('rejects a 1 sitting directly above a rock', () => {
        const s = session([[3, 2]])
        s.board[2][2] = 1
        const before = snapshot(s)
        expect(s.removePiece(2, 2)).toBe(false)
        expect(snapshot(s)).toBe(before)
    })
})

describe('the pairing invariant survives removal', () => {
    it('holds after removing each piece of a crowded board, from either half', () => {
        const build = () => {
            const s = session()
            vertical(s, 0, 0)
            vertical(s, 2, 0)
            horizontal(s, 0, 2)
            horizontal(s, 1, 4)
            vertical(s, 3, 3)
            return s
        }
        // Removing from the anchor and from the other half must both be clean.
        for (const [i, j] of [[0, 0], [1, 0], [0, 2], [0, 1], [3, 3], [4, 3]] as const) {
            const s = build()
            expect(s.removePiece(i, j)).toBe(true)
            assertPaired(s)
        }
    })

    it('leaves an empty board after every piece is removed', () => {
        const s = session()
        vertical(s, 0, 0)
        horizontal(s, 2, 3)
        vertical(s, 4, 4)

        expect(s.removePiece(1, 0)).toBe(true)   // bottom half
        expect(s.removePiece(2, 2)).toBe(true)   // left half
        expect(s.removePiece(4, 4)).toBe(true)   // anchor
        expect(isEmpty(s)).toBe(true)
    })

    it('is idempotent: removing the same piece twice is a no-op the second time', () => {
        const s = session(); vertical(s, 2, 2)
        expect(s.removePiece(2, 2)).toBe(true)
        expect(s.removePiece(2, 2)).toBe(false)
        expect(isEmpty(s)).toBe(true)
    })
})
