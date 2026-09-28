import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession, MAX_UNDO } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'

/**
 * Undo and reset (spec P1-3). The round-trip tests P0-10 deferred to this row.
 *
 * The property that matters is exactness: undoing a move must leave the board *identical*
 * to what it was, not merely plausible. A domino's cell values encode which half of which
 * orientation each cell is, so a re-derived restoration can be subtly wrong in a way that
 * only shows up later, when `pairAt` can no longer resolve the piece.
 */

const N = 6
let root: RootStore

const session = (rocks: [number, number][] = []) => {
    const board = Array.from({ length: N }, () => Array<number | null>(N).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: 'undo-test',
        board,
        boardHorizontalNumbers: '3,3,3,3,3,3',
        boardVerticalNumbers: '3,3,3,3,3,3',
    }), root)
}

const snapshot = (s: PuzzleSession) => JSON.stringify(s.board)
const act = <T,>(fn: () => T): T => runInAction(fn)

beforeEach(() => { root = new RootStore() })

describe('a move and its undo are a round trip', () => {
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
        it(`placing ${direction} and undoing restores the board exactly`, () => {
            const s = session()
            const before = snapshot(s)

            act(() => { s.placeToward([2, 2], direction) })
            expect(snapshot(s)).not.toBe(before)

            expect(act(() => s.undo())).toBe(true)
            expect(snapshot(s)).toBe(before)
        })
    }

    it('removing and undoing gives back the same domino, not a re-derived one', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'right') })
        const placed = snapshot(s)

        act(() => { s.removePiece(2, 2) })
        act(() => { s.undo() })

        expect(snapshot(s)).toBe(placed)
        // And the restored pair still resolves, which is the thing a wrong restoration
        // would break: the values say which half of which orientation each cell is.
        expect(s.pairAt(2, 2)).not.toBeNull()
    })

    it('a whole sequence unwinds in reverse order', () => {
        const s = session()
        const states = [snapshot(s)]

        act(() => { s.placeToward([0, 0], 'right') })
        states.push(snapshot(s))
        act(() => { s.placeToward([2, 2], 'down') })
        states.push(snapshot(s))
        act(() => { s.removePiece(0, 0) })
        states.push(snapshot(s))

        for (let i = states.length - 1; i > 0; i--) {
            expect(snapshot(s)).toBe(states[i])
            expect(act(() => s.undo())).toBe(true)
        }
        expect(snapshot(s)).toBe(states[0])
    })
})

describe('the stack', () => {
    it('reports whether there is anything to undo', () => {
        const s = session()
        expect(s.canUndo).toBe(false)

        act(() => { s.placeToward([2, 2], 'down') })
        expect(s.canUndo).toBe(true)

        act(() => { s.undo() })
        expect(s.canUndo).toBe(false)
    })

    it('undoing with nothing to undo is refused and changes nothing', () => {
        const s = session()
        const before = snapshot(s)

        expect(act(() => s.undo())).toBe(false)
        expect(snapshot(s)).toBe(before)
    })

    it('records nothing for a refused placement', () => {
        // A move that did not happen must not be undoable, or undo would write a domino
        // into cells the player never filled.
        const s = session([[3, 2]])
        expect(act(() => s.placeToward([2, 2], 'down'))).toBe(false)
        expect(s.canUndo).toBe(false)
    })

    it('records nothing for a refused removal', () => {
        const s = session()
        expect(act(() => s.removePiece(2, 2))).toBe(false)
        expect(s.canUndo).toBe(false)
    })

    it('is bounded, dropping the oldest move', () => {
        // Sessions live as long as the page, so an unbounded stack grows with play.
        const s = session()
        let placed = 0
        act(() => {
            // Place and remove the same domino repeatedly: cheap, and every operation is a
            // recorded move.
            while (placed < MAX_UNDO + 10) {
                s.placeToward([0, 0], 'right')
                s.removePiece(0, 0)
                placed += 2
            }
        })

        expect(s.moves.length).toBe(MAX_UNDO)
    })

    it('undo does not push, so there is no redo', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down') })
        act(() => { s.undo() })

        expect(s.canUndo).toBe(false)
        expect(s.moves).toHaveLength(0)
    })
})

describe('undo and the rest of the session', () => {
    it('moves focus to the affected anchor', () => {
        // The spec's focus rule: after removing or undoing, focus lands on the anchor of
        // the pair that changed.
        const s = session()
        act(() => { s.placeToward([2, 2], 'down') })
        act(() => { s.setFocusedCell([5, 5]) })

        act(() => { s.undo() })
        expect(s.focusedCell).toEqual([2, 2])
    })

    it('abandons a gesture aimed at the board as it was', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down') })
        act(() => { s.pointerDown([4, 4]) })
        expect(s.gesture).not.toBeNull()

        act(() => { s.undo() })
        expect(s.gesture).toBeNull()
    })

    it('never resurrects a rock', () => {
        const s = session([[1, 1]])
        act(() => { s.placeToward([2, 2], 'down') })
        act(() => { s.undo() })

        expect(s.board[1][1]).toBe(-1)
        expect(s.board.flat().filter(c => c === -1)).toHaveLength(1)
    })
})

describe('undo un-sticks a completed board', () => {
    /*
     * D10-h: `completed` sets `pointerEvents: none`, and the completion reaction only ever
     * sets it *true*. Without recomputing here, undoing the winning move would leave the
     * board flagged solved and refusing input -- a soft-lock reached by the very action
     * meant to escape one.
     */
    const solvable = () => {
        // A 2x2 with one vertical domino's worth of room: columns sum 1 and 0, rows 1 and 0.
        const board = Array.from({ length: 2 }, () => Array<number | null>(2).fill(null))
        board[0][1] = -1
        board[1][1] = -1
        return new PuzzleSession(definitionFrom({
            puzzleId: 'undo-win',
            board,
            boardHorizontalNumbers: '1,0',
            boardVerticalNumbers: '1,0',
        }), root)
    }

    it('clears `completed` when the board stops being solved', () => {
        const s = solvable()
        act(() => { s.placeToward([0, 0], 'down') })
        expect(s.completedByRules).toBe(true)
        act(() => { s.setCompleted(true) })

        act(() => { s.undo() })

        expect(s.completedByRules).toBe(false)
        expect(s.completed).toBe(false)
    })

    it('a refused undo leaves the flag alone', () => {
        // The recompute happens only when a move is actually reversed, so an undo with an
        // empty stack must not clear a legitimately won board.
        const s = solvable()
        act(() => { s.placeToward([0, 0], 'down') })
        act(() => { s.setCompleted(true) })
        act(() => { s.moves.length = 0 })

        expect(act(() => s.undo())).toBe(false)
        expect(s.completed).toBe(true)
    })
})

describe('reset', () => {
    it('returns the board to its definition', () => {
        const s = session([[1, 1]])
        const before = snapshot(s)

        act(() => { s.placeToward([2, 2], 'down') })
        act(() => { s.placeToward([0, 0], 'right') })
        act(() => { s.reset() })

        expect(snapshot(s)).toBe(before)
        expect(s.board[1][1]).toBe(-1)
    })

    it('clears the move stack, so undo cannot write into a cleared board', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down') })
        act(() => { s.reset() })

        expect(s.canUndo).toBe(false)
        expect(act(() => s.undo())).toBe(false)
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })

    it('clears the completed flag, which is the soft-lock escape hatch', () => {
        const s = session()
        act(() => { s.setCompleted(true) })
        act(() => { s.reset() })
        expect(s.completed).toBe(false)
    })

    it('clears hover, gesture and focus', () => {
        const s = session()
        act(() => { s.pointerDown([2, 2]) })
        s.setHover([2, 2])
        act(() => { s.setFocusedCell([3, 3]) })

        act(() => { s.reset() })

        expect(s.hover).toBeNull()
        expect(s.gesture).toBeNull()
        expect(s.focusedCell).toBeNull()
    })
})
