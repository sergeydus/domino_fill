import type { Board } from "./boardRules"
import type { Cell } from "./placement"
import type { PuzzleDefinition } from "./PuzzleDefinition"
import { DEFAULT_NODE_BUDGET, solve, type InvalidReason } from "./solver"

/**
 * Check and Hint (spec P1-5, row 18e).
 *
 * The #1 quit reason in a deduction puzzle is a dead end with twenty pieces down, and until
 * now the game had nothing to say about it. What it says has to be **true**, which is most
 * of the design here: the spec is explicit that "cheap because boards are single-solution"
 * is misleading, and it is worth restating why, because both traps are easy to walk into.
 *
 * *Uniqueness is a property of the empty board.* It says nothing about an arbitrary
 * partially-wrong position. A board can be globally unsolvable with **no individually
 * unsatisfiable line**, so "flag the first impossible line" is not even well defined; and a
 * "forced move" from a wrong position may not exist at all. So every answer here comes from
 * running the real solver over the real position, and nothing is inferred from the fact that
 * the puzzle *started* with one solution.
 *
 * Everything is pure and takes the board as an argument. The session calls in; nothing calls
 * out. That is what makes "advice never mutates the board" a property of the module rather
 * than a discipline to be maintained at each call site.
 *
 * **Built on `app/stores/solver.ts` and nothing else.** `e2e/solve.ts` answers one question
 * for a test, from an empty board, where a solution is known to exist; it has no budget, no
 * answer for an unsolvable position and no notion of uniqueness. It is not, and must not
 * become, a player-facing solver.
 */

export type Advice =
    /** Already finished. Neither action has anything to say. */
    | { readonly kind: 'solved' }
    /** A completion exists from here. Nothing is revealed; this is Check's good answer. */
    | { readonly kind: 'on-track' }
    /** One cell every completion fills the same way, and what it holds. */
    | { readonly kind: 'hint', readonly cell: Cell, readonly value: number }
    /** Solvable, but more than one way: nothing is forced, so there is nothing to reveal. */
    | { readonly kind: 'no-forced-cell' }
    /**
     * No completion from here: something placed is wrong.
     *
     * `undoSteps` is how many times Undo reaches a position that can still be finished, or
     * null when that could not be established. Null is not "zero" and must not be shown as
     * advice — see `stepsBackToSolvable`.
     */
    | { readonly kind: 'wrong', readonly undoSteps: number | null }
    /** The search budget ran out. Honestly not the same answer as "wrong". */
    | { readonly kind: 'undetermined' }
    /** The solver refused the position outright. A bug here, not a player mistake. */
    | { readonly kind: 'unavailable', readonly reason: InvalidReason, readonly detail: string }

/** One entry of the undo stack, as far as advice is concerned. */
export type ReplayMove = {
    readonly cells: readonly Cell[]
    readonly before: readonly (number | null)[]
}

export type AdviceOptions = {
    /** Total nodes this call may spend, across every solver run it makes. */
    budget?: number
    /** The undo stack, oldest first. Only used to answer "how far back". */
    moves?: readonly ReplayMove[]
}

/**
 * How many Undos reach a position that can still be finished.
 *
 * The spec offers this as optional — "optionally naming the earliest move that breaks
 * solvability, via the undo stack" — and it is the difference between advice a player can
 * act on and advice they cannot. "Something is wrong" with twenty pieces down is the quit
 * reason restated, not a remedy.
 *
 * **Walked backwards, one move at a time, rather than searched.** Binary search over the
 * prefixes would be the obvious cheap trick and it is wrong here: the undo stack contains
 * *removals* as well as placements, so solvability is not monotone along it. Undoing a
 * removal puts a domino back. Walking real history backwards needs no such assumption.
 *
 * Bounded twice over, because an unsolvable 8x8 is the expensive case for the solver and
 * this asks it repeatedly. One budget is shared across the whole walk, and the walk itself
 * stops after `MAX_PROBES`. Either limit returns null, which reports as "something is
 * wrong" without a number — a smaller claim, not a wrong one.
 */
export const MAX_PROBES = 20

/**
 * Exported, and reporting what it spent, because the spend *is* the guarantee.
 *
 * "Never more than the budget" cannot be checked from the answer -- every overspend and
 * every underspend produce the same `steps` most of the time. Removing the line that
 * deducts each probe's cost survived a mutation sweep for exactly that reason, and the
 * behaviour it protects is real: without it the walk may spend `MAX_PROBES` budgets rather
 * than one, which on the UI thread is the difference between a button press and a pause.
 */
export const stepsBackToSolvable = (
    definition: PuzzleDefinition,
    board: Board,
    moves: readonly ReplayMove[],
    budget: number,
): { steps: number | null, nodes: number } => {
    let remaining = budget
    // A mutable copy: `board` belongs to the caller and is never written through.
    const working = board.map(row => [...row])

    const limit = Math.min(moves.length, MAX_PROBES)
    for (let step = 1; step <= limit; step++) {
        const move = moves[moves.length - step]
        move.cells.forEach(([i, j], index) => { working[i][j] = move.before[index] })

        if (remaining <= 0) break
        const result = solve(definition, { board: working, budget: remaining })
        if (result.kind === 'invalid') break
        remaining -= result.nodes
        /*
         * `multiple` counts. The question is "can this still be finished", and a position
         * with several completions is emphatically one that can -- walking past it would
         * send the player further back than they need to go, or report nothing at all.
         *
         * There is no separate `budget-exhausted` exit: exhaustion means the probe spent
         * exactly what it was given, so `remaining` is zero and the next turn of the loop
         * stops on the check above. Proven equivalent by fingerprinting, and the redundant
         * branch was deleted rather than given a test of its own.
         */
        if (result.kind === 'solved' || result.kind === 'multiple') {
            return { steps: step, nodes: budget - remaining }
        }
    }
    return { steps: null, nodes: budget - remaining }
}

/**
 * What the solver says about this position, with nothing revealed.
 *
 * Check's whole job. It deliberately does not distinguish one completion from many: the
 * player asked whether they are still in the game, and both answers are yes.
 */
export const checkPosition = (
    definition: PuzzleDefinition,
    board: Board,
    options: AdviceOptions = {},
): Advice => {
    const { budget = DEFAULT_NODE_BUDGET, moves = [] } = options
    const result = solve(definition, { board, budget })

    switch (result.kind) {
        case 'invalid':
            return { kind: 'unavailable', reason: result.reason, detail: result.detail }
        case 'budget-exhausted':
            // Not "wrong". The search stopped; the position was never judged.
            return { kind: 'undetermined' }
        case 'unsolvable':
            return {
                kind: 'wrong',
                undoSteps: stepsBackToSolvable(
                    definition, board, moves, Math.max(0, budget - result.nodes)).steps,
            }
        case 'solved':
            // A full board that solves is the finished puzzle, not advice about one.
            return board.every(row => row.every(cell => cell !== null))
                ? { kind: 'solved' }
                : { kind: 'on-track' }
        case 'multiple':
            return { kind: 'on-track' }
    }
}

/**
 * One cell, if one is forced.
 *
 * "Forced" means every completion fills it the same way, which is exactly what the solver's
 * `solved` verdict establishes: it searched for a second completion and there was not one.
 * A `multiple` verdict cannot support the claim — the solver stops at two solutions, so two
 * that happen to agree on a cell prove nothing about a third — and saying "no single move is
 * forced" is the honest answer rather than a guess dressed as a hint.
 *
 * The cell is the first empty one in row-major order. Deterministic on purpose: a hint that
 * moved around between presses of the same button would read as the game changing its mind.
 */
export const hintFor = (
    definition: PuzzleDefinition,
    board: Board,
    options: AdviceOptions = {},
): Advice => {
    const { budget = DEFAULT_NODE_BUDGET, moves = [] } = options
    const result = solve(definition, { board, budget })

    switch (result.kind) {
        case 'invalid':
            return { kind: 'unavailable', reason: result.reason, detail: result.detail }
        case 'budget-exhausted':
            return { kind: 'undetermined' }
        case 'unsolvable':
            return {
                kind: 'wrong',
                undoSteps: stepsBackToSolvable(
                    definition, board, moves, Math.max(0, budget - result.nodes)).steps,
            }
        case 'multiple':
            return { kind: 'no-forced-cell' }
        case 'solved': {
            for (let i = 0; i < board.length; i++) {
                for (let j = 0; j < board[i].length; j++) {
                    if (board[i][j] !== null) continue
                    return { kind: 'hint', cell: [i, j], value: result.solution[i][j] as number }
                }
            }
            // Nothing empty and it solves: the board is finished.
            return { kind: 'solved' }
        }
    }
}
