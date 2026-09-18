import { describe, it, expect } from 'vitest'
import { definitionFrom, type PuzzleDefinition } from '@/app/stores/PuzzleDefinition'
import { isBoardFull, targetsMatch } from '@/app/stores/boardRules'
import { solve, DEFAULT_NODE_BUDGET, type SolverResult } from '@/app/stores/solver'

/**
 * The production solver's contract (spec P1-6, row 18b).
 *
 * The thing under test is not "can it solve a board" -- `e2e/solve.ts` could already do that
 * -- but whether each answer means what it says. Check and hint (row 18e) give different
 * advice for `unsolvable` and `budget-exhausted`, so a solver that blurs them tells the
 * player their board is ruined when in truth nobody looked hard enough.
 *
 * Every fixture's node count below was measured, not guessed, so the budget boundaries are
 * exact rather than approximate.
 */

const square = (n: number): (number | null)[][] =>
    Array.from({ length: n }, () => Array(n).fill(null))

/** Build a definition the way the app does, from data in the file's own format. */
const puzzle = (board: (number | null)[][], columns: string, rows: string): PuzzleDefinition =>
    definitionFrom({
        puzzleId: 'fixture', board,
        boardHorizontalNumbers: columns, boardVerticalNumbers: rows,
    })

/*
 * Measured fixtures on a 4x4 with no rocks.
 *
 *   UNIQUE   columns 2,2,2,2 / rows 4,0,4,0   one completion,  proven in 16 nodes
 *            (the first completion is reached at node 9, so budgets 9..15 hold a solution
 *            without having settled uniqueness -- the case the contract is strictest about)
 *   MANY     columns 1,5,1,5 / rows 4,2,2,4   two completions, second reached at node 20
 */
const UNIQUE = () => puzzle(square(4), '2,2,2,2', '4,0,4,0')
const UNIQUE_NODES = 16
const UNIQUE_FIRST_SOLUTION_AT = 9
const MANY = () => puzzle(square(4), '1,5,1,5', '4,2,2,4')
const MANY_NODES = 20

/** Judge a board by the app's own rules rather than by the solver's say-so. */
const isRealCompletion = (board: (number | null)[][], definition: PuzzleDefinition) =>
    isBoardFull(board, definition.size) && targetsMatch(board, definition)

describe('solved', () => {
    it('reports a unique completion, and the completion is one the app accepts', () => {
        const definition = UNIQUE()
        const result = solve(definition)

        expect(result.kind).toBe('solved')
        if (result.kind !== 'solved') return
        expect(isRealCompletion(result.solution, definition)).toBe(true)
        expect(result.nodes).toBe(UNIQUE_NODES)
    })

    it('accepts a board that is already finished', () => {
        // The degenerate case a hint has to survive: the player asks after their last move.
        const definition = UNIQUE()
        const finished = solve(definition)
        if (finished.kind !== 'solved') throw new Error('fixture is not solvable')

        const again = solve(definition, { board: finished.solution })
        expect(again.kind).toBe('solved')
        // One node: the search looks for an empty cell, finds none, and is done.
        expect(again.kind === 'solved' && again.nodes).toBe(1)
        expect(again.kind === 'solved' && again.solution).toEqual(finished.solution)
    })

    it('is deterministic: the same position gives the same answer and the same node count', () => {
        // Branch order is fixed (first empty cell, vertical before horizontal), which is what
        // makes the budget boundaries below reproducible rather than incidental.
        const first = solve(UNIQUE())
        const second = solve(UNIQUE())
        expect(second).toEqual(first)
    })
})

describe('multiple', () => {
    it('reports two genuinely different completions', () => {
        const definition = MANY()
        const result = solve(definition)

        expect(result.kind).toBe('multiple')
        if (result.kind !== 'multiple') return

        const [first, second] = result.solutions
        expect(isRealCompletion(first, definition), 'first is not a real completion').toBe(true)
        expect(isRealCompletion(second, definition), 'second is not a real completion').toBe(true)
        // Two *different* boards. A solver that returned the same one twice would satisfy a
        // weaker assertion and be useless to the generator, which rejects on this verdict.
        expect(first).not.toEqual(second)
    })

    it('stops at the second solution instead of counting them all', () => {
        /*
         * The property that separates this from `solutionsByTargets`, which the generator
         * used to rely on. Once two completions exist the verdict cannot change, so the
         * search must return -- and the evidence is that raising the budget fifty-fold buys
         * no extra nodes. If it kept going, `nodes` would climb with the budget.
         */
        const definition = MANY()
        const exact = solve(definition, { budget: MANY_NODES })
        const generous = solve(definition, { budget: MANY_NODES * 50 })
        const enormous = solve(definition, { budget: DEFAULT_NODE_BUDGET })

        expect(exact.kind).toBe('multiple')
        expect(exact.kind === 'multiple' && exact.nodes).toBe(MANY_NODES)
        expect(generous).toEqual(exact)
        expect(enormous).toEqual(exact)
    })

    it('needs one node less than it has to reach the second solution', () => {
        // The boundary, from the other side: a budget one short of the second solution is not
        // `multiple`, it is unknown -- with the first solution in hand.
        const result = solve(MANY(), { budget: MANY_NODES - 1 })
        expect(result.kind).toBe('budget-exhausted')
        expect(result.kind === 'budget-exhausted' && result.solutionsFound).toBe(1)
    })
})

describe('unsolvable', () => {
    it('reports a position with no completion at all', () => {
        // Nine playable cells; a domino covers two.
        const result = solve(puzzle(square(3), '0,0,0', '0,0,0'))
        expect(result.kind).toBe('unsolvable')
    })

    it('rejects a position already past its target without searching at all', () => {
        /*
         * Row 1's target is 0, and the player has put a domino in it. No completion can
         * remove pips, so the pre-search line check settles it and `nodes` is 0.
         *
         * I first wrote this fixture as an empty board with every target 0 and asserted the
         * same thing; it is wrong. An empty line summing 0 against a target of 0 is not yet
         * violated -- it still has empty cells -- so that board is refused one node in, at
         * the first placement, not before. Corrected below rather than dropped, because the
         * difference is exactly what the pre-search check does and does not buy.
         */
        const played = square(4)
        played[1][0] = 0
        played[1][1] = 2

        const result = solve(UNIQUE(), { board: played })
        expect(result.kind).toBe('unsolvable')
        expect(result.kind === 'unsolvable' && result.nodes).toBe(0)
    })

    it('prunes an empty board whose targets no placement can respect', () => {
        // Every target 0, so the first domino placed breaks a line. One node: the root, whose
        // two branches are both refused.
        const result = solve(puzzle(square(4), '0,0,0,0', '0,0,0,0'))
        expect(result.kind).toBe('unsolvable')
        expect(result.kind === 'unsolvable' && result.nodes).toBe(1)
    })

    it('reports a partly played board that can no longer be finished', () => {
        /*
         * Not an invalid board -- a perfectly legal position that the player has ruined. The
         * distinction matters: `invalid` would tell them their save is corrupt, when what
         * they need to hear is that a move was wrong.
         */
        const definition = UNIQUE()
        const wrong = square(4)
        // A horizontal domino in the top-left. The unique solution starts with a vertical
        // one there, so this forecloses it.
        wrong[0][0] = 0
        wrong[0][1] = 2

        const result = solve(definition, { board: wrong })
        expect(result.kind).toBe('unsolvable')
    })
})

describe('budget-exhausted', () => {
    it('never reports a found solution as solved when uniqueness was not settled', () => {
        /*
         * The central rule. At these budgets a completion is in hand -- `solutionsFound` says
         * so -- and the search has not finished looking. Calling that `solved` would tell the
         * generator a board is unique when it may have two answers, and tell a player their
         * board is finished when it may not be.
         */
        for (let budget = UNIQUE_FIRST_SOLUTION_AT; budget < UNIQUE_NODES; budget++) {
            const result = solve(UNIQUE(), { budget })
            expect(result.kind, `budget ${budget}`).toBe('budget-exhausted')
            expect(result.kind === 'budget-exhausted' && result.solutionsFound).toBe(1)
        }
    })

    it('distinguishes finding nothing from finding one', () => {
        const nothingYet = solve(UNIQUE(), { budget: UNIQUE_FIRST_SOLUTION_AT - 1 })
        expect(nothingYet.kind).toBe('budget-exhausted')
        expect(nothingYet.kind === 'budget-exhausted' && nothingYet.solutionsFound).toBe(0)

        const oneSoFar = solve(UNIQUE(), { budget: UNIQUE_FIRST_SOLUTION_AT })
        expect(oneSoFar.kind === 'budget-exhausted' && oneSoFar.solutionsFound).toBe(1)
    })

    it('spends exactly the budget it was given, and reports it back', () => {
        const result = solve(UNIQUE(), { budget: 5 })
        expect(result.kind).toBe('budget-exhausted')
        expect(result.kind === 'budget-exhausted' && result.nodes).toBe(5)
        expect(result.kind === 'budget-exhausted' && result.budget).toBe(5)
    })

    it('searches nothing at all on a budget of zero', () => {
        // The documented floor: a node is counted on entry, so a budget of zero cannot even
        // enter the root.
        const result = solve(UNIQUE(), { budget: 0 })
        expect(result.kind).toBe('budget-exhausted')
        expect(result.kind === 'budget-exhausted' && result.nodes).toBe(0)
        expect(result.kind === 'budget-exhausted' && result.solutionsFound).toBe(0)
    })

    it('is not reached when the position is refused before any search', () => {
        // A budget of zero still gives a straight answer when one is available without
        // searching, because the line check runs first. Unknown is a last resort, not the
        // default for "I was not allowed to look".
        const played = square(4)
        played[1][0] = 0
        played[1][1] = 2

        const result = solve(UNIQUE(), { board: played, budget: 0 })
        expect(result.kind).toBe('unsolvable')
    })
})

describe('the exact budget boundary', () => {
    /*
     * The documented semantics: a node is one visit to a search state, counted on entry, and
     * the budget is an exact ceiling. A search needing N nodes succeeds at N and is exhausted
     * at N - 1. Off-by-one here would be invisible in ordinary use and would quietly turn
     * "proven unique" into "probably unique".
     */

    it('succeeds at exactly the number of nodes the search needs', () => {
        const result = solve(UNIQUE(), { budget: UNIQUE_NODES })
        expect(result.kind).toBe('solved')
        expect(result.kind === 'solved' && result.nodes).toBe(UNIQUE_NODES)
    })

    it('is exhausted one node short', () => {
        const result = solve(UNIQUE(), { budget: UNIQUE_NODES - 1 })
        expect(result.kind).toBe('budget-exhausted')
        expect(result.kind === 'budget-exhausted' && result.nodes).toBe(UNIQUE_NODES - 1)
    })

    it('spends no more than it needs when given more', () => {
        const result = solve(UNIQUE(), { budget: UNIQUE_NODES + 1_000 })
        expect(result.kind === 'solved' && result.nodes).toBe(UNIQUE_NODES)
    })

    it('throws RangeError for a budget that is not a count', () => {
        // Not an `invalid` result: `invalid` describes the position, and the position here is
        // fine. A negative budget is a bug in the caller, and the generator throws for the
        // same class of mistake (P1-6).
        for (const budget of [-1, 1.5, NaN, Infinity]) {
            expect(() => solve(UNIQUE(), { budget }), `budget ${budget}`).toThrow(RangeError)
        }
    })
})

describe('invalid', () => {
    const reasonFor = (result: SolverResult) =>
        result.kind === 'invalid' ? result.reason : `not invalid: ${result.kind}`

    it('rejects a board of the wrong size', () => {
        expect(reasonFor(solve(UNIQUE(), { board: square(3) }))).toBe('shape')
        expect(reasonFor(solve(UNIQUE(), { board: [] }))).toBe('shape')
    })

    it('rejects a board with too many rows, which would otherwise be solved', () => {
        /*
         * The row *count* check earns its place here and nowhere else. Every other malformed
         * shape is caught a second time further down -- a short board trips the per-row width
         * check, a hole trips `Array.isArray` -- but a board with an extra full-width row
         * passes all of those, because the loop only ever looks at the first `size` rows.
         *
         * Measured with the check removed: this returns `solved`, silently ignoring the
         * extra row. Mutation-testing found it; asserting `reason === 'shape'` on the short
         * board did not, because the short board is refused either way.
         */
        const tall = [...square(4), Array(4).fill(null)]
        expect(reasonFor(solve(UNIQUE(), { board: tall }))).toBe('shape')
    })

    it('rejects something that is not an array at all', () => {
        // Also load-bearing: without the `Array.isArray` half, indexing a string with `in`
        // throws a TypeError out of the solver instead of returning a verdict.
        expect(reasonFor(solve(UNIQUE(), { board: 'not a board' as never }))).toBe('shape')
        expect(reasonFor(solve(UNIQUE(), { board: null as never }))).toBe('shape')
    })

    it('rejects a ragged board', () => {
        const ragged = square(4)
        ragged[2] = [null, null]
        expect(reasonFor(solve(UNIQUE(), { board: ragged }))).toBe('shape')
    })

    it('rejects a sparse board, which reads as empty cells but is not one', () => {
        /*
         * `[ , , , ]` has length 4 and yields `undefined` on every read, so a check written
         * with `.every()` would skip the holes entirely and call it a board of empty cells.
         * The same trap `isBoardFull` documents.
         */
        const sparse: (number | null)[][] = square(4)
        sparse[1] = [null, , null, null] as (number | null)[]
        expect(reasonFor(solve(UNIQUE(), { board: sparse }))).toBe('shape')

        // A missing row is caught by the same `Array.isArray` check that catches a row of
        // the wrong type: a hole reads as `undefined`. There used to be a separate `i in
        // board` guard above it; mutation-testing showed deleting it changed no answer, so
        // it is gone and this asserts the behaviour that is actually load-bearing.
        const missingRow = square(4)
        delete missingRow[2]
        expect(reasonFor(solve(UNIQUE(), { board: missingRow }))).toBe('shape')
    })

    it('rejects a cell holding a value this game has no piece for', () => {
        for (const value of [3, 99, -2, 0.5]) {
            const board = square(4)
            board[1][1] = value
            expect(reasonFor(solve(UNIQUE(), { board })), `cell value ${value}`).toBe('cell-value')
        }
    })

    it('rejects rocks that disagree with the definition', () => {
        const rocked = puzzle([
            [-1, null, null, null],
            [null, null, null, null],
            [null, null, null, null],
            [null, null, null, null],
        ], '2,2,2,2', '4,0,4,0')

        // A board missing the definition's rock.
        expect(reasonFor(solve(rocked, { board: square(4) }))).toBe('rocks')

        // And a board with a rock the definition does not have.
        const extra = square(4)
        extra[3][3] = -1
        expect(reasonFor(solve(UNIQUE(), { board: extra }))).toBe('rocks')
    })

    it('rejects a half-domino with no partner', () => {
        // A `1` needs a `0` directly below it.
        const orphan = square(4)
        orphan[0][0] = 1
        expect(reasonFor(solve(UNIQUE(), { board: orphan }))).toBe('pairing')

        // A `2` needs a `0` directly to its left.
        const other = square(4)
        other[0][1] = 2
        expect(reasonFor(solve(UNIQUE(), { board: other }))).toBe('pairing')
    })

    it('rejects a square claimed by two dominoes at once', () => {
        // A `0` with a `1` above it and a `2` to its right belongs to both.
        const shared = square(4)
        shared[0][1] = 1
        shared[1][1] = 0
        shared[1][2] = 2
        expect(reasonFor(solve(UNIQUE(), { board: shared }))).toBe('pairing')
    })

    it('rejects targets that are not one integer per line', () => {
        // The D10-j encoding itself: digits run together instead of comma-separated.
        expect(reasonFor(solve(puzzle(square(4), '2222', '4,0,4,0')))).toBe('targets')
        // Too few, too many, empty fields, and non-numbers.
        for (const spec of ['2,2,2', '2,2,2,2,2', '2,2,,2', '2,2,2,x', 'a,b,c,d', '']) {
            expect(reasonFor(solve(puzzle(square(4), spec, '4,0,4,0'))), `columns ${JSON.stringify(spec)}`)
                .toBe('targets')
        }
        // And the row axis is checked too, not only the column one.
        expect(reasonFor(solve(puzzle(square(4), '2,2,2,2', '4,0,4')))).toBe('targets')
    })

    it('rejects non-canonical and negative target spellings', () => {
        // `Number` would happily take all of these; the round trip does not. Data that only
        // one reader understands is how D10-j survived as long as it did.
        for (const spec of ['02,2,2,2', '+2,2,2,2', '-2,2,2,2', '2.0,2,2,2', '2e1,2,2,2', ' 2,2,2,2']) {
            expect(reasonFor(solve(puzzle(square(4), spec, '4,0,4,0'))), `columns ${JSON.stringify(spec)}`)
                .toBe('targets')
        }
    })

    it('never searches when the input is refused', () => {
        // No `nodes` on an invalid result, because nothing was looked at. The type says so;
        // this pins that it is true of the value as well.
        const result = solve(UNIQUE(), { board: square(3) })
        expect(result).toEqual({ kind: 'invalid', reason: 'shape', detail: expect.any(String) })
    })
})

describe('partly played boards', () => {
    it('treats a placed domino as fixed, not as a suggestion', () => {
        /*
         * A hint is asked about the board the player has. If the solver were free to move
         * what is already down, it would answer a question nobody asked -- and on this
         * fixture it could still return the unique completion while ignoring the input
         * entirely, which is why the placed domino is one the solution does *not* contain.
         */
        const definition = MANY()
        const started = square(4)
        // From the second of the two completions: a horizontal domino across the top-left.
        started[0][0] = 0
        started[0][1] = 2

        const result = solve(definition, { board: started })
        expect(result.kind).toBe('solved')
        if (result.kind !== 'solved') return

        // The placed domino survives untouched, and the board is a real completion.
        expect(result.solution[0][0]).toBe(0)
        expect(result.solution[0][1]).toBe(2)
        expect(isRealCompletion(result.solution, definition)).toBe(true)

        // And it collapsed an ambiguous puzzle to one answer: without the domino this
        // position has two completions, so the constraint is doing the work.
        expect(solve(definition).kind).toBe('multiple')
    })

    it('does not mutate the board it was given', () => {
        const definition = UNIQUE()
        const started = square(4)
        started[0][0] = 1
        started[1][0] = 0
        const before = JSON.stringify(started)

        solve(definition, { board: started })
        expect(JSON.stringify(started)).toBe(before)
    })

    it('does not mutate a frozen board, which is what the definition hands it', () => {
        // The default board *is* `definition.initialBoard`, which `definitionFrom` freezes.
        // A solver that wrote into its input would throw here in strict mode rather than
        // silently corrupting the puzzle every other player shares.
        const definition = UNIQUE()
        expect(() => solve(definition)).not.toThrow()
        expect(definition.initialBoard.flat().every(cell => cell === null)).toBe(true)
    })

    it('returns a solution that does not alias the input', () => {
        /*
         * Sharing a row array with the caller would be a latent corruption: the search
         * mutates its working board throughout, and a caller holding one of those rows would
         * watch its contents change under it.
         */
        const definition = UNIQUE()
        const started = square(4)
        const result = solve(definition, { board: started })
        if (result.kind !== 'solved') throw new Error('fixture is not solvable')

        for (const row of result.solution) {
            expect(started).not.toContain(row)
            expect(definition.initialBoard).not.toContain(row)
        }

        // Writing to the answer must not reach back into the board that produced it.
        result.solution[0][0] = 99
        expect(started[0][0]).toBeNull()
    })

    it('returns two solutions that do not alias each other', () => {
        const result = solve(MANY())
        if (result.kind !== 'multiple') throw new Error('fixture is not ambiguous')

        result.solutions[0][0][0] = 99
        expect(result.solutions[1][0][0]).not.toBe(99)
    })
})
