import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { Cell, directionBetween, dominoFrom, neighbourOf, orderedPair } from '@/app/stores/placement'

/**
 * P1-1: one verb -- an anchor and a direction -- for pointer, tap and keyboard.
 *
 * What makes it one verb is that a drag, a tap and an arrow key all reduce to the same
 * pair before anything is placed. These tests exercise that reduction directly; the
 * browser-level questions (which pointer events fire, compatibility clicks, capture) are
 * in e2e/touch.spec.ts, because none of them are answerable in jsdom.
 */

const N = 6
let root: RootStore

const session = (rocks: [number, number][] = []) => {
    const board = Array.from({ length: N }, () => Array<number | null>(N).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: 'verb-test',
        board,
        boardHorizontalNumbers: '3,3,3,3,3,3',
        boardVerticalNumbers: '3,3,3,3,3,3',
    }), root)
}

/** A press and release on the same cell. */
const tap = (s: PuzzleSession, cell: Cell) => runInAction(() => {
    s.pointerDown(cell)
    return s.pointerUp(cell)
})

/** A press on `from`, released over `to`. */
const drag = (s: PuzzleSession, from: Cell, to: Cell) => runInAction(() => {
    s.pointerDown(from)
    s.setHover(to)
    return s.pointerUp(to)
})

/** Cells that are free all round, so every direction is legal from them. */
const OPEN: Cell = [2, 2]

beforeEach(() => { root = new RootStore() })

describe('the direction rules', () => {
    it('names the direction between adjacent cells, and nothing else', () => {
        expect(directionBetween([2, 2], [1, 2])).toBe('up')
        expect(directionBetween([2, 2], [3, 2])).toBe('down')
        expect(directionBetween([2, 2], [2, 1])).toBe('left')
        expect(directionBetween([2, 2], [2, 3])).toBe('right')

        expect(directionBetween([2, 2], [2, 2])).toBeNull()
        expect(directionBetween([2, 2], [3, 3])).toBeNull()  // diagonal
        expect(directionBetween([2, 2], [4, 2])).toBeNull()  // two away
    })

    it('gives each direction its own pip values', () => {
        // Not symmetric, and that is the point: a domino's halves are not interchangeable.
        expect(dominoFrom([2, 2], 'down').values).toEqual([1, 0])
        expect(dominoFrom([2, 2], 'up').values).toEqual([0, 1])
        expect(dominoFrom([2, 2], 'right').values).toEqual([0, 2])
        expect(dominoFrom([2, 2], 'left').values).toEqual([2, 0])
    })

    it('orders a pair for display without changing which cells it is', () => {
        expect(orderedPair([3, 2], [2, 2])).toEqual([[2, 2], [3, 2]])
        expect(orderedPair([2, 3], [2, 2])).toEqual([[2, 2], [2, 3]])
    })
})

describe('drag places in the direction dragged', () => {
    it('down', () => {
        const s = session()
        expect(drag(s, [2, 2], [3, 2])).toBe('placed')
        expect(s.board[2][2]).toBe(1)
        expect(s.board[3][2]).toBe(0)
    })

    it('up, which is a different placement from down', () => {
        const s = session()
        expect(drag(s, [2, 2], [1, 2])).toBe('placed')
        expect(s.board[1][2]).toBe(1)
        expect(s.board[2][2]).toBe(0)
    })

    it('right', () => {
        const s = session()
        expect(drag(s, [2, 2], [2, 3])).toBe('placed')
        expect(s.board[2][2]).toBe(0)
        expect(s.board[2][3]).toBe(2)
    })

    it('left', () => {
        const s = session()
        expect(drag(s, [2, 2], [2, 1])).toBe('placed')
        expect(s.board[2][1]).toBe(0)
        expect(s.board[2][2]).toBe(2)
    })

    it('does nothing when released on a diagonal or distant cell', () => {
        const s = session()
        expect(drag(s, [2, 2], [3, 3])).toBe('none')
        expect(drag(s, [2, 2], [5, 5])).toBe('none')
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })

    it('does nothing when released over a blocked neighbour', () => {
        const s = session([[3, 2]])
        expect(drag(s, [2, 2], [3, 2])).toBe('none')
        expect(s.board[2][2]).toBeNull()
    })

    it('does nothing when released outside the board', () => {
        const s = session()
        runInAction(() => { s.pointerDown([2, 2]) })
        expect(runInAction(() => s.pointerUp(null))).toBe('none')
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })
})

describe('tap', () => {
    it('places when exactly one direction is legal', () => {
        // A corner with its only other neighbour blocked: two edges, one rock, one way to
        // go. There is nothing to ask about, so the tap commits.
        const s = session([[1, 0]])
        expect(s.legalDirections([0, 0])).toEqual(['right'])

        expect(tap(s, [0, 0])).toBe('placed')
        expect(s.board[0][0]).toBe(0)
        expect(s.board[0][1]).toBe(2)
    })

    it('offers candidates when more than one direction is legal', () => {
        const s = session()
        expect(tap(s, OPEN)).toBe('candidates')

        expect(s.pendingAnchor).toEqual(OPEN)
        expect(s.candidateCells).toHaveLength(4)
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })

    it('commits on a second tap on one of the candidates', () => {
        const s = session()
        tap(s, OPEN)
        expect(tap(s, [3, 2])).toBe('placed')

        expect(s.board[2][2]).toBe(1)
        expect(s.board[3][2]).toBe(0)
        expect(s.pendingAnchor).toBeNull()
    })

    it('a second tap somewhere unrelated cancels instead of placing', () => {
        const s = session()
        tap(s, OPEN)
        const outcome = runInAction(() => {
            s.pointerDown([5, 5])
            return s.pointerUp([5, 5])
        })

        expect(outcome).toBe('candidates')  // [5,5] started its own ambiguous tap
        expect(s.pendingAnchor).toEqual([5, 5])
        expect(s.board[2][2]).toBeNull()
    })

    it('does nothing on a cell with no legal direction', () => {
        const s = session([[0, 1], [1, 0]])
        // (0,0) is boxed in by two rocks and two edges.
        expect(s.legalDirections([0, 0])).toEqual([])
        expect(tap(s, [0, 0])).toBe('none')
    })

    it('removes the domino under a tap on an occupied cell', () => {
        const s = session()
        drag(s, [2, 2], [3, 2])
        expect(tap(s, [2, 2])).toBe('removed')
        expect(s.board[2][2]).toBeNull()
        expect(s.board[3][2]).toBeNull()
    })

    it('removes from either half', () => {
        const s = session()
        drag(s, [2, 2], [3, 2])
        expect(tap(s, [3, 2])).toBe('removed')
        expect(s.board[2][2]).toBeNull()
        expect(s.board[3][2]).toBeNull()
    })

    it('does nothing on a rock', () => {
        const s = session([[1, 1]])
        expect(tap(s, [1, 1])).toBe('none')
        expect(s.board[1][1]).toBe(-1)
    })
})

describe('the pending anchor survives the press that completes it', () => {
    it('pressing a candidate does not re-anchor onto that candidate', () => {
        // The trap: `pointerdown` on the candidate would otherwise make *it* the anchor,
        // and the placement the player was offered would never happen.
        const s = session()
        tap(s, OPEN)

        runInAction(() => { s.pointerDown([3, 2]) })
        expect(s.pendingAnchor).toEqual(OPEN)

        expect(runInAction(() => s.pointerUp([3, 2]))).toBe('placed')
        expect(s.board[2][2]).toBe(1)
    })

    it('pressing a non-candidate starts a new gesture', () => {
        const s = session()
        tap(s, OPEN)
        runInAction(() => { s.pointerDown([5, 5]) })

        expect(s.pendingAnchor).toBeNull()
    })
})

describe('cancellation', () => {
    it('a cancelled gesture places nothing and leaves no state', () => {
        const s = session()
        runInAction(() => {
            s.pointerDown([2, 2])
            s.setHover([3, 2])
            s.cancelGesture()
        })

        expect(s.board.flat().every(c => c === null)).toBe(true)
        expect(s.hover).toBeNull()
        expect(s.pendingAnchor).toBeNull()
        expect(s.highlightedPair).toBeNull()
    })

    it('a release after a cancel does nothing', () => {
        const s = session()
        runInAction(() => {
            s.pointerDown([2, 2])
            s.cancelGesture()
        })

        expect(runInAction(() => s.pointerUp([3, 2]))).toBe('none')
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })

    it('reset clears any gesture in flight', () => {
        const s = session()
        tap(s, OPEN)
        runInAction(() => { s.reset() })

        expect(s.pendingAnchor).toBeNull()
        expect(s.gesture).toBeNull()
    })
})

describe('the preview', () => {
    it('follows the drag away from the anchor', () => {
        const s = session()
        runInAction(() => { s.pointerDown([2, 2]) })

        s.setHover([3, 2])
        expect(s.highlightedPair).toEqual([[2, 2], [3, 2]])

        s.setHover([2, 1])
        expect(s.highlightedPair).toEqual([[2, 1], [2, 2]])
    })

    it('shows nothing when the drag points somewhere illegal', () => {
        const s = session([[3, 2]])
        runInAction(() => { s.pointerDown([2, 2]) })
        s.setHover([3, 2])

        expect(s.highlightedPair).toBeNull()
    })

    it('previews a hovered cell only when one direction is legal', () => {
        const s = session([[0, 1], [2, 0]])
        // (1,0) can only go up: (0,0) is free, (2,0) is a rock, (1,1) is free...
        s.setHover([1, 0])
        const legal = s.legalDirections([1, 0])

        if (legal.length === 1) {
            expect(s.highlightedPair).toEqual(orderedPair([1, 0], neighbourOf([1, 0], legal[0])))
        } else {
            expect(s.highlightedPair).toBeNull()
        }
    })

    it('shows nothing while candidates are being offered', () => {
        const s = session()
        tap(s, OPEN)
        expect(s.highlightedPair).toBeNull()
    })
})
