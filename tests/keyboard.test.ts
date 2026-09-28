import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession, type Modifiers } from '@/app/stores/PuzzleSession'
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

    it('anchors even when only one direction is legal, rather than placing outright', () => {
        // Space/Enter has exactly one meaning in the spec's keyboard table: set the
        // anchor. The pointer's tap may commit without asking, because the finger is
        // already on the cell it means; the keyboard's direction is a second key either
        // way, so there is nothing to save by guessing -- and a Space that sometimes
        // places and sometimes does not is the mode P1-1 exists to delete.
        const s = session([[1, 0]])
        focusAt(s, [0, 0])
        expect(press(s, ' ')).toBe(true)

        expect(s.pendingAnchor).toEqual([0, 0])
        expect(s.candidateCells).toEqual([[0, 1]])
        expect(s.board.flat().every(c => c === null || c === -1)).toBe(true)

        // ...and the arrow that follows is what places.
        press(s, 'ArrowRight')
        expect(s.board[0][0]).toBe(0)
        expect(s.board[0][1]).toBe(2)
    })

    it('is unhandled on a cell with no legal direction, rather than entering a dead mode', () => {
        // Boxed in on all four sides: there is nothing to anchor, and an anchor offering
        // no candidates would be a mode with nothing in it.
        const s = session([[1, 2], [3, 2], [2, 1], [2, 3]])
        focusAt(s, [2, 2])

        expect(press(s, ' ')).toBe(false)
        expect(s.pendingAnchor).toBeNull()
    })

    it('does not remove: that is Delete and Backspace alone', () => {
        // Delegating Space to the pointer's tap made it remove on an occupied cell, which
        // contradicts the keyboard table twice over -- Space is the anchor key, and
        // removal has its own keys.
        for (const key of [' ', 'Enter']) {
            const s = session()
            runInAction(() => { s.placeToward([2, 2], 'down') })
            focusAt(s, [2, 2])

            expect(press(s, key), key).toBe(false)
            expect(s.board[2][2], key).toBe(1)
            expect(s.board[3][2], key).toBe(0)
            expect(s.pendingAnchor, key).toBeNull()
        }
    })

    it('is unhandled on a rock', () => {
        const s = session([[2, 2]])
        focusAt(s, [2, 2])
        expect(press(s, ' ')).toBe(false)
        expect(s.board[2][2]).toBe(-1)
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

describe('Ctrl/Cmd+Z undoes (P1-3)', () => {
    const press2 = (s: PuzzleSession, key: string, mods: Modifiers) =>
        runInAction(() => s.handleKey(key, mods))

    for (const mods of [{ ctrl: true }, { meta: true }]) {
        it(`${mods.ctrl ? 'Ctrl' : 'Cmd'}+Z reverses the last move`, () => {
            const s = session()
            runInAction(() => { s.placeToward([2, 2], 'down') })

            expect(press2(s, 'z', mods)).toBe(true)
            expect(s.board[2][2]).toBeNull()
            expect(s.board[3][2]).toBeNull()
        })
    }

    it('Ctrl/Cmd+Shift+Z is redo elsewhere, and is refused here', () => {
        /*
         * There is no redo on this board, on purpose. Consuming the redo chord as another
         * undo would be actively wrong: the player asking to put a move back would lose a
         * second one instead.
         *
         * The earlier version of this test passed an uppercase `'Z'` and called it "the
         * shift key held". That is not a model of the modifier at all -- key case depends
         * on Caps Lock and on platform chord handling -- so it passed against a handler
         * that never saw `shift`.
         */
        for (const mods of [{ ctrl: true, shift: true }, { meta: true, shift: true }]) {
            const s = session()
            runInAction(() => { s.placeToward([2, 2], 'down') })

            expect(press2(s, 'z', mods), JSON.stringify(mods)).toBe(false)
            expect(s.board[2][2], JSON.stringify(mods)).toBe(1)
            expect(s.board[3][2], JSON.stringify(mods)).toBe(0)
        }
    })

    it('Alt+Ctrl/Cmd+Z belongs to the OS, not to the board', () => {
        for (const mods of [{ ctrl: true, alt: true }, { meta: true, alt: true }]) {
            const s = session()
            runInAction(() => { s.placeToward([2, 2], 'down') })

            expect(press2(s, 'z', mods), JSON.stringify(mods)).toBe(false)
            expect(s.board[2][2], JSON.stringify(mods)).toBe(1)
        }
    })

    it('an uppercase Z with no shift flag still undoes, since Caps Lock is not a chord', () => {
        // The case of the character is not the signal; the modifier flags are.
        const s = session()
        runInAction(() => { s.placeToward([2, 2], 'down') })
        expect(press2(s, 'Z', { ctrl: true })).toBe(true)
        expect(s.board[2][2]).toBeNull()
    })

    it('Ctrl+Meta+Z is a third chord, not a louder undo', () => {
        const s = session()
        runInAction(() => { s.placeToward([2, 2], 'down') })

        expect(press2(s, 'z', { ctrl: true, meta: true })).toBe(false)
        expect(s.board[2][2]).toBe(1)
        expect(s.board[3][2]).toBe(0)
    })

    it('Alt alone is left to the browser', () => {
        const s = session()
        focusAt(s, [2, 2])
        expect(press2(s, 'ArrowDown', { alt: true })).toBe(false)
        expect(s.focusedCell).toEqual([2, 2])
    })

    it('is unhandled with nothing to undo, leaving the key to the browser', () => {
        const s = session()
        expect(press2(s, 'z', { ctrl: true })).toBe(false)
    })

    it('a bare z is not undo', () => {
        const s = session()
        runInAction(() => { s.placeToward([2, 2], 'down') })

        expect(press(s, 'z')).toBe(false)
        expect(s.board[2][2]).toBe(1)
    })

    it('other modified keys are left to the browser', () => {
        // Ctrl+R reloads and Cmd+Left goes back. Claiming them because the unmodified key
        // is one the board uses would break the page around it.
        const s = session()
        focusAt(s, [2, 2])

        expect(press2(s, 'ArrowLeft', { meta: true })).toBe(false)
        expect(press2(s, 'r', { ctrl: true })).toBe(false)
        // ...and the focus did not move.
        expect(s.focusedCell).toEqual([2, 2])
    })
})

describe('Shift belongs to the browser too', () => {
    /*
     * Shift was missing from the general modifier guard, so every board key still fired
     * while it was held. Shift+Space scrolls a page up and Shift+Arrow extends a selection;
     * a board that quietly eats them has taken keys it never claimed -- and Shift+Backspace
     * silently destroying a domino is the worst of the three.
     */
    const shiftPress = (s: PuzzleSession, key: string) =>
        runInAction(() => s.handleKey(key, { shift: true }))

    it('Shift+Arrow does not move the focus', () => {
        const s = session()
        focusAt(s, [2, 2])

        expect(shiftPress(s, 'ArrowDown')).toBe(false)
        expect(s.focusedCell).toEqual([2, 2])
    })

    it('Shift+Space and Shift+Enter do not anchor', () => {
        for (const key of [' ', 'Enter']) {
            const s = session()
            focusAt(s, [2, 2])

            expect(shiftPress(s, key), key).toBe(false)
            expect(s.pendingAnchor, key).toBeNull()
        }
    })

    it('Shift+Backspace and Shift+Delete do not remove', () => {
        for (const key of ['Backspace', 'Delete']) {
            const s = session()
            runInAction(() => { s.placeToward([2, 2], 'down') })
            focusAt(s, [2, 2])

            expect(shiftPress(s, key), key).toBe(false)
            expect(s.board[2][2], key).toBe(1)
            expect(s.board[3][2], key).toBe(0)
        }
    })

    it('Shift+Escape does not clear a pending anchor', () => {
        const s = session()
        focusAt(s, [2, 2])
        runInAction(() => { s.handleKey(' ') })
        expect(s.pendingAnchor).toEqual([2, 2])

        expect(shiftPress(s, 'Escape')).toBe(false)
        expect(s.pendingAnchor).toEqual([2, 2])
    })
})

describe('the keyboard and the pointer are the same verb', () => {
    it('but Space anchors where a tap commits, on a one-direction cell', () => {
        // The one place the two deliberately differ, pinned so neither drifts onto the
        // other's behaviour unnoticed.
        const byKeyboard = session([[1, 0]])
        focusAt(byKeyboard, [0, 0])
        press(byKeyboard, ' ')
        expect(byKeyboard.pendingAnchor).toEqual([0, 0])
        expect(byKeyboard.board[0][1]).toBeNull()

        const byPointer = session([[1, 0]])
        runInAction(() => {
            byPointer.pointerDown([0, 0])
            byPointer.pointerUp([0, 0])
        })
        expect(byPointer.pendingAnchor).toBeNull()
        expect(byPointer.board[0][1]).toBe(2)
    })

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
