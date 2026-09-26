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

/**
 * Where a refusal happened, for the mark that does not move (graphics spec P1-6, row 12).
 *
 * The shake is suppressed under reduced motion, so each refusal also names its square, and
 * the board draws a cross there until the player does something else.
 */
describe('a refusal says where', () => {
    it('on the square a refused drag started from', () => {
        const s = session()
        act(() => { s.placeToward([3, 2], 'down') })
        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp([3, 2])   // occupied
        })
        expect(s.refusedAt).toEqual([2, 2])
    })

    it('on a boxed-in square that was tapped, and on a rock that was tapped', () => {
        const s = session([[1, 2], [3, 2], [2, 1], [2, 3]])
        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp([2, 2])
        })
        expect(s.refusedAt).toEqual([2, 2])
        act(() => {
            s.pointerDown([1, 2])
            s.pointerUp([1, 2])
        })
        expect(s.refusedAt).toEqual([1, 2])
    })

    it('on the anchor, for a refused arrow; on the focused square, for Space and Delete', () => {
        const s = session([[3, 2], [0, 0]])
        act(() => { s.setFocusedCell([2, 2]) })
        act(() => { s.handleKey(' ') })
        act(() => { s.handleKey('ArrowDown') })   // onto the rock: refused, anchor kept
        expect(s.refusedAt).toEqual([2, 2])
        expect(s.pendingAnchor).toEqual([2, 2])

        act(() => { s.setFocusedCell([0, 0]) })
        act(() => { s.handleKey('Delete') })       // a rock
        expect(s.refusedAt).toEqual([0, 0])
    })

    it('and nothing else is a place: a release off the board marks nothing', () => {
        const s = session()
        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp(null)
        })
        expect(s.refusedAt).toBeNull()
    })
})

describe('the mark lasts until the player does anything else', () => {
    const refused = () => {
        const s = session([[1, 2], [3, 2], [2, 1], [2, 3]])
        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp([2, 2])
        })
        expect(s.refusedAt).toEqual([2, 2])
        return s
    }

    it('a press', () => {
        const s = refused()
        act(() => { s.pointerDown([0, 0]) })
        expect(s.refusedAt).toBeNull()
    })

    it('a key, even one that only moves the focus', () => {
        const s = refused()
        act(() => { s.setFocusedCell([0, 0]) })
        act(() => { s.handleKey('ArrowRight') })
        expect(s.refusedAt).toBeNull()
    })

    it('a placement, an undo, a reset, a question to Check', () => {
        let s = refused()
        act(() => {
            s.pointerDown([0, 0])
            s.pointerUp([0, 1])
        })
        expect(s.lastOutcome).toBe('placed')
        expect(s.refusedAt).toBeNull()

        s = refused()
        act(() => { s.placeToward([4, 4], 'down') })
        act(() => {
            s.pointerDown([2, 2])
            s.pointerUp([2, 2])
        })
        act(() => { s.undo() })
        expect(s.refusedAt).toBeNull()

        s = refused()
        act(() => { s.reset() })
        expect(s.refusedAt).toBeNull()

        s = refused()
        act(() => { s.check() })
        expect(s.refusedAt).toBeNull()
    })

    it('but not the board losing focus: walking away is not an action', () => {
        const s = refused()
        act(() => { s.cancelGesture() })
        expect(s.refusedAt).toEqual([2, 2])
    })

    it('nor a key the board leaves to the browser: Tab walking away, a letter, an idle Escape', () => {
        /*
         * Row 12's correction. Every key that reached the board cleared the cross before the
         * board decided whether it was its key, so Tab from the refused square took the
         * cross with it (codex, reproduced in the browser; e2e/motion.spec.ts holds it
         * there too). `cancelGesture` above is what the board's blur does, and never was
         * the path Tab takes.
         */
        const s = refused()
        for (const key of ['Tab', 'a', 'Escape']) {
            act(() => { expect(s.handleKey(key)).toBe(false) })
            expect(s.refusedAt, key).toEqual([2, 2])
        }
    })

    it('and a handled key that is itself refused draws its own cross', () => {
        const s = session([[3, 2]])
        act(() => { s.setFocusedCell([2, 2]) })
        act(() => { s.handleKey(' ') })
        act(() => { expect(s.handleKey('ArrowDown')).toBe(true) })   // onto the rock: handled, and refused
        expect(s.lastOutcome).toBe('none')
        expect(s.refusedAt).toEqual([2, 2])
        expect(s.refusedAt).toEqual([2, 2])
    })
})

/**
 * The focused square's brackets follow the keyboard, as `:focus-visible` does (P1-6).
 */
describe('focus is drawn for the keyboard, not for a press', () => {
    it('a press moves the focus and does not draw it', () => {
        const s = session()
        act(() => { s.pointerDown([2, 2]) })
        expect(s.focusedCell).toEqual([2, 2])
        expect(s.focusVisible).toBe(false)
    })

    it('a key on the board draws it, and a press after hides it again', () => {
        const s = session()
        act(() => { s.handleKey('ArrowDown') })
        expect(s.focusVisible).toBe(true)
        act(() => { s.pointerDown([1, 1]) })
        expect(s.focusVisible).toBe(false)
    })

    it('a chord the board leaves to the browser does not', () => {
        const s = session()
        act(() => { s.handleKey('c', { ctrl: true }) })
        expect(s.focusVisible).toBe(false)
    })

    it('a reset or a restored day starts undrawn', () => {
        const s = session()
        act(() => { s.handleKey('ArrowDown') })
        act(() => { s.reset() })
        expect(s.focusVisible).toBe(false)
    })
})
