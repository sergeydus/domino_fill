import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { lineState, columnComplete, rowComplete } from '@/app/stores/boardRules'
import { labelPresentation, labelDescription, pillStyle, LABEL_COLORS } from '@/app/dominoFill/lineLabel'
import type { LineState } from '@/app/stores/boardRules'
import { PALETTE, THEMES, cssVar, type Theme, type Token } from '@/app/palette'
import { contrast } from './colour'

/**
 * Honest line feedback (spec P1-5, D10-g).
 *
 * The defect being fixed is specific and easy to restate wrongly: a line used to turn green
 * when its *sum* reached the target, which happens long before the line is finished, so the
 * board told players they had completed lines they had not.
 *
 * UI row 4 gave that case a state of its own, `reached` (UI-SPEC §4.2): the sum matches with
 * cells still open, so the rest must be blanks. It is not `satisfied`, which still needs the
 * line full (D10-g), and a screen reader hears "target reached", not "complete".
 */

let root: RootStore

/** A 4x4 with no rocks, and targets supplied by the caller. */
const session = (columns: string, rows: string) => new PuzzleSession(definitionFrom({
    puzzleId: 'line-test',
    board: Array.from({ length: 4 }, () => Array(4).fill(null)),
    boardHorizontalNumbers: columns,
    boardVerticalNumbers: rows,
}), root)

const act = <T,>(fn: () => T): T => runInAction(fn)

beforeEach(() => { root = new RootStore() })

describe('a line is satisfied only when it is finished', () => {
    it('the rule itself', () => {
        expect(lineState(3, 3, true)).toBe('satisfied')
        // The whole complaint: the sum matches, the line is not full. Reached, not satisfied,
        // since UI row 4; neutral until then.
        expect(lineState(3, 3, false)).toBe('reached')
        expect(lineState(4, 3, false)).toBe('over')
        expect(lineState(4, 3, true)).toBe('over')
        expect(lineState(1, 3, false)).toBe('neutral')
        // Short of its target and full: no blanks left to make it up, but nothing past it.
        expect(lineState(1, 3, true)).toBe('neutral')
    })

    it('a matched sum with gaps left is not satisfied, but reached', () => {
        /*
         * The exact case the old rule got wrong, on a real board. Column 0's target is 1;
         * placing a vertical domino at (0,0) puts a 1 in it and reaches the target with two
         * cells still empty.
         */
        const s = session('1,0,0,0', '1,0,0,0')
        act(() => { s.placeToward([0, 0], 'down') })

        expect(s.currentColumnSums[0]).toBe(1)
        expect(columnComplete(s.board, 4, 0)).toBe(false)
        expect(s.columnStates[0]).toBe('reached')
    })

    it('and becomes satisfied once the gaps are filled', () => {
        // Two vertical dominoes fill column 0 as 1,0,1,0 -- a sum of 2, not 1.
        const s = session('2,0,0,0', '1,0,1,0')
        act(() => {
            s.placeToward([0, 0], 'down')
            s.placeToward([2, 0], 'down')
        })

        expect(columnComplete(s.board, 4, 0)).toBe(true)
        expect(s.currentColumnSums[0]).toBe(2)
        expect(s.columnStates[0]).toBe('satisfied')
    })

    it('rows work the same way', () => {
        const s = session('0,2,0,0', '2,0,0,0')
        act(() => { s.placeToward([0, 0], 'right') })

        expect(s.currentRowSums[0]).toBe(2)
        expect(rowComplete(s.board, 4, 0)).toBe(false)
        expect(s.rowStates[0]).toBe('reached')
    })

    it('a rock counts as filled, so a line of rocks and pieces can finish', () => {
        const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
        board[2][0] = -1
        board[3][0] = -1
        const s = new PuzzleSession(definitionFrom({
            puzzleId: 'rock-line',
            board,
            boardHorizontalNumbers: '1,0,0,0',
            boardVerticalNumbers: '1,0,0,0',
        }), root)

        act(() => { s.placeToward([0, 0], 'down') })
        expect(columnComplete(s.board, 4, 0)).toBe(true)
        expect(s.columnStates[0]).toBe('satisfied')
    })

    it('overshooting says so at once, finished or not', () => {
        const s = session('1,0,0,0', '1,0,0,0')
        act(() => { s.placeToward([0, 0], 'down') })
        act(() => { s.placeToward([2, 0], 'down') })
        // Column 0 now holds 1,0,1,0 = 2 against a target of 1.
        expect(s.currentColumnSums[0]).toBe(2)
        expect(s.columnStates[0]).toBe('over')
    })
})

describe('a target of 0 (UI row 4)', () => {
    /*
     * A line whose target is 0 is reached from the start, while any cell in it is open, and
     * shows it: a hint that it takes only blanks (user, 2026-10-23). 2.06% of the published
     * lines have one; P7 is about fewer of them, and is not now.
     */
    it('is reached on a fresh board, before any piece is in it', () => {
        const s = session('0,1,1,2', '1,1,2,0')
        expect(s.columnStates[0]).toBe('reached')
        expect(s.rowStates[3]).toBe('reached')
        // And only the 0 lines: the others are short of their targets.
        expect(s.columnStates.slice(1)).toEqual(['neutral', 'neutral', 'neutral'])
    })

    it('is satisfied when it holds only rocks, which leave nothing open', () => {
        const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
        for (let i = 0; i < 4; i++) board[i][0] = -1
        const s = new PuzzleSession(definitionFrom({
            puzzleId: 'zero-rocks', board, boardHorizontalNumbers: '0,2,2,2', boardVerticalNumbers: '2,2,1,1',
        }), root)
        expect(columnComplete(s.board, 4, 0)).toBe(true)
        expect(s.columnStates[0]).toBe('satisfied')
    })

    it('becomes satisfied when it is filled with blanks', () => {
        // A flat domino's left half is blank: one at the start of every row fills column 0 with 0s.
        const s = session('0,8,0,0', '2,2,2,2')
        act(() => { for (let i = 0; i < 4; i++) s.placeToward([i, 0], 'right') })
        expect(s.currentColumnSums[0]).toBe(0)
        expect(s.columnStates[0]).toBe('satisfied')
    })

    it('is over the moment a pip lands in it', () => {
        const s = session('0,0,0,0', '1,0,0,0')
        act(() => { s.placeToward([0, 0], 'down') })
        expect(s.columnStates[0]).toBe('over')
    })
})

describe('the states move with the board, in either direction (UI row 4)', () => {
    /*
     * A label's state is read from the board on every read (`PuzzleSession.columnStates`), and
     * has no state of its own. So these drive the session's own verbs and read what the labels
     * would: each step from a state to the next, the way back, and an Undo after each step
     * that must restore exactly the states before it, on both axes.
     *
     * Column 0 targets 1 throughout. An upright scores 1 over 0; a flat domino 0 then 2.
     */
    const states = (s: PuzzleSession): [LineState[], LineState[]] => [[...s.columnStates], [...s.rowStates]]

    /** Runs `step`, checks column 0 lands in `expected`, then undoes it and checks the way back. */
    const stepAndUndo = (s: PuzzleSession, step: () => boolean, expected: LineState) => {
        const before = states(s)
        expect(act(step), 'the step was refused').toBe(true)
        expect(s.columnStates[0]).toBe(expected)
        expect(act(() => s.undo()), 'the undo was refused').toBe(true)
        expect(states(s), 'Undo restores every label').toEqual(before)
        expect(act(step)).toBe(true)
    }

    it('neutral to reached, to satisfied, and back by removal; and Undo after every step', () => {
        const s = session('1,4,0,0', '1,2,2,2')
        expect(s.columnStates[0]).toBe('neutral')
        stepAndUndo(s, () => s.placeToward([0, 0], 'down'), 'reached')
        // A blank at (2,0) leaves (3,0) open: still reached.
        stepAndUndo(s, () => s.placeToward([2, 0], 'right'), 'reached')
        stepAndUndo(s, () => s.placeToward([3, 0], 'right'), 'satisfied')
        // Satisfied back to reached, by taking a blank out.
        stepAndUndo(s, () => s.removePiece(3, 0), 'reached')
        // And reached back to neutral, by taking the 1 out.
        stepAndUndo(s, () => s.removePiece(0, 0), 'neutral')
    })

    it('reached to over, and back by removal', () => {
        const s = session('1,4,0,0', '1,2,2,2')
        act(() => { s.placeToward([0, 0], 'down') })
        expect(s.columnStates[0]).toBe('reached')
        stepAndUndo(s, () => s.placeToward([2, 0], 'down'), 'over')
        stepAndUndo(s, () => s.removePiece(2, 0), 'reached')
    })

    it('Reset restores the fresh board\'s states, a 0 line\'s reached among them', () => {
        const s = session('1,0,0,0', '1,2,2,2')
        const fresh = states(s)
        expect(fresh[0][1]).toBe('reached')
        act(() => {
            s.placeToward([0, 0], 'down')
            s.placeToward([0, 1], 'down')
        })
        expect(s.columnStates.slice(0, 2)).toEqual(['reached', 'over'])
        act(() => s.reset())
        expect(states(s)).toEqual(fresh)
    })
})

describe('state reaches more than one channel', () => {
    const ALL: LineState[] = ['neutral', 'reached', 'satisfied', 'over']

    it('each state carries a shape, not only a colour', () => {
        // WCAG 1.4.1: colour cannot be the only carrier. Roughly one man in twelve cannot
        // separate this red from this green. Since UI row 4: a filled pill, a ringed one, and
        // a bar; the strike-through retired.
        expect(labelPresentation('satisfied')).toMatchObject({ pill: 'filled', bar: false })
        expect(labelPresentation('over')).toMatchObject({ pill: 'ringed', bar: false })
        expect(labelPresentation('reached')).toMatchObject({ pill: 'none', bar: true })
        expect(labelPresentation('neutral')).toMatchObject({ pill: 'none', bar: false })
    })

    it('the shapes are distinct from each other, not just from neutral', () => {
        const shapes = ALL.map(state => { const p = labelPresentation(state); return `${p.pill} ${p.bar}` })
        expect(new Set(shapes).size).toBe(ALL.length)
    })

    it('the pill draws them: filled in success with onSuccess text, ringed in problem, or nothing', () => {
        const pill = (state: LineState) => pillStyle(labelPresentation(state))
        expect(pill('satisfied')).toMatchObject({ backgroundColor: cssVar('success'), color: cssVar('onSuccess'), outline: 'none' })
        expect(pill('over')).toMatchObject({ backgroundColor: undefined, color: undefined, outline: `2px solid ${cssVar('problem')}` })
        for (const state of ['neutral', 'reached'] as const) {
            expect(pill(state)).toMatchObject({ backgroundColor: undefined, color: undefined, outline: 'none' })
        }
        // Every state's pill is the same box, so no state moves the number.
        const box = (state: LineState) => { const { height, minWidth, paddingInline } = pill(state); return { height, minWidth, paddingInline } }
        for (const state of ALL) expect(box(state)).toEqual(box('neutral'))
    })

    it('and the tie stays in the state\'s colour, since the pill, not the label, takes onSuccess', () => {
        // The label's colour is its tie's (`currentColor`); a satisfied label in `onSuccess`
        // would paint its tie white on the ground.
        expect(labelPresentation('satisfied').color).toBe(cssVar('success'))
        expect(labelPresentation('reached').color).toBe(cssVar('success'))
        expect(labelPresentation('over').color).toBe(cssVar('problem'))
        expect(labelPresentation('neutral').color).toBe(cssVar('lineNeutral'))
    })

    it('and a screen reader hears the state, which neither colour nor shape reaches', () => {
        expect(labelDescription('Row 3', '7', 'satisfied')).toBe('Row 3, target 7, complete')
        expect(labelDescription('Row 3', '7', 'reached')).toBe('Row 3, target 7, target reached')
        expect(labelDescription('Row 3', '7', 'reached')).not.toMatch(/complete/i)
        expect(labelDescription('Row 3', '7', 'over')).toMatch(/over/i)
        expect(labelDescription('Row 3', '7', 'neutral')).toBe('Row 3, target 7')
    })

    it('says which line it is, because these labels are heard out of context', () => {
        /*
         * The labels sit outside the grid, so nothing else announces the row or column
         * they belong to. "7, complete" identifies no line at all, and three of them in a
         * row are indistinguishable (spec P1-8, row 19).
         */
        for (const state of ['satisfied', 'reached', 'over', 'neutral'] as const) {
            expect(labelDescription('Column 4', '7', state)).toMatch(/^Column 4,/)
        }
        expect(labelDescription('Row 1', '7', 'neutral'))
            .not.toBe(labelDescription('Row 2', '7', 'neutral'))
    })
})

describe('the palette meets WCAG 1.4.3 on the board background', () => {
    // The ground by token (graphics row 5), so this re-checks itself when P1-3 moves it.
    const BACKGROUND = PALETTE.ground

    /*
     * The token each label paints. The labels hold references (`var(--success)`) since UI
     * row 1, so the label follows the theme; the token is read back from the reference, so
     * this checks what the label really paints, in each theme's values.
     */
    const tokenOf = (reference: string): Token => {
        const token = (Object.keys(PALETTE) as Token[]).find(t => cssVar(t) === reference)
        expect(token, reference).toBeDefined()
        return token!
    }

    for (const theme of Object.keys(THEMES) as Theme[]) {
        it(`every label colour clears 4.5:1 on the ${theme} ground`, () => {
            // Measured, and worse than the spec first recorded: the old neutral was 1.86:1 and
            // the old green -- the state colour, the thing meant to be read -- was 1.66:1.
            const values = THEMES[theme]
            for (const [state, reference] of Object.entries(LABEL_COLORS)) {
                const token = tokenOf(reference)
                expect(contrast(values[token], values.ground), `${state} (${token})`).toBeGreaterThanOrEqual(4.5)
            }
        })
    }

    it('the old palette would fail this test, which is the point of having it', () => {
        for (const old of ['#ababab', '#4bce4b', '#ff0000']) {
            expect(contrast(old, BACKGROUND), old).toBeLessThan(4.5)
        }
    })
})
