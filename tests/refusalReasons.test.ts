// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession, type Refusal } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import type { Cell } from '@/app/stores/placement'
import { refusalMessage } from '@/app/dominoFill/refusalText'

/**
 * Why a move was refused (keyboard polish, section 3 of its contract in NEXT-STEPS).
 *
 * Every refusal path in `PuzzleSession` stores its own reason with the square, and the two
 * live and die together. These tests walk the contract's table row by row, by pointer and by
 * key, in both modes; then the precedence where a move fits two rows (codex: where a move
 * starts is judged before where it was aimed); then what stays silent. What the page shows,
 * and what reaches a screen reader, is e2e/refusalReasons.spec.ts.
 */

const N = 6
let root: RootStore

const session = (rocks: Cell[] = []) => {
    const board = Array.from({ length: N }, () => Array<number | null>(N).fill(null))
    for (const [i, j] of rocks) board[i][j] = -1
    return new PuzzleSession(definitionFrom({
        puzzleId: 'refusal-test',
        board,
        boardHorizontalNumbers: '3,3,3,3,3,3',
        boardVerticalNumbers: '3,3,3,3,3,3',
    }), root)
}

const act = <T,>(fn: () => T): T => runInAction(fn)
const tap = (s: PuzzleSession, cell: Cell) => () => { s.pointerDown(cell); s.pointerUp(cell) }
const drag = (s: PuzzleSession, from: Cell, to: Cell) => () => {
    s.pointerDown(from)
    s.setHover(to)
    s.pointerUp(to)
}
const keys = (s: PuzzleSession, at: Cell, ...pressed: string[]) => () => {
    s.setFocusedCell(at)
    for (const key of pressed) s.handleKey(key)
}

/**
 * Make a move, and say what it refused: where and why, or `'no refusal'`.
 *
 * Read from the counter, not from the stored refusal alone: two moves refused for the same
 * reason on the same square store equal values, and only the counter says the second one
 * happened.
 */
const attempt = (s: PuzzleSession, move: () => void) => {
    const before = s.rejectionTick
    act(move)
    if (s.rejectionTick === before) return 'no refusal'
    return { at: s.refusal!.at, ...s.refusal!.reason }
}

const setMode = (mode: 'drag' | 'pick') => act(() => root.controls.setMode(mode))
const hold = (piece: 'upright' | 'flat') => act(() => root.controls.setHeld(piece))
/** Every neighbour of 2,2 a rock: nothing fits on it, in either mode. */
const boxedIn: Cell[] = [[1, 2], [3, 2], [2, 1], [2, 3]]

beforeEach(() => {
    localStorage.clear()
    root = new RootStore()
})

describe('every refusal path stores its reason', () => {
    it('a rock: tapped, dragged from, and Space, Enter or Delete on it, in both modes', () => {
        for (const mode of ['drag', 'pick'] as const) {
            setMode(mode)
            const s = session([[2, 2]])
            const rock = { at: [2, 2], kind: 'rock' }
            expect(attempt(s, tap(s, [2, 2])), mode).toEqual(rock)
            expect(attempt(s, drag(s, [2, 2], [2, 3])), mode).toEqual(rock)
            for (const key of [' ', 'Enter', 'Delete']) {
                expect(attempt(s, keys(s, [2, 2], key)), `${mode} ${key}`).toEqual(rock)
            }
        }
    })

    it('Space or Enter on a placed piece, in the default mode only', () => {
        const s = session()
        act(() => { s.placeToward([2, 2], 'down') })
        for (const key of [' ', 'Enter']) {
            expect(attempt(s, keys(s, [3, 2], key)), key).toEqual({ at: [3, 2], kind: 'space-on-piece' })
        }
        setMode('pick')
        expect(attempt(s, keys(s, [3, 2], ' ')), 'Pick a piece removes it').toBe('no refusal')
        expect(s.board[2][2]).toBeNull()
    })

    it('no room: the default names no piece, Pick a piece names the one held', () => {
        const s = session(boxedIn)
        const anyPiece = { at: [2, 2], kind: 'no-room', piece: null }
        expect(attempt(s, tap(s, [2, 2]))).toEqual(anyPiece)
        expect(attempt(s, keys(s, [2, 2], ' '))).toEqual(anyPiece)

        setMode('pick')
        for (const piece of ['upright', 'flat'] as const) {
            hold(piece)
            const held = { at: [2, 2], kind: 'no-room', piece }
            expect(attempt(s, tap(s, [2, 2])), piece).toEqual(held)
            expect(attempt(s, keys(s, [2, 2], 'Enter')), piece).toEqual(held)
        }
    })

    it('names the piece that was refused, whatever is held afterwards', () => {
        setMode('pick')
        const s = session([[0, 1], [1, 0]])   // the corner has no room for either piece
        attempt(s, tap(s, [0, 0]))
        hold('flat')
        expect(refusalMessage(s.refusal!.reason)).toBe('No room for the upright piece there.')
    })

    it('a drag from a placed piece, in both modes', () => {
        for (const mode of ['drag', 'pick'] as const) {
            setMode(mode)
            const s = session()
            act(() => { s.placeToward([2, 2], 'down') })
            expect(attempt(s, drag(s, [2, 2], [2, 3])), mode).toEqual({ at: [2, 2], kind: 'drag-from-piece' })
        }
    })

    it('a drag released on a square that is not next to its start: diagonal, or further', () => {
        const s = session()
        const far = { at: [2, 2], kind: 'not-adjacent' }
        expect(attempt(s, drag(s, [2, 2], [3, 3]))).toEqual(far)
        expect(attempt(s, drag(s, [2, 2], [2, 4]))).toEqual(far)
    })

    it('blocked: a drag, or an arrow after a selection, into a rock or a placed piece', () => {
        const s = session([[3, 2]])
        act(() => { s.placeToward([2, 3], 'right') })
        const blocked = { at: [2, 2], kind: 'blocked' }
        expect(attempt(s, drag(s, [2, 2], [3, 2])), 'drag to a rock').toEqual(blocked)
        expect(attempt(s, drag(s, [2, 2], [2, 3])), 'drag to a piece').toEqual(blocked)
        expect(attempt(s, keys(s, [2, 2], ' ', 'ArrowDown')), 'arrow to a rock').toEqual(blocked)
        expect(attempt(s, keys(s, [2, 2], 'ArrowRight')), 'arrow to a piece').toEqual(blocked)
        expect(s.pendingAnchor, 'a refused arrow keeps the anchor').toEqual([2, 2])
    })

    it('the edge: an arrow after a selection, pointing off the board', () => {
        const s = session()
        const edge = { at: [0, 0], kind: 'edge' }
        expect(attempt(s, keys(s, [0, 0], ' ', 'ArrowUp'))).toEqual(edge)
        expect(attempt(s, keys(s, [0, 0], 'ArrowLeft'))).toEqual(edge)
    })

    it('anything else the rules refuse: a half that belongs to no well-formed piece', () => {
        const s = session()
        act(() => { s.board[2][2] = 0 })   // a 0 that no 1 or 2 claims
        const other = { at: [2, 2], kind: 'other' }
        expect(attempt(s, tap(s, [2, 2]))).toEqual(other)
        expect(attempt(s, keys(s, [2, 2], 'Delete'))).toEqual(other)
    })
})

describe('precedence: where a move starts is judged before where it was aimed (codex)', () => {
    it('a drag from a rock is about the rock: released on a piece, diagonally, next to it or far', () => {
        const s = session([[2, 2]])
        act(() => { s.placeToward([1, 3], 'down') })   // covers 1,3 and 2,3
        for (const to of [[2, 3], [3, 3], [1, 2], [2, 0]] as Cell[]) {
            expect(attempt(s, drag(s, [2, 2], to)), `to ${to}`).toEqual({ at: [2, 2], kind: 'rock' })
        }
    })

    it('a drag from a placed piece is about the piece, whatever it was aimed at', () => {
        const s = session([[4, 2]])
        act(() => { s.placeToward([2, 2], 'down') })   // covers 2,2 and 3,2
        act(() => { s.placeToward([2, 3], 'right') })  // covers 2,3 and 2,4
        for (const to of [[2, 1], [3, 3], [2, 3], [2, 5]] as Cell[]) {
            expect(attempt(s, drag(s, [2, 2], to)), `to ${to}`).toEqual({ at: [2, 2], kind: 'drag-from-piece' })
        }
    })
})

describe('not refusals, and they stay silent', () => {
    it('a pointer released outside the board', () => {
        const s = session()
        expect(attempt(s, () => { s.pointerDown([2, 2]); s.pointerUp(null) })).toBe('no refusal')
        expect(s.refusal).toBeNull()
    })

    it('an arrow that stops at the edge with nothing selected', () => {
        const s = session()
        expect(attempt(s, keys(s, [0, 0], 'ArrowUp', 'ArrowLeft'))).toBe('no refusal')
        expect(s.refusal).toBeNull()
    })
})

describe('the reason lives exactly as long as the cross', () => {
    const refusedOnRock = () => {
        const s = session([[2, 2]])
        expect(attempt(s, tap(s, [2, 2]))).toEqual({ at: [2, 2], kind: 'rock' })
        return s
    }

    it('the cross is drawn from the stored refusal', () => {
        const s = refusedOnRock()
        expect(s.refusedAt).toBe(s.refusal!.at)
    })

    it('both are cleared by a press, a handled key, an undo, a reset, Check, a restore', () => {
        const clearers: [string, (s: PuzzleSession) => void][] = [
            ['a press', s => s.pointerDown([0, 0])],
            ['a handled key', s => { s.setFocusedCell([0, 0]); s.handleKey('ArrowRight') }],
            ['an undo', s => { s.placeToward([4, 4], 'down'); tap(s, [2, 2])(); s.undo() }],
            ['a reset', s => s.reset()],
            ['Check', s => s.check()],
            ['a restore', s => s.restore(s.snapshot)],
        ]
        for (const [name, clear] of clearers) {
            const s = refusedOnRock()
            act(() => clear(s))
            expect([s.refusal, s.refusedAt], name).toEqual([null, null])
        }
    })

    it('both are kept by what is not an action: a blur, or a key left to the browser', () => {
        const s = refusedOnRock()
        act(() => { s.cancelGesture() })
        for (const key of ['Tab', 'a', 'Escape']) act(() => { s.handleKey(key) })
        expect(s.refusal).toEqual({ at: [2, 2], reason: { kind: 'rock' } })
    })

    it('the next refusal replaces both', () => {
        const s = refusedOnRock()
        act(() => { s.placeToward([4, 4], 'down') })
        expect(attempt(s, keys(s, [5, 4], ' '))).toEqual({ at: [5, 4], kind: 'space-on-piece' })
    })
})

describe('what was said last, for the announcer', () => {
    it('whichever came later: a refusal after Check, or Check after a refusal', () => {
        const s = session([[2, 2]])
        act(() => { s.check() })
        expect(s.lastSaid).toBe('advice')
        attempt(s, tap(s, [2, 2]))
        expect(s.lastSaid).toBe('refusal')
        expect(s.advice, 'a refusal leaves the advice standing').not.toBeNull()
        act(() => { s.hint() })
        expect([s.lastSaid, s.refusal]).toEqual(['advice', null])
    })

    it('a refusal that clears is still the last thing said, so the advice under it is not said again', () => {
        const s = session([[2, 2]])
        act(() => { s.check() })
        attempt(s, tap(s, [2, 2]))
        act(() => { s.pointerDown([0, 0]) })
        expect([s.refusal, s.lastSaid]).toEqual([null, 'refusal'])
        expect(s.advice).not.toBeNull()
    })
})

describe('the wording', () => {
    const reasons: Refusal[] = [
        { kind: 'rock' },
        { kind: 'space-on-piece' },
        { kind: 'no-room', piece: null },
        { kind: 'no-room', piece: 'upright' },
        { kind: 'no-room', piece: 'flat' },
        { kind: 'drag-from-piece' },
        { kind: 'not-adjacent' },
        { kind: 'blocked' },
        { kind: 'edge' },
        { kind: 'other' },
    ]

    it('is the contract\'s, one sentence per reason', () => {
        expect(reasons.map(refusalMessage)).toEqual([
            'That square is a rock.',
            'Delete removes a piece; Space selects an empty square.',
            'No room for a piece there.',
            'No room for the upright piece there.',
            'No room for the flat piece there.',
            "Placed pieces can't be dragged; tap one to remove it.",
            'Drag to a square next to it.',
            'That way is blocked.',
            "That's the edge of the board.",
            "That can't be done there.",
        ])
    })
})
