import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { lineState, columnComplete, rowComplete } from '@/app/stores/boardRules'
import { labelPresentation, labelDescription, LABEL_COLORS } from '@/app/dominoFill/lineLabel'
import { PALETTE } from '@/app/palette'
import { contrast } from './colour'

/**
 * Honest line feedback (spec P1-5, D10-g).
 *
 * The defect being fixed is specific and easy to restate wrongly: a line used to turn green
 * when its *sum* reached the target, which happens long before the line is finished, so the
 * board told players they had completed lines they had not.
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
        // The whole complaint: the sum matches, the line is not full.
        expect(lineState(3, 3, false)).toBe('neutral')
        expect(lineState(4, 3, false)).toBe('over')
        expect(lineState(4, 3, true)).toBe('over')
        expect(lineState(1, 3, false)).toBe('neutral')
    })

    it('a matched sum with gaps left is not satisfied', () => {
        /*
         * The exact case the old rule got wrong, on a real board. Column 0's target is 1;
         * placing a vertical domino at (0,0) puts a 1 in it and reaches the target with two
         * cells still empty.
         */
        const s = session('1,0,0,0', '1,0,0,0')
        act(() => { s.placeToward([0, 0], 'down') })

        expect(s.currentColumnSums[0]).toBe(1)
        expect(columnComplete(s.board, 4, 0)).toBe(false)
        expect(s.columnStates[0]).toBe('neutral')
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
        expect(s.rowStates[0]).toBe('neutral')
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

describe('state reaches more than one channel', () => {
    it('each state carries a shape, not only a colour', () => {
        // WCAG 1.4.1: colour cannot be the only carrier. Roughly one man in twelve cannot
        // separate this red from this green.
        expect(labelPresentation('satisfied').textDecoration).toBe('line-through')
        expect(labelPresentation('over').outline).not.toBe('none')

        expect(labelPresentation('neutral').textDecoration).toBe('none')
        expect(labelPresentation('neutral').outline).toBe('none')
    })

    it('the shapes are distinct from each other, not just from neutral', () => {
        const satisfied = labelPresentation('satisfied')
        const over = labelPresentation('over')
        expect(satisfied.textDecoration).not.toBe(over.textDecoration)
        expect(satisfied.outline).not.toBe(over.outline)
    })

    it('and a screen reader hears the state, which neither colour nor strikethrough reaches', () => {
        expect(labelDescription('Row 3', '7', 'satisfied')).toMatch(/complete/i)
        expect(labelDescription('Row 3', '7', 'over')).toMatch(/over/i)
        expect(labelDescription('Row 3', '7', 'neutral')).toBe('Row 3, target 7')
    })

    it('says which line it is, because these labels are heard out of context', () => {
        /*
         * The labels sit outside the grid, so nothing else announces the row or column
         * they belong to. "7, complete" identifies no line at all, and three of them in a
         * row are indistinguishable (spec P1-8, row 19).
         */
        for (const state of ['satisfied', 'over', 'neutral'] as const) {
            expect(labelDescription('Column 4', '7', state)).toMatch(/^Column 4,/)
        }
        expect(labelDescription('Row 1', '7', 'neutral'))
            .not.toBe(labelDescription('Row 2', '7', 'neutral'))
    })
})

describe('the palette meets WCAG 1.4.3 on the board background', () => {
    // The ground by token (graphics row 5), so this re-checks itself when P1-3 moves it.
    const BACKGROUND = PALETTE.ground

    it('every label colour clears 4.5:1', () => {
        // Measured, and worse than the spec first recorded: the old neutral was 1.86:1 and
        // the old green -- the state colour, the thing meant to be read -- was 1.66:1.
        for (const [state, color] of Object.entries(LABEL_COLORS)) {
            expect(contrast(color, BACKGROUND), `${state} (${color})`).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('the old palette would fail this test, which is the point of having it', () => {
        for (const old of ['#ababab', '#4bce4b', '#ff0000']) {
            expect(contrast(old, BACKGROUND), old).toBeLessThan(4.5)
        }
    })
})
