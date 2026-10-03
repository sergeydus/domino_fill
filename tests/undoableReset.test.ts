import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession, MAX_UNDO } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { stepsBackToSolvable, MAX_PROBES } from '@/app/stores/advice'
import type { Cell } from '@/app/stores/placement'

/**
 * Undoable Reset (Controls 1; its contract in NEXT-STEPS, under Controls).
 *
 * Reset used to empty the undo history along with the board, so one misclick lost a nearly
 * finished board for good. Now it is one entry in that history: Undo puts the board back,
 * and the moves before it stay undoable. The browser half -- the buttons, focus, the card,
 * the win not replayed, a reload -- is e2e/undo.spec.ts.
 */

const N = 6
let root: RootStore

const session = (rocks: Cell[] = []) => {
    const board = Array.from({ length: N }, () => Array<number | null>(N).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: 'reset-test',
        board,
        boardHorizontalNumbers: '3,3,3,3,3,3',
        boardVerticalNumbers: '3,3,3,3,3,3',
    }), root)
}

/** A 2x2 solved by one upright domino in its left column: the right column is rock. */
const solvable = () => {
    const board = [[null, -1], [null, -1]] as (number | null)[][]
    return new PuzzleSession(definitionFrom({
        puzzleId: 'reset-win', board, boardHorizontalNumbers: '1,0', boardVerticalNumbers: '1,0',
    }), root)
}

const act = <T,>(fn: () => T): T => runInAction(fn)
const board = (s: PuzzleSession) => JSON.stringify(s.board)

beforeEach(() => { root = new RootStore() })

describe('Reset is one entry in the undo history', () => {
    it('Undo straight after Reset puts every piece back, exactly', () => {
        const s = session([[1, 1]])
        act(() => { s.placeToward([2, 2], 'down'); s.placeToward([0, 2], 'right'); s.placeToward([4, 4], 'up') })
        const played = board(s)

        act(() => { s.reset() })
        expect(s.canUndo).toBe(true)
        expect(act(() => s.undo())).toBe(true)

        expect(board(s)).toBe(played)
        expect(s.pairAt(2, 2)).not.toBeNull()
    })

    it('Reset, Undo, Undo: the Reset, then the move before it (codex)', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down') })
        const one = board(s)
        act(() => { s.placeToward([0, 0], 'right') })
        const two = board(s)

        act(() => { s.reset() })
        act(() => { s.undo() })
        expect(board(s)).toBe(two)
        act(() => { s.undo() })
        expect(board(s)).toBe(one)
    })

    it('Reset, a move, Undo, Undo: the move, then the Reset (codex)', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down') })
        const played = board(s)
        act(() => { s.reset() })
        const cleared = board(s)
        act(() => { s.placeToward([0, 0], 'right') })

        act(() => { s.undo() })
        expect(board(s)).toBe(cleared)
        act(() => { s.undo() })
        expect(board(s)).toBe(played)
    })

    it('holds exactly the squares Reset changed, with what was in them, and never a rock', () => {
        const s = session([[1, 1], [5, 5]])
        act(() => { s.placeToward([2, 2], 'down'); s.placeToward([0, 0], 'right') })
        act(() => { s.reset() })
        const entry = s.moves.at(-1)!
        const changed = entry.cells.map(([i, j], n) => `${i},${j}=${entry.before[n]}`).sort()
        expect(changed).toEqual(['0,0=0', '0,1=2', '2,2=1', '3,2=0'])
    })

    it('counts as one entry towards the bound, however many squares it clears', () => {
        const s = session()
        act(() => { s.placeToward([0, 0], 'down'); s.placeToward([0, 1], 'down'); s.placeToward([0, 2], 'down') })
        const before = s.moves.length
        act(() => { s.reset() })
        expect(s.moves.length).toBe(before + 1)
        // And with the history full, a Reset pushes the oldest entry out, as any move does.
        act(() => {
            for (let n = 0; n < MAX_UNDO; n++) {
                s.placeToward([4, 0], 'right')
                s.removePiece(4, 0)
            }
        })
        expect(s.moves.length).toBe(MAX_UNDO)
        act(() => { s.placeToward([4, 0], 'right'); s.reset() })
        expect(s.moves.length).toBe(MAX_UNDO)
        // The newest entry is the Reset of the one flat piece on the board, holding its values
        // (a placement's entry would hold two blanks).
        expect([...s.moves.at(-1)!.before].sort()).toEqual([0, 2])
    })
})

describe('a Reset that changes nothing records nothing, and still does the rest (codex)', () => {
    it('leaves the history as it is', () => {
        const s = session([[1, 1]])
        act(() => { s.reset() })
        expect(s.moves).toEqual([])
        expect(s.canUndo).toBe(false)

        // After a move and its undo the board is empty again: still nothing to record.
        act(() => { s.placeToward([2, 2], 'down'); s.undo() })
        act(() => { s.reset() })
        expect(s.moves).toEqual([])
    })

    it('still clears the gesture, the hover, the refusal, the answer and the cursor', () => {
        const s = session([[1, 1]])
        act(() => { s.pointerDown([1, 1]); s.pointerUp([1, 1]) })   // a refusal on the rock
        expect(s.refusal).not.toBeNull()
        act(() => { s.check() })
        act(() => { s.pointerDown([1, 1]); s.pointerUp([1, 1]) })
        act(() => { s.pointerDown([3, 3]) })                         // a drag in progress
        s.setHover([3, 3])
        act(() => { s.setFocusedCell([4, 4]) })
        expect([s.advice, s.gesture, s.hover, s.focusedCell].every(v => v !== null)).toBe(true)

        act(() => { s.reset() })

        expect([s.refusal, s.advice, s.gesture, s.hover, s.focusedCell]).toEqual([null, null, null, null, null])
    })
})

describe('the keyboard\'s square across a Reset and its undo (codex)', () => {
    it('Reset clears it; undoing the Reset puts it back where it was', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down'); s.setFocusedCell([4, 1]) })
        act(() => { s.reset() })
        expect(s.focusedCell).toBeNull()
        act(() => { s.undo() })
        expect(s.focusedCell).toEqual([4, 1])
    })

    it('with no square remembered, undoing leaves the current one, so the next arrow moves', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down') })
        act(() => { s.reset() })
        // Focus comes back to the board on a square: Tab, which sets the keyboard's square.
        act(() => { s.setFocusedCell([3, 3]) })
        act(() => { expect(s.handleKey('z', { ctrl: true })).toBe(true) })
        expect(s.focusedCell).toEqual([3, 3])
        act(() => { s.handleKey('ArrowRight') })
        expect(s.focusedCell).toEqual([3, 4])
    })

    it('an ordinary move\'s undo still moves the square to its anchor', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down'); s.setFocusedCell([5, 5]) })
        act(() => { s.undo() })
        expect(s.focusedCell).toEqual([2, 2])
    })
})

describe('Play again is the same Reset, so it is undoable too', () => {
    it('Undo after Play again brings the solved board back, flagged solved', () => {
        const s = solvable()
        act(() => { s.placeToward([0, 0], 'down'); s.setCompleted(true) })
        const solved = board(s)

        act(() => { s.reset() })
        expect(s.completed).toBe(false)
        act(() => { s.undo() })

        expect(board(s)).toBe(solved)
        expect(s.completed).toBe(true)
    })
})

describe('Check across a Reset', () => {
    /** A 2x2 with no rocks whose only completion is two uprights (as tests/adviceSession's). */
    const pair = () => new PuzzleSession(definitionFrom({
        puzzleId: 'reset-pair',
        board: [[null, null], [null, null]] as (number | null)[][],
        boardHorizontalNumbers: '1,1',
        boardVerticalNumbers: '2,0',
    }), root)

    /** A solved board, Reset, then a flat piece across the top row: unfinishable. */
    const wrongAfterReset = () => {
        const s = pair()
        act(() => { s.placeToward([0, 0], 'down'); s.placeToward([0, 1], 'down'); s.reset() })
        act(() => { s.placeToward([0, 0], 'right') })
        return s
    }

    it('stops at the empty board just after the Reset, so the Reset is never counted', () => {
        const s = wrongAfterReset()
        expect(act(() => s.check())).toMatchObject({ kind: 'wrong', undoSteps: 1 })
    })

    it('answers null when its budget runs out first, and spends no more than it was given', () => {
        const s = wrongAfterReset()
        expect(stepsBackToSolvable(s.definition, s.board, s.moves, 0)).toEqual({ steps: null, nodes: 0 })
    })

    it('answers null when its probes run out first, and never reaches the Reset', () => {
        const s = wrongAfterReset()
        // Every position after the flat piece is unfinishable: a second flat piece placed and
        // taken away on the bottom row, more times than the walk may probe.
        act(() => {
            for (let n = 0; n < MAX_PROBES; n++) { s.placeToward([1, 0], 'right'); s.removePiece(1, 0) }
        })
        expect(act(() => s.check())).toMatchObject({ kind: 'wrong', undoSteps: null })
    })
})
