import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'

/**
 * Saying no out loud (spec P1-5).
 *
 * A rejected placement did nothing at all: no sound, no movement, no message. The player
 * could not tell a refused move from a missed tap, which is the difference between "the
 * rules stopped me" and "this thing is broken".
 *
 * The signal is a counter rather than a flag because two refusals in a row are two events.
 * A view watching only the outcome would respond to the first and sit still through the
 * second -- which is precisely when a player is jabbing at the board wondering why nothing
 * is happening.
 */

const N = 6
let root: RootStore

const session = (rocks: [number, number][] = []) => {
    const board = Array.from({ length: N }, () => Array<number | null>(N).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: 'reject-test',
        board,
        boardHorizontalNumbers: '3,3,3,3,3,3',
        boardVerticalNumbers: '3,3,3,3,3,3',
    }), root)
}

const act = <T,>(fn: () => T): T => runInAction(fn)

beforeEach(() => { root = new RootStore() })

describe('a refused move is reported', () => {
    it('dragging onto an occupied neighbour is a rejection', () => {
        const s = session()
        act(() => { s.placeToward([3, 2], 'down') })
        const before = s.outcomeTick

        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp([3, 2])   // occupied
        })

        expect(s.lastOutcome).toBe('none')
        expect(s.outcomeTick).toBe(before + 1)
    })

    it('tapping a boxed-in cell is a rejection', () => {
        const s = session([[1, 2], [3, 2], [2, 1], [2, 3]])
        const before = s.outcomeTick

        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp([2, 2])
        })

        expect(s.lastOutcome).toBe('none')
        expect(s.outcomeTick).toBe(before + 1)
    })

    it('a refused arrow key is a rejection too, so the keyboard is not silent', () => {
        const s = session([[3, 2]])
        act(() => { s.setFocusedCell([2, 2]) })
        act(() => { s.handleKey(' ') })
        const before = s.outcomeTick

        act(() => { s.handleKey('ArrowDown') })   // blocked

        expect(s.lastOutcome).toBe('none')
        expect(s.outcomeTick).toBe(before + 1)
    })

    it('Delete on a rock is a rejection', () => {
        const s = session([[1, 1]])
        act(() => { s.setFocusedCell([1, 1]) })
        const before = s.outcomeTick

        act(() => { s.handleKey('Delete') })

        expect(s.lastOutcome).toBe('none')
        expect(s.outcomeTick).toBe(before + 1)
    })

    it('every refusal is its own event, so repeated jabs keep responding', () => {
        const s = session([[1, 2], [3, 2], [2, 1], [2, 3]])
        const ticks: number[] = []

        for (let n = 0; n < 3; n++) {
            act(() => {
                s.pointerDown([2, 2])
                s.pointerUp([2, 2])
            })
            ticks.push(s.outcomeTick)
        }

        expect(new Set(ticks).size).toBe(3)
        expect(ticks[2] - ticks[0]).toBe(2)
    })
})

describe('what is not a rejection', () => {
    it('a successful placement', () => {
        const s = session()
        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp([3, 2])
        })
        expect(s.lastOutcome).toBe('placed')
    })

    it('a successful removal', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down') })
        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp([2, 2])
        })
        expect(s.lastOutcome).toBe('removed')
    })

    it('offering candidates', () => {
        const s = session()
        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp([2, 2])
        })
        expect(s.lastOutcome).toBe('candidates')
    })

    it('releasing off the board is the pointer leaving, not a refused move', () => {
        // It must not shake: the player has not asked for anything the rules denied.
        const s = session()
        const before = s.outcomeTick

        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp(null)
        })

        expect(s.outcomeTick).toBe(before)
    })

    it('moving the focus with an arrow key', () => {
        const s = session()
        act(() => { s.setFocusedCell([2, 2]) })
        const before = s.outcomeTick

        act(() => { s.handleKey('ArrowDown') })

        expect(s.focusedCell).toEqual([3, 2])
        expect(s.outcomeTick).toBe(before)
    })
})
