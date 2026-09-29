// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { CONTROL_MODE_KEY } from '@/app/stores/ControlStore'
import { placementForHeld, type Cell, type Direction } from '@/app/stores/placement'

/**
 * Pick a piece mode (NEXT-STEPS.md, PL1/PL2 and its implementation contract).
 *
 * The player holds one of the two pieces, and a tap, a click, Space or Enter places it
 * wherever it can cover the cell: as the top or left half when both positions fit, the
 * other way when only that one does, and nowhere when neither does. Drags keep the
 * default's directional placement. Browser-only questions -- right-click, a touch
 * long-press, the compatibility click, focus when the picker goes -- are in
 * e2e/pickAPiece.spec.ts.
 */

const N = 6
let root: RootStore

const session = (rocks: Cell[] = [], id = 'pick-test') => {
    const board = Array.from({ length: N }, () => Array<number | null>(N).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: id,
        board,
        boardHorizontalNumbers: '3,3,3,3,3,3',
        boardVerticalNumbers: '3,3,3,3,3,3',
    }), root)
}

const tap = (s: PuzzleSession, cell: Cell) => runInAction(() => {
    s.pointerDown(cell)
    return s.pointerUp(cell)
})

const drag = (s: PuzzleSession, from: Cell, to: Cell) => runInAction(() => {
    s.pointerDown(from)
    s.setHover(to)
    return s.pointerUp(to)
})

const pick = () => runInAction(() => root.controls.setMode('pick'))
const hold = (piece: 'upright' | 'flat') => runInAction(() => root.controls.setHeld(piece))
const snapshot = (s: PuzzleSession) => s.board.map(row => [...row])
const at = (s: PuzzleSession, [i, j]: Cell) => s.board[i][j]

beforeEach(() => {
    localStorage.clear()
    root = new RootStore()
})

describe('the rule: where a held piece covers a clicked cell', () => {
    const free = (blocked: Cell[] = []) => (anchor: Cell, direction: Direction) => {
        const step: Record<Direction, Cell> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }
        const other: Cell = [anchor[0] + step[direction][0], anchor[1] + step[direction][1]]
        return ![anchor, other].some(([i, j]) =>
            i < 0 || j < 0 || i >= N || j >= N || blocked.some(([a, b]) => a === i && b === j))
    }

    it('both positions fitting: the cell is the top half, or the left half', () => {
        expect(placementForHeld('upright', [2, 2], free())).toEqual({
            anchor: [2, 2], direction: 'down', cells: [[2, 2], [3, 2]], values: [1, 0],
        })
        expect(placementForHeld('flat', [2, 2], free())).toEqual({
            anchor: [2, 2], direction: 'right', cells: [[2, 2], [2, 3]], values: [0, 2],
        })
    })

    it('only the opposite position fitting: that one, with the pips it makes', () => {
        // Upright, the cell below taken: the clicked cell is the bottom half, worth 0.
        expect(placementForHeld('upright', [2, 2], free([[3, 2]]))).toEqual({
            anchor: [2, 2], direction: 'up', cells: [[2, 2], [1, 2]], values: [0, 1],
        })
        // Flat, the cell to the right taken: the clicked cell is the right half, worth 2.
        expect(placementForHeld('flat', [2, 2], free([[2, 3]]))).toEqual({
            anchor: [2, 2], direction: 'left', cells: [[2, 2], [2, 1]], values: [2, 0],
        })
    })

    it('neither fitting: nothing', () => {
        expect(placementForHeld('upright', [2, 2], free([[1, 2], [3, 2]]))).toBeNull()
        expect(placementForHeld('flat', [2, 2], free([[2, 1], [2, 3]]))).toBeNull()
    })
})

describe('the mode and the held piece', () => {
    it('start in the default drag controls, holding upright', () => {
        expect(root.controls.mode).toBe('drag')
        expect(root.controls.held).toBe('upright')
        expect(session().pickMode).toBe(false)
    })

    it('the mode is remembered on the device, and the held piece is not', () => {
        pick()
        hold('flat')
        expect(localStorage.getItem(CONTROL_MODE_KEY)).toBe('pick')
        // Nothing else was written: the held piece has no key of its own.
        const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
        expect(keys).toEqual([CONTROL_MODE_KEY])

        const next = new RootStore()
        expect(next.controls.mode).toBe('pick')
        expect(next.controls.held).toBe('upright')
    })

    it('the held piece lasts across puzzles and across switching the mode off and on', () => {
        pick()
        hold('flat')
        const a = session([], 'a'), b = session([], 'b')
        expect(a.heldPiece).toBe('flat')
        expect(b.heldPiece).toBe('flat')
        runInAction(() => { root.controls.setMode('drag'); root.controls.setMode('pick') })
        expect(a.heldPiece).toBe('flat')
        runInAction(() => root.controls.switchHeld())
        expect(b.heldPiece).toBe('upright')
    })

    it('a board with a fixed mode ignores the player\'s choice (the tutorial)', () => {
        pick()
        const s = session()
        runInAction(() => s.setFixedControlMode('drag'))
        expect(s.pickMode).toBe(false)
        // So a tap on an open cell offers candidates, as the tutorial's text says.
        expect(tap(s, [2, 2])).toBe('candidates')
    })
})

describe('a tap in Pick a piece mode', () => {
    it('places the held piece with the tie-break when both positions fit', () => {
        pick()
        const s = session()
        expect(tap(s, [2, 2])).toBe('placed')
        expect([at(s, [2, 2]), at(s, [3, 2])]).toEqual([1, 0])

        hold('flat')
        expect(tap(s, [4, 1])).toBe('placed')
        expect([at(s, [4, 1]), at(s, [4, 2])]).toEqual([0, 2])
    })

    it('never leaves a pending anchor', () => {
        pick()
        const s = session()
        tap(s, [2, 2])
        expect(s.pendingAnchor).toBeNull()
        expect(s.candidateCells).toEqual([])
    })

    it('at all four edges, the only position that fits', () => {
        pick()
        const s = session()
        // Bottom edge, upright: no cell below, so the clicked cell is the bottom half.
        tap(s, [5, 0])
        expect([at(s, [4, 0]), at(s, [5, 0])]).toEqual([1, 0])
        // Top edge, upright: the cell is the top half.
        tap(s, [0, 5])
        expect([at(s, [0, 5]), at(s, [1, 5])]).toEqual([1, 0])

        hold('flat')
        // Right edge, flat: no cell to the right, so the clicked cell is the right half.
        tap(s, [3, 5])
        expect([at(s, [3, 4]), at(s, [3, 5])]).toEqual([0, 2])
        // Left edge, flat: the cell is the left half.
        tap(s, [2, 0])
        expect([at(s, [2, 0]), at(s, [2, 1])]).toEqual([0, 2])
    })

    it('with a rock where the tie-break would go, uses the opposite position', () => {
        pick()
        const s = session([[3, 2]])
        expect(tap(s, [2, 2])).toBe('placed')
        expect([at(s, [1, 2]), at(s, [2, 2])]).toEqual([1, 0])
    })

    it('with another domino where the tie-break would go, uses the opposite position', () => {
        pick()
        hold('flat')
        const s = session()
        runInAction(() => s.placeToward([2, 3], 'down')) // an upright domino at 2,3 and 3,3
        expect(tap(s, [2, 2])).toBe('placed')
        expect([at(s, [2, 1]), at(s, [2, 2])]).toEqual([0, 2])
    })

    it('where neither position fits, is refused and changes nothing', () => {
        pick()
        const s = session([[1, 2], [3, 2]])
        const before = snapshot(s)
        expect(tap(s, [2, 2])).toBe('none')
        expect(s.refusedAt).toEqual([2, 2])
        expect(snapshot(s)).toEqual(before)
    })

    it('on a rock, is refused and changes nothing', () => {
        pick()
        const s = session([[2, 2]])
        const before = snapshot(s)
        expect(tap(s, [2, 2])).toBe('none')
        expect(snapshot(s)).toEqual(before)
    })

    it('on either half of a placed domino, the half worth 0 included, removes the whole domino', () => {
        pick()
        for (const half of [[2, 2], [3, 2]] as Cell[]) {
            const s = session()
            runInAction(() => s.placeToward([2, 2], 'down'))
            expect(at(s, [3, 2])).toBe(0)
            expect(tap(s, half)).toBe('removed')
            expect([at(s, [2, 2]), at(s, [3, 2])]).toEqual([null, null])
        }
    })

    it('places exactly what its preview showed, and nothing where it showed nothing', () => {
        pick()
        // Cells for each case: both fit, the opposite only (a rock, an edge), and neither.
        const rocks: Cell[] = [[3, 2], [0, 4], [1, 0], [3, 0]]
        const cells: Cell[] = [[4, 4], [2, 2], [5, 5], [0, 3], [2, 0]]
        let placed = 0, refused = 0
        for (const piece of ['upright', 'flat'] as const) {
            hold(piece)
            for (const cell of cells) {
                const s = session(rocks, `preview-${piece}-${cell}`)
                runInAction(() => s.setHover(cell))
                const shown = s.preview
                const before = snapshot(s)
                const outcome = tap(s, cell)
                if (shown) {
                    placed++
                    expect(outcome).toBe('placed')
                    shown.cells.forEach(([i, j], k) => expect(s.board[i][j]).toBe(shown.values[k]))
                    expect(s.board.flat().filter(c => c !== null && c !== -1)).toHaveLength(2)
                } else {
                    refused++
                    expect(outcome).toBe('none')
                    expect(snapshot(s)).toEqual(before)
                }
            }
        }
        // Both branches were exercised, so neither half of this test passes on nothing.
        expect(placed).toBeGreaterThan(0)
        expect(refused).toBeGreaterThan(0)
    })
})

describe('a drag in Pick a piece mode', () => {
    it('keeps the default directional placement, even when that is the other piece', () => {
        pick()
        const s = session()
        expect(s.heldPiece).toBe('upright')
        expect(drag(s, [2, 2], [2, 3])).toBe('placed')
        expect([at(s, [2, 2]), at(s, [2, 3])]).toEqual([0, 2])
    })

    it('previews the piece its direction makes, not the held piece', () => {
        pick()
        const s = session()
        runInAction(() => { s.pointerDown([2, 2]); s.setHover([2, 3]) })
        expect(s.preview).toMatchObject({ direction: 'right', values: [0, 2] })
    })

    it('when invalid, is refused and never falls back to a held-piece tap', () => {
        pick()
        const s = session([[2, 3]]) // a rock where the drag points; upright would fit
        const before = snapshot(s)
        expect(drag(s, [2, 2], [2, 3])).toBe('none')
        expect(snapshot(s)).toEqual(before)
    })
})

describe('the keyboard in Pick a piece mode', () => {
    const key = (s: PuzzleSession, k: string) => runInAction(() => s.handleKey(k))

    it('Space and Enter place the held piece on an empty focused cell', () => {
        pick()
        for (const k of [' ', 'Enter']) {
            const s = session([], `key-${k}`)
            key(s, 'ArrowRight') // enters the board at 0,0
            expect(key(s, k)).toBe(true)
            expect([at(s, [0, 0]), at(s, [1, 0])]).toEqual([1, 0])
        }
    })

    it('Space and Enter on an occupied cell or a rock refuse, and never remove', () => {
        pick()
        for (const k of [' ', 'Enter']) {
            const s = session([[0, 1]], `refuse-${k}`)
            runInAction(() => s.placeToward([1, 0], 'down')) // 1,0 is worth 1; 2,0 worth 0
            for (const cell of [[1, 0], [2, 0], [0, 1]] as Cell[]) {
                const before = snapshot(s)
                runInAction(() => s.setFocusedCell(cell))
                // Handled, so the browser does not also act on it: Space would scroll.
                expect(key(s, k)).toBe(true)
                expect(s.refusedAt).toEqual(cell)
                expect(snapshot(s)).toEqual(before)
            }
        }
    })

    it('Delete and Backspace still remove', () => {
        pick()
        for (const k of ['Delete', 'Backspace']) {
            const s = session([], `remove-${k}`)
            runInAction(() => { s.placeToward([1, 0], 'down'); s.setFocusedCell([2, 0]) })
            expect(key(s, k)).toBe(true)
            expect([at(s, [1, 0]), at(s, [2, 0])]).toEqual([null, null])
        }
    })

    it('focus previews where the held piece would land, with no pointer on the board', () => {
        pick()
        const s = session()
        key(s, 'ArrowRight')
        key(s, 'ArrowDown') // 1,0
        expect(s.hoveredCell).toBeNull()
        expect(s.preview).toEqual(s.heldPlacement([1, 0]))
        expect(s.highlightedPair).toEqual([[1, 0], [2, 0]])
    })

    it('the input used last decides the preview: a key after the mouse, then the mouse again', () => {
        pick()
        const s = session()
        // The mouse comes to rest on 4,4.
        runInAction(() => s.setHover([4, 4]))
        expect(s.preview).toEqual(s.heldPlacement([4, 4]))

        // The keyboard moves to 1,0 with the mouse still there: the preview is where Enter
        // would place, not where the mouse is resting.
        key(s, 'ArrowRight')
        key(s, 'ArrowDown')
        expect(s.hoveredCell).toEqual([4, 4])
        expect(s.preview).toEqual(s.heldPlacement([1, 0]))

        // The mouse moves again: the preview is the mouse's.
        runInAction(() => s.setHover([4, 4]))
        expect(s.preview).toEqual(s.heldPlacement([4, 4]))
    })

    it('focus arriving visibly, with no key on the board, takes the preview from a resting mouse', () => {
        pick()
        const s = session()
        runInAction(() => s.setHover([4, 4]))
        // What a square's `onFocus` does when Tab lands on it: the Tab was the page's key.
        runInAction(() => { s.setFocusedCell([1, 0]); s.setFocusVisible(true) })
        expect(s.preview).toEqual(s.heldPlacement([1, 0]))

        // Hidden focus -- a press, or focus leaving -- hands nothing to the keyboard.
        runInAction(() => { s.setHover([4, 4]); s.setFocusVisible(false) })
        expect(s.keyboardLatest).toBe(false)
        expect(s.preview).toEqual(s.heldPlacement([4, 4]))
    })

    it('a drag in progress keeps its preview when focus arrives visibly', () => {
        pick()
        const s = session()
        runInAction(() => { s.pointerDown([2, 2]); s.setHover([2, 3]) })
        runInAction(() => { s.setFocusedCell([0, 0]); s.setFocusVisible(true) })
        expect(s.preview).toMatchObject({ anchor: [2, 2], direction: 'right' })
    })

    it('a drag in progress keeps its own preview, whatever key comes', () => {
        pick()
        const s = session()
        key(s, 'ArrowRight') // focus on 0,0
        runInAction(() => { s.pointerDown([2, 2]); s.setHover([2, 3]) })
        key(s, 'ArrowDown') // the keyboard is in use again, mid-drag
        expect(s.keyboardLatest).toBe(true)
        expect(s.preview).toMatchObject({ anchor: [2, 2], direction: 'right' })
    })

    it('the default mode shows no focus preview', () => {
        const s = session()
        key(s, 'ArrowRight')
        expect(s.preview).toBeNull()
    })
})

describe('switching the mode', () => {
    it('drops a pending anchor on every board, and changes no board', () => {
        const a = session([], 'switch-a'), b = session([], 'switch-b')
        runInAction(() => {
            root.boardsStore.sessions.set('switch-a', a)
            root.boardsStore.sessions.set('switch-b', b)
            a.placeToward([0, 0], 'down')
        })
        expect(tap(a, [2, 2])).toBe('candidates')
        expect(tap(b, [3, 3])).toBe('candidates')
        const before = [snapshot(a), snapshot(b)]

        pick()
        expect(a.pendingAnchor).toBeNull()
        expect(b.pendingAnchor).toBeNull()
        expect([snapshot(a), snapshot(b)]).toEqual(before)
    })

    it('drops a drag in progress', () => {
        const s = session([], 'switch-drag')
        runInAction(() => root.boardsStore.sessions.set('switch-drag', s))
        runInAction(() => s.pointerDown([2, 2]))
        pick()
        expect(s.gesture).toBeNull()
        // The release that follows is over no gesture, so it places nothing.
        expect(runInAction(() => s.pointerUp([2, 3]))).toBe('none')
        expect(at(s, [2, 2])).toBeNull()
    })
})

describe('the default mode is untouched', () => {
    it('a tap on an open cell still offers candidates, and places nothing', () => {
        const s = session()
        expect(tap(s, [2, 2])).toBe('candidates')
        expect(s.board.flat().every(c => c === null)).toBe(true)
    })

    it('Space still anchors rather than placing', () => {
        const s = session()
        runInAction(() => { s.handleKey('ArrowRight'); s.handleKey(' ') })
        expect(s.pendingAnchor).toEqual([0, 0])
        expect(at(s, [0, 0])).toBeNull()
    })
})
