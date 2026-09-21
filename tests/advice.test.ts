import { describe, it, expect } from 'vitest'
import {
    MAX_PROBES, checkPosition, hintFor, stepsBackToSolvable, type ReplayMove,
} from '@/app/stores/advice'
import { adviceIsProblem, adviceMessage } from '@/app/dominoFill/adviceText'
import { definitionFrom, type StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import { solve } from '@/app/stores/solver'
import { generateDay } from '@/scripts/corpus'

/**
 * Check and Hint (spec P1-5, row 18e).
 *
 * The feature exists because the #1 quit reason in a deduction puzzle is a dead end with
 * twenty pieces down. It is only worth having if what it says is true, and the spec is
 * explicit that the cheap version is not: uniqueness is a property of the *empty* board and
 * says nothing about an arbitrary partially-wrong position. A board can be globally
 * unsolvable with no individually unsatisfiable line, so "flag the impossible line" is not
 * even well defined, and a forced move from a wrong position may not exist at all.
 *
 * So the distinctions below are the feature, and each one is a different sentence to a
 * player:
 *
 *   - solvable / not solvable / **could not tell**;
 *   - not solvable, and **how far back** to undo;
 *   - solvable but **nothing forced**, which is not a complaint.
 */

/** A 2x2 with its right column rocked out: exactly one downward domino solves it. */
const tiny = (puzzleId = 'tiny'): StoredPuzzle => {
    const board = [[null, -1], [null, -1]] as (number | null)[][]
    return {
        puzzleId, board, boardHorizontalNumbers: '1,0', boardVerticalNumbers: '1,0',
    } as StoredPuzzle
}

/**
 * A 2x2 with no rocks, whose only completion is two upright dominoes.
 *
 * The smallest board on which a *legal* move can still be a wrong one, which the fixture
 * above cannot offer: with its right column rocked out, the one placement the rules permit
 * is the correct one. Here a flat domino in the top row is perfectly well formed and makes
 * the puzzle impossible, which is the position Check exists to recognise.
 *
 * Two uprights give columns 1,1 and rows 2,0. Two flats give columns 0,4 and rows 2,2, so
 * the upright targets pick out exactly one completion.
 */
const pair = (): StoredPuzzle => ({
    puzzleId: 'pair',
    board: [[null, null], [null, null]] as (number | null)[][],
    boardHorizontalNumbers: '1,1',
    boardVerticalNumbers: '2,0',
} as StoredPuzzle)

/**
 * A 4x4 with two genuinely different completions.
 *
 * Found by enumerating all 36 tilings of a 4x4 and looking for two that agree on every
 * column and row total: `[[1,1,0,2],[0,0,1,1],[0,2,0,0],[0,2,0,2]]` and
 * `[[0,2,1,1],[1,1,0,0],[0,0,0,2],[0,2,0,2]]` both give columns 1,5,1,5 and rows 4,2,2,4.
 * Nothing in the corpus looks like this -- the generator rejects a puzzle with two
 * solutions -- so it has to be built on purpose, and it must exist, because the code claims
 * an answer for it.
 */
const twoWays = (): StoredPuzzle => ({
    puzzleId: 'two-ways',
    board: Array.from({ length: 4 }, () => Array<number | null>(4).fill(null)),
    boardHorizontalNumbers: '1,5,1,5',
    boardVerticalNumbers: '4,2,2,4',
} as StoredPuzzle)

const TINY = definitionFrom(tiny())
const PAIR = definitionFrom(pair())
const TWO_WAYS = definitionFrom(twoWays())

/** The top row as one flat domino: legal, and fatal. */
const FLAT_TOP = [[0, 2], [null, null]]
const PLACE_FLAT_TOP = { cells: [[0, 0], [0, 1]], before: [null, null] } as const
const REMOVE_FLAT_TOP = { cells: [[0, 0], [0, 1]], before: [0, 2] } as const

/** A real 6x6 from the corpus, so the happy paths are not all 2x2 toys. */
const REAL = definitionFrom(generateDay('2026-09-01').easyBoards[0])

/** The board one step further back: what the walk sees after undoing `move`. */
const unapply = (board: (number | null)[][], move: ReplayMove) => {
    const next = board.map(row => [...row])
    move.cells.forEach(([i, j], index) => { next[i][j] = move.before[index] })
    return next
}

describe('checking a position', () => {
    it('says an untouched board can be finished', () => {
        expect(checkPosition(TINY, TINY.initialBoard)).toEqual({ kind: 'on-track' })
    })

    it('says a real board can be finished', () => {
        expect(checkPosition(REAL, REAL.initialBoard)).toEqual({ kind: 'on-track' })
    })

    it('says a correctly-played position can be finished', () => {
        const board = [[1, -1], [0, -1]]
        expect(checkPosition(TINY, board)).toEqual({ kind: 'solved' })
    })

    it('says a wrong position cannot', () => {
        // A legal move that ruins the puzzle -- not an illegal board. The distinction
        // matters: the placement rules already refuse malformed boards, so the only
        // position advice is ever asked about is a well-formed one.
        expect(checkPosition(PAIR, FLAT_TOP)).toMatchObject({ kind: 'wrong' })
    })

    it('does not report "wrong" when the budget ran out', () => {
        /*
         * The distinction the whole solver contract exists for. A search that stopped has
         * not judged the position, and calling that a mistake sends a player undoing moves
         * that were correct. A budget of zero visits nothing at all.
         */
        expect(checkPosition(REAL, REAL.initialBoard, { budget: 0 }))
            .toEqual({ kind: 'undetermined' })
    })

    it('refuses a board that is not a board of this puzzle', () => {
        // Unreachable from play -- which is why it is `unavailable` and not `wrong`. It
        // reports a broken puzzle, never a player mistake.
        const advice = checkPosition(TINY, [[null, null, null]])
        expect(advice.kind).toBe('unavailable')
    })
})

describe('how far back to undo', () => {
    /*
     * "Something is wrong" with twenty pieces down is the quit reason restated, not a
     * remedy. The spec offers the distance as optional; it is what makes the advice
     * actionable.
     */
    it('counts the undos back to a position that can still be finished', () => {
        // One bad domino, one undo. The stack is walked backwards over real history.
        expect(checkPosition(PAIR, FLAT_TOP, { moves: [PLACE_FLAT_TOP] }))
            .toEqual({ kind: 'wrong', undoSteps: 1 })
    })

    it('counts past a later move that did not help', () => {
        // Both rows flat: still well formed, still impossible, and two undos from a
        // position that can be finished.
        const moves: ReplayMove[] = [
            PLACE_FLAT_TOP,
            { cells: [[1, 0], [1, 1]], before: [null, null] },
        ]
        expect(checkPosition(PAIR, [[0, 2], [0, 2]], { moves }))
            .toEqual({ kind: 'wrong', undoSteps: 2 })
    })

    it('reports no distance rather than a wrong one when there is no history', () => {
        // Null is not zero, and must never be rendered as "undo 0 moves".
        expect(checkPosition(PAIR, FLAT_TOP, { moves: [] }))
            .toEqual({ kind: 'wrong', undoSteps: null })
    })

    it('is right about a history where solvability is not monotone', () => {
        /*
         * The reason this is a backwards walk and not a bisection over prefixes.
         *
         * Place the flat (unsolvable), remove it (solvable again), place it back
         * (unsolvable). Prefix 1 is unsolvable, prefix 2 is *solvable*, prefix 3 is
         * unsolvable -- so the sequence a binary search would need to be sorted is not.
         * A search for "the first prefix that breaks" answers 1, i.e. "undo all three".
         * The truth is one undo, and that is what walking real history backwards gives.
         */
        const moves: ReplayMove[] = [PLACE_FLAT_TOP, REMOVE_FLAT_TOP, PLACE_FLAT_TOP]
        expect(checkPosition(PAIR, FLAT_TOP, { moves }))
            .toEqual({ kind: 'wrong', undoSteps: 1 })
    })

    it('puts a removed domino back on the way past it', () => {
        /*
         * A removal in the middle of the walk, where stepping over it has to *restore* a
         * domino rather than clear one. Placed correctly, removed, then ruined: the way
         * back runs through the position that had the correct domino in it.
         */
        const moves: ReplayMove[] = [
            { cells: [[0, 0], [1, 0]], before: [null, null] },   // upright, correct
            { cells: [[0, 0], [1, 0]], before: [1, 0] },         // removed again
            PLACE_FLAT_TOP,                                      // and ruined
        ]
        expect(checkPosition(PAIR, FLAT_TOP, { moves }))
            .toEqual({ kind: 'wrong', undoSteps: 1 })
    })

    it('never writes through the board it was given', () => {
        // The walk copies before it steps back. Anything else would have advice quietly
        // undoing the player's moves for them.
        const board = FLAT_TOP.map(row => [...row])
        const before = JSON.stringify(board)
        checkPosition(PAIR, board, { moves: [PLACE_FLAT_TOP] })
        expect(JSON.stringify(board)).toBe(before)
    })

    it('never writes through the moves it was given', () => {
        const moves: ReplayMove[] = [PLACE_FLAT_TOP]
        const before = JSON.stringify(moves)
        checkPosition(PAIR, FLAT_TOP, { moves })
        expect(JSON.stringify(moves)).toBe(before)
    })

    it('gives up rather than overspending when the budget is nearly gone', () => {
        // A budget large enough to reach a verdict and too small to walk back on.
        const advice = checkPosition(PAIR, FLAT_TOP, { budget: 1, moves: [PLACE_FLAT_TOP] })
        expect(['undetermined', 'wrong']).toContain(advice.kind)
        if (advice.kind === 'wrong') expect(advice.undoSteps).toBeNull()
    })
})

describe('what the walk back costs', () => {
    /*
     * Three properties that the *answer* cannot show, and that a mutation sweep proved were
     * untested: stopping at a position with several completions, spending only the budget
     * it was given, and giving up after a bounded number of probes. Each is about work
     * done on the UI thread during a button press, so each is checked directly rather than
     * inferred from what came back.
     */

    it('stops at a position with several completions', () => {
        /*
         * "Can this still be finished" is the question, and a board with two completions
         * is emphatically one that can. Requiring a *unique* completion would walk the
         * player further back than they need to go, or past the answer entirely.
         */
        const board = TWO_WAYS.initialBoard.map(row => [...row])
        board[2][0] = 1
        board[3][0] = 0   // in neither of the two completions, so nothing finishes from here
        expect(solve(TWO_WAYS, { board }).kind).toBe('unsolvable')

        const moves: ReplayMove[] = [{ cells: [[2, 0], [3, 0]], before: [null, null] }]
        expect(stepsBackToSolvable(TWO_WAYS, board, moves, 10_000).steps).toBe(1)
        expect(solve(TWO_WAYS, { board: TWO_WAYS.initialBoard }).kind).toBe('multiple')
    })

    it('spends only the budget it was given, and says what it spent', () => {
        /*
         * The bound is the guarantee. Without deducting each probe's cost the walk can
         * spend a whole budget *per probe* -- twenty of them -- which is the difference
         * between a button press and a pause. Neither overspending nor mis-reporting shows
         * up in `steps`, which is why that mutation survived until this existed.
         */
        const empty = REAL.initialBoard.map(row => [...row])
        const solution = solve(REAL, { board: empty })
        expect(solution.kind).toBe('solved')
        if (solution.kind !== 'solved') return

        // Two placements that are not part of the solution, found rather than hardcoded.
        const wrong: { cells: [number, number][], at: [number, number] }[] = []
        for (let i = 0; i + 1 < REAL.size && wrong.length < 2; i++) {
            for (let j = 0; j < REAL.size && wrong.length < 2; j++) {
                if (empty[i][j] !== null || empty[i + 1][j] !== null) continue
                if (solution.solution[i][j] === 1 && solution.solution[i + 1][j] === 0) continue
                if (wrong.some(w => w.at[1] === j)) continue
                wrong.push({ cells: [[i, j], [i + 1, j]], at: [i, j] })
            }
        }
        expect(wrong).toHaveLength(2)

        const board = empty.map(row => [...row])
        const moves: ReplayMove[] = wrong.map(({ cells }) => {
            const [[ai, aj], [bi, bj]] = cells
            board[ai][aj] = 1
            board[bi][bj] = 0
            return { cells, before: [null, null] }
        })

        const verdict = solve(REAL, { board })
        expect(verdict.kind).toBe('unsolvable')
        if (verdict.kind !== 'unsolvable') return

        // Enough to judge the position and take one probe, not enough to finish the walk.
        const afterFirstProbe = solve(REAL, { board: unapply(board, moves[1]) })
        const budget = (afterFirstProbe as { nodes: number }).nodes + 5

        const walk = stepsBackToSolvable(REAL, board, moves, budget)
        expect(walk.nodes).toBeGreaterThan(0)      // it accounts for what it used
        expect(walk.nodes).toBeLessThanOrEqual(budget)
        expect(walk.steps).toBeNull()              // and it stopped rather than overspending
    })

    it('gives up after a bounded number of probes', () => {
        /*
         * The budget is not the only limit that matters: on a small board every probe is
         * nearly free, so a long history would be walked in full. Twenty is the cap, and
         * the twenty-first step is not taken even when the answer is sitting there.
         */
        const noop: ReplayMove = { cells: [[0, 0], [0, 1]], before: [0, 2] }
        const moves: ReplayMove[] = [
            PLACE_FLAT_TOP,                                  // oldest: undoing this fixes it
            ...Array.from({ length: MAX_PROBES + 4 }, () => noop),
        ]
        expect(stepsBackToSolvable(PAIR, FLAT_TOP, moves, 10_000).steps).toBeNull()

        // And with the answer inside the cap, it is found -- so the test above is not
        // passing because the walk is broken.
        const withinReach: ReplayMove[] = [PLACE_FLAT_TOP, ...Array.from({ length: 3 }, () => noop)]
        expect(stepsBackToSolvable(PAIR, FLAT_TOP, withinReach, 10_000).steps).toBe(4)
    })
})

describe('hinting', () => {
    it('reveals the first empty cell and what belongs in it', () => {
        expect(hintFor(TINY, TINY.initialBoard)).toEqual({ kind: 'hint', cell: [0, 0], value: 1 })
    })

    it('is deterministic: the same board gives the same cell', () => {
        // A hint that moved between presses would read as the game changing its mind.
        expect(hintFor(REAL, REAL.initialBoard)).toEqual(hintFor(REAL, REAL.initialBoard))
    })

    it('skips cells that are already filled', () => {
        const board = REAL.initialBoard.map(row => [...row])
        const first = hintFor(REAL, board)
        expect(first.kind).toBe('hint')
        if (first.kind !== 'hint') return
        const solution = [first.cell[0], first.cell[1]] as const

        // Fill the hinted domino the way the solver would, then ask again.
        board[solution[0]][solution[1]] = first.value
        if (first.value === 1) board[solution[0] + 1][solution[1]] = 0
        else board[solution[0]][solution[1] + 1] = 2

        const second = hintFor(REAL, board)
        expect(second.kind).toBe('hint')
        if (second.kind === 'hint') expect(second.cell).not.toEqual(first.cell)
    })

    it('says a piece is wrong rather than pointing anywhere', () => {
        expect(hintFor(PAIR, FLAT_TOP)).toMatchObject({ kind: 'wrong' })
    })

    it('does not guess when the budget ran out', () => {
        expect(hintFor(REAL, REAL.initialBoard, { budget: 0 }))
            .toEqual({ kind: 'undetermined' })
    })

    it('reports a finished board as finished', () => {
        expect(hintFor(TINY, [[1, -1], [0, -1]])).toEqual({ kind: 'solved' })
    })

    it('reveals nothing when more than one completion exists', () => {
        /*
         * The claim a hint makes is that *every* completion fills the cell this way, and
         * only the solver's `solved` verdict establishes that -- it looked for a second
         * completion and there was not one. With `multiple` the solver stopped at two, so
         * two that happen to agree prove nothing about a third. Saying so is the honest
         * answer; picking a cell anyway would be a guess dressed as a fact.
         */
        expect(hintFor(TWO_WAYS, TWO_WAYS.initialBoard)).toEqual({ kind: 'no-forced-cell' })
    })

    it('still says an ambiguous position is on track', () => {
        // Nothing forced is not a complaint: Check and Hint give different answers here on
        // purpose, and only one of them is about a problem.
        expect(checkPosition(TWO_WAYS, TWO_WAYS.initialBoard)).toEqual({ kind: 'on-track' })
    })

    it('never writes through the board it was given', () => {
        const board = REAL.initialBoard.map(row => [...row])
        const before = JSON.stringify(board)
        hintFor(REAL, board)
        expect(JSON.stringify(board)).toBe(before)
    })
})

describe('what the player is told', () => {
    it('names a pip value as the half it is, not as a number', () => {
        // The board shows pips; "1" is a quiz, "the top half of an upright domino" is not.
        expect(adviceMessage({ kind: 'hint', cell: [2, 3], value: 1 }))
            .toBe('Row 3, column 4 holds the top half of an upright domino.')
    })

    it('counts rows and columns from one, the way the player does', () => {
        expect(adviceMessage({ kind: 'hint', cell: [0, 0], value: 2 })).toContain('Row 1, column 1')
    })

    it('distinguishes "could not tell" from "wrong"', () => {
        const undetermined = adviceMessage({ kind: 'undetermined' })
        const wrong = adviceMessage({ kind: 'wrong', undoSteps: null })
        expect(undetermined).not.toBe(wrong)
        expect(undetermined).not.toMatch(/wrong/i)
        expect(adviceIsProblem({ kind: 'undetermined' })).toBe(false)
        expect(adviceIsProblem({ kind: 'wrong', undoSteps: null })).toBe(true)
    })

    it('never renders an unknown distance at all', () => {
        /*
         * Null is not zero and it is not a number. Found by mutation-testing: the first
         * version of this asserted only that no *digit* appeared, which "Undo null moves"
         * satisfies perfectly. What has to hold is that no instruction to undo a specific
         * amount is given when the amount is not known.
         */
        const message = adviceMessage({ kind: 'wrong', undoSteps: null })
        expect(message).not.toMatch(/\d/)
        expect(message).not.toMatch(/Undo/)
        expect(message).not.toMatch(/null|undefined|NaN/)
        expect(message).toMatch(/is wrong/)
    })

    it('says "move" for one and "moves" for more', () => {
        expect(adviceMessage({ kind: 'wrong', undoSteps: 1 })).toContain('Undo 1 move to')
        expect(adviceMessage({ kind: 'wrong', undoSteps: 3 })).toContain('Undo 3 moves to')
    })

    it('does not treat "nothing is forced" as a complaint', () => {
        const message = adviceMessage({ kind: 'no-forced-cell' })
        expect(message).toMatch(/more than one way/)
        expect(adviceIsProblem({ kind: 'no-forced-cell' })).toBe(false)
    })

    it('has something to say for every branch', () => {
        // A missing case would render an empty live region, which announces nothing at all.
        const every = [
            { kind: 'solved' }, { kind: 'on-track' }, { kind: 'no-forced-cell' },
            { kind: 'hint', cell: [0, 0] as const, value: 0 },
            { kind: 'wrong', undoSteps: null }, { kind: 'wrong', undoSteps: 2 },
            { kind: 'undetermined' },
            { kind: 'unavailable', reason: 'shape' as const, detail: 'x' },
        ] as const
        for (const advice of every) expect(adviceMessage(advice).length).toBeGreaterThan(0)
    })
})
