import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { Cell } from '@/app/stores/placement'

/**
 * P1-1's keyboard half: the same verb, an anchor and a direction.
 *
 * Arrows move the focus until an anchor is set and choose the neighbour once one is, which
 * is the drag model with the pointer taken out. The state machine is the part worth
 * pinning down -- in particular that every transition leaves the focus somewhere
 * predictable, and that no mode is entered which Escape cannot leave.
 */

const N = 6
let root: RootStore

const session = (rocks: [number, number][] = []) => {
    const board = Array.from({ length: N }, () => Array<number | null>(N).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: 'keys-test',
        board,
        boardHorizontalNumbers: '3,3,3,3,3,3',
        boardVerticalNumbers: '3,3,3,3,3,3',
    }), root)
}

const press = (s: PuzzleSession, ...keys: string[]) =>
    runInAction(() => keys.map(key => s.handleKey(key)).pop()!)

const focusAt = (s: PuzzleSession, cell: Cell) => runInAction(() => { s.setFocusedCell(cell) })

beforeEach(() => { root = new RootStore() })

describe('entering the board', () => {
    it('the first key lands the focus without moving or placing', () => {
        const s = session()
        expect(press(s, 'ArrowDown')).toBe(true)

        expect(s.focusedCell).toEqual([0, 0])
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })

    it('an unhandled key is reported as unhandled, so the page keeps it', () => {
        const s = session()
        focusAt(s, [2, 2])
        expect(press(s, 'Tab')).toBe(false)
        expect(press(s, 'a')).toBe(false)
    })
})

describe('arrows move the focus while there is no anchor', () => {
    it('in all four directions', () => {
        const s = session()
        focusAt(s, [2, 2])

        press(s, 'ArrowUp')
        expect(s.focusedCell).toEqual([1, 2])
        press(s, 'ArrowDown', 'ArrowDown')
        expect(s.focusedCell).toEqual([3, 2])
        press(s, 'ArrowLeft')
        expect(s.focusedCell).toEqual([3, 1])
        press(s, 'ArrowRight', 'ArrowRight')
        expect(s.focusedCell).toEqual([3, 3])
    })

    it('stops at the edge rather than wrapping or leaving the board', () => {
        const s = session()
        focusAt(s, [0, 0])

        press(s, 'ArrowUp', 'ArrowLeft')
        expect(s.focusedCell).toEqual([0, 0])

        focusAt(s, [N - 1, N - 1])
        press(s, 'ArrowDown', 'ArrowRight')
        expect(s.focusedCell).toEqual([N - 1, N - 1])
    })

    it('moves over occupied cells, which are still targets for removal', () => {
        const s = session([[2, 3]])
        focusAt(s, [2, 2])
        press(s, 'ArrowRight')
        expect(s.focusedCell).toEqual([2, 3])
    })
})

describe('Space or Enter sets the anchor, then an arrow places', () => {
    for (const key of [' ', 'Enter']) {
        it(`${key === ' ' ? 'Space' : 'Enter'} offers the candidates`, () => {
            const s = session()
            focusAt(s, [2, 2])
            expect(press(s, key)).toBe(true)

            expect(s.pendingAnchor).toEqual([2, 2])
            expect(s.candidateCells).toHaveLength(4)
        })
    }

    it('the arrow after the anchor commits the placement in that direction', () => {
        const s = session()
        focusAt(s, [2, 2])
        press(s, ' ', 'ArrowDown')

        expect(s.board[2][2]).toBe(1)
        expect(s.board[3][2]).toBe(0)
        expect(s.pendingAnchor).toBeNull()
    })

    it('each direction places its own domino', () => {
        const cases: [string, Cell, number][] = [
            ['ArrowUp', [1, 2], 1],
            ['ArrowDown', [3, 2], 0],
            ['ArrowLeft', [2, 1], 0],
            ['ArrowRight', [2, 3], 2],
        ]
        for (const [key, cell, value] of cases) {
            const s = session()
            focusAt(s, [2, 2])
            press(s, ' ', key)
            expect(s.board[cell[0]][cell[1]], key).toBe(value)
        }
    })

    it('focus stays on the anchor after placing', () => {
        const s = session()
        focusAt(s, [2, 2])
        press(s, ' ', 'ArrowDown')

        expect(s.focusedCell).toEqual([2, 2])
    })

    it('Space on a cell with one legal direction places immediately', () => {
        const s = session([[1, 0]])
        focusAt(s, [0, 0])
        press(s, ' ')

        expect(s.board[0][0]).toBe(0)
        expect(s.board[0][1]).toBe(2)
        expect(s.pendingAnchor).toBeNull()
    })

    it('a refused direction keeps the anchor instead of choosing another', () => {
        // The complaint against the old rule was the silent fall-through. Asking for a
        // direction that does not fit leaves the anchor set and the board untouched.
        const s = session([[3, 2]])
        focusAt(s, [2, 2])
        press(s, ' ')
        expect(press(s, 'ArrowDown')).toBe(true)

        expect(s.board[2][2]).toBeNull()
        expect(s.board[1][2]).toBeNull()
        expect(s.pendingAnchor).toEqual([2, 2])
    })
})

describe('Escape leaves every mode it can enter', () => {
    it('clears a pending anchor', () => {
        const s = session()
        focusAt(s, [2, 2])
        press(s, ' ')
        expect(s.pendingAnchor).toEqual([2, 2])

        expect(press(s, 'Escape')).toBe(true)
        expect(s.pendingAnchor).toBeNull()
        expect(s.candidateCells).toEqual([])
    })

    it('keeps the focus where it was', () => {
        const s = session()
        focusAt(s, [2, 2])
        press(s, ' ', 'Escape')
        expect(s.focusedCell).toEqual([2, 2])
    })

    it('is reported as unhandled when there is nothing to leave', () => {
        // So the page keeps Escape for whatever else might want it.
        const s = session()
        focusAt(s, [2, 2])
        expect(press(s, 'Escape')).toBe(false)
    })

    it('arrows move the focus again afterwards', () => {
        const s = session()
        focusAt(s, [2, 2])
        press(s, ' ', 'Escape', 'ArrowDown')

        expect(s.focusedCell).toEqual([3, 2])
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })
})

describe('Delete and Backspace remove', () => {
    for (const key of ['Delete', 'Backspace']) {
        it(`${key} removes the domino on the focused cell`, () => {
            const s = session()
            runInAction(() => { s.placeToward([2, 2], 'down') })
            focusAt(s, [2, 2])

            expect(press(s, key)).toBe(true)
            expect(s.board[2][2]).toBeNull()
            expect(s.board[3][2]).toBeNull()
        })
    }

    it('removes from the other half too, and moves focus to the anchor', () => {
        const s = session()
        runInAction(() => { s.placeToward([2, 2], 'down') })
        focusAt(s, [3, 2])
        press(s, 'Delete')

        expect(s.board[2][2]).toBeNull()
        // Focus follows the removal to the pair's anchor rather than staying on a half
        // that no longer means anything.
        expect(s.focusedCell).toEqual([2, 2])
    })

    it('is unhandled on an empty cell', () => {
        const s = session()
        focusAt(s, [2, 2])
        expect(press(s, 'Delete')).toBe(false)
    })

    it('is unhandled on a rock', () => {
        const s = session([[1, 1]])
        focusAt(s, [1, 1])
        expect(press(s, 'Delete')).toBe(false)
        expect(s.board[1][1]).toBe(-1)
    })
})

describe('the keyboard and the pointer are the same verb', () => {
    it('reach the same board state', () => {
        const byKeyboard = session()
        focusAt(byKeyboard, [2, 2])
        press(byKeyboard, ' ', 'ArrowRight')

        const byPointer = session()
        runInAction(() => {
            byPointer.pointerDown([2, 2])
            byPointer.setHover([2, 3])
            byPointer.pointerUp([2, 3])
        })

        expect(byKeyboard.board).toEqual(byPointer.board)
    })

    it('share the pending anchor, so a tap can be finished from the keyboard', () => {
        const s = session()
        runInAction(() => {
            s.pointerDown([2, 2])
            s.pointerUp([2, 2])
        })
        expect(s.pendingAnchor).toEqual([2, 2])

        press(s, 'ArrowDown')
        expect(s.board[2][2]).toBe(1)
        expect(s.board[3][2]).toBe(0)
    })
})
