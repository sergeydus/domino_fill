import type { PuzzleDefinition } from "./PuzzleDefinition"
import { type Board, CELL_VALUES, wellFormed } from "./boardRules"

/**
 * The production solver (spec P1-6, row 18b).
 *
 * `e2e/solve.ts` is deliberately not promoted to this role and must not be. It answers one
 * question for a test — "find me any way to win this board, which is known to be winnable,
 * from empty" — and its answer to everything else is a thrown error. A solver the *player*
 * depends on has to say which of several different things went wrong, because check and hint
 * (row 18e) give different advice for each, and "there is no answer" and "I gave up looking"
 * are not the same message.
 *
 * So the contract is the result union below, and the rule that holds it together: **a result
 * is only as strong as what was actually proven.** `solved` claims the puzzle has exactly one
 * completion, which means the search ran out of places to look — not that it found one and
 * stopped. If the budget ran out first, that is `budget-exhausted` even with a solution in
 * hand, because the honest statement is "I found one and do not know whether there are
 * others".
 */

/** The default search ceiling. Comfortably above every shipped 8x8 board; see `nodes`. */
export const DEFAULT_NODE_BUDGET = 200_000

/**
 * Why an input was rejected outright.
 *
 * Distinct from `unsolvable`, which is a verdict about a legal position. These mean the
 * caller handed over something that is not a position at all. A board whose column sum is
 * already past its target is *not* invalid — it is a perfectly well-formed position that
 * happens to be lost, and saying otherwise would tell the player their board is corrupt when
 * they have merely made a mistake.
 */
export type InvalidReason =
    /** Not a size x size rectangle of cells, or sparse. */
    | 'shape'
    /** A cell holding something that is not a rock, a domino half, or empty. */
    | 'cell-value'
    /** Rocks that do not match the definition's — a different puzzle, or a tampered board. */
    | 'rocks'
    /** A domino half with no partner, or a square claimed by two dominoes at once. */
    | 'pairing'
    /** Targets that do not decode to one non-negative integer per line. */
    | 'targets'

export type SolverResult =
    /** Exactly one completion exists, and the search proved it by exhausting the space. */
    | { readonly kind: 'solved', readonly solution: (number | null)[][], readonly nodes: number }
    /** At least two completions exist. The search stopped the moment it found the second. */
    | {
        readonly kind: 'multiple',
        readonly solutions: readonly [(number | null)[][], (number | null)[][]],
        readonly nodes: number,
    }
    /** No completion exists. The search proved it by exhausting the space. */
    | { readonly kind: 'unsolvable', readonly nodes: number }
    /**
     * The budget ran out before the question could be answered.
     *
     * `solutionsFound` is 1 when a completion was found but uniqueness was not settled, and 0
     * when nothing was found at all. Neither is `solved` and neither is `unsolvable`: this
     * result means *unknown*, and a caller that reports it as either is lying to the player.
     */
    | {
        readonly kind: 'budget-exhausted',
        readonly nodes: number,
        readonly budget: number,
        readonly solutionsFound: 0 | 1,
    }
    /** The input was not a position. Nothing was searched. */
    | { readonly kind: 'invalid', readonly reason: InvalidReason, readonly detail: string }

export type SolveOptions = {
    /**
     * The position to solve from. Defaults to the definition's empty board.
     *
     * Dominoes already on it are **fixed constraints**, not suggestions: the search fills the
     * empty cells around them and never moves or removes one. That is what makes this usable
     * for a hint — the player asks about the board they have, not about a fresh one.
     */
    board?: Board
    /**
     * The maximum number of search nodes to visit.
     *
     * A node is one visit to a search state, counted on entry, and the budget is an exact
     * ceiling rather than an approximation: a search that needs exactly N nodes succeeds at
     * `budget: N` and is exhausted at `budget: N - 1`. `budget: 0` visits nothing and is
     * exhausted with `nodes: 0`.
     *
     * The count is reproducible for a given position because the branch order is fixed: the
     * first empty cell in row-major order, vertical before horizontal.
     */
    budget?: number
}

/**
 * Decode one axis of targets.
 *
 * Strict about the encoding on purpose. The defect this row exists to fix (D10-j) was a
 * generator emitting `"3104"` where the runtime read `"3,10,4"`, and it went unnoticed for
 * exactly as long as it did because both sides quietly tolerated whatever they were given.
 * One canonical decimal integer per line, exactly `size` of them, or the input is rejected
 * by name.
 */
const parseTargets = (spec: string, size: number): number[] | null => {
    if (typeof spec !== 'string') return null
    const parts = spec.split(',')
    if (parts.length !== size) return null

    const targets: number[] = []
    for (const part of parts) {
        // Shape before value: `Number('')` is 0 and `Number(' 1 ')` is 1, so a bare `Number`
        // would accept an empty field. The round trip then rejects "01", "+1" and "1e2".
        if (!/^\d+$/.test(part)) return null
        const value = Number(part)
        if (!Number.isSafeInteger(value) || String(value) !== part) return null
        targets.push(value)
    }
    return targets
}

type Validated = { board: (number | null)[][], columns: number[], rows: number[] }

const invalid = (reason: InvalidReason, detail: string): SolverResult =>
    ({ kind: 'invalid', reason, detail })

/**
 * Check the input is a position, and take the private copy the search will work on.
 *
 * The copy is made here rather than inside the search, so there is exactly one place where
 * the caller's board stops being reachable. Nothing downstream ever holds a reference to a
 * row the caller owns, which makes "never mutates the input" a structural property rather
 * than a promise to be careful.
 */
const validateInput = (definition: PuzzleDefinition, board: Board): Validated | SolverResult => {
    const size = definition.size

    if (!Number.isInteger(size) || size <= 0)
        return invalid('shape', `definition size must be a positive integer, got ${size}`)
    if (!Array.isArray(board) || board.length !== size)
        return invalid('shape', `expected ${size} rows, got ${Array.isArray(board) ? board.length : typeof board}`)

    const copy: (number | null)[][] = []
    for (let i = 0; i < size; i++) {
        // No `i in board` guard here. A hole reads as `undefined`, which `Array.isArray`
        // rejects on the next line with the same `shape` reason -- mutation-testing showed
        // the guard could be deleted without changing any answer, so it was.
        const row = board[i]
        if (!Array.isArray(row) || row.length !== size)
            return invalid('shape', `row ${i} should have ${size} cells, got ${Array.isArray(row) ? row.length : typeof row}`)

        const cells: (number | null)[] = []
        for (let j = 0; j < size; j++) {
            // This one is *not* redundant, unlike the row-level check above: a missing cell
            // reads as `undefined`, which the value check below would report as `cell-value`
            // -- "your board holds a piece that does not exist" rather than "your board has
            // a hole in it". Different reason, different advice.
            if (!(j in row)) return invalid('shape', `cell ${i},${j} is a hole in a sparse array`)
            const cell = row[j]
            if (cell !== null && !CELL_VALUES.includes(cell as number))
                return invalid('cell-value', `cell ${i},${j} holds ${JSON.stringify(cell)}, which is not a rock, a domino half or empty`)

            const isRock = cell === -1
            const shouldBeRock = definition.initialBoard[i][j] === -1
            if (isRock !== shouldBeRock)
                return invalid('rocks', `cell ${i},${j} ${isRock ? 'is' : 'is not'} a rock, but the definition says it ${shouldBeRock ? 'is' : 'is not'}`)

            cells.push(cell as number | null)
        }
        copy.push(cells)
    }

    // After shape and cell values, so it can index freely.
    if (!wellFormed(copy, size))
        return invalid('pairing', 'a placed domino half has no partner, or a square is claimed by two dominoes at once')

    const columns = parseTargets(definition.columnTargets, size)
    if (!columns)
        return invalid('targets', `column targets ${JSON.stringify(definition.columnTargets)} are not ${size} comma-separated non-negative integers`)
    const rows = parseTargets(definition.rowTargets, size)
    if (!rows)
        return invalid('targets', `row targets ${JSON.stringify(definition.rowTargets)} are not ${size} comma-separated non-negative integers`)

    return { board: copy, columns, rows }
}

/**
 * How many completions does this position have — none, one, or more than one?
 *
 * Returns as soon as the answer cannot change: on the second solution, or when the budget
 * runs out. It never enumerates every completion, which is what the generator used to do.
 */
export const solve = (definition: PuzzleDefinition, options: SolveOptions = {}): SolverResult => {
    const { board: input = definition.initialBoard, budget = DEFAULT_NODE_BUDGET } = options

    // A `RangeError`, not an `invalid` result. `invalid` describes the *position* — something
    // the caller may legitimately be holding and needs a verdict on. A budget of -1 is a bug
    // in the calling code, and the generator draws the same line for the same reason (P1-6):
    // configuration that no retry could fix throws, positions get answers.
    if (!Number.isInteger(budget) || budget < 0)
        throw new RangeError(`budget must be a non-negative integer, got ${budget}`)

    const checked = validateInput(definition, input)
    if ('kind' in checked) return checked
    const { board, columns, rows } = checked

    const size = definition.size
    const colSums = new Array<number>(size).fill(0)
    const rowSums = new Array<number>(size).fill(0)
    const colEmpty = new Array<number>(size).fill(0)
    const rowEmpty = new Array<number>(size).fill(0)

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = board[i][j]
            if (cell === null) { colEmpty[j]++; rowEmpty[i]++ }
            else if (cell !== -1) { colSums[j] += cell; rowSums[i] += cell }
        }
    }

    /**
     * Can this line still reach its target?
     *
     * Two ways it cannot: the sum is already past it, or the line has no empty cells left and
     * does not match. The second is what keeps the search small — a line is rejected the
     * moment it closes out wrong, rather than at the bottom of the tree.
     */
    const lineOk = (sum: number, empty: number, target: number) =>
        sum <= target && (empty > 0 || sum === target)

    // Every line, once, before searching. Thereafter only the lines a placement touched need
    // rechecking: sums and empty counts change nowhere else, and the search only ever
    // descends from a state already known to be consistent.
    for (let k = 0; k < size; k++) {
        if (!lineOk(colSums[k], colEmpty[k], columns[k])) return { kind: 'unsolvable', nodes: 0 }
        if (!lineOk(rowSums[k], rowEmpty[k], rows[k])) return { kind: 'unsolvable', nodes: 0 }
    }

    const solutions: (number | null)[][][] = []
    let nodes = 0
    let exhausted = false

    const put = (i: number, j: number, value: number) => {
        board[i][j] = value
        colSums[j] += value; rowSums[i] += value
        colEmpty[j]--; rowEmpty[i]--
    }
    const take = (i: number, j: number, value: number) => {
        board[i][j] = null
        colSums[j] -= value; rowSums[i] -= value
        colEmpty[j]++; rowEmpty[i]++
    }
    const okAround = (i: number, j: number) =>
        lineOk(colSums[j], colEmpty[j], columns[j]) && lineOk(rowSums[i], rowEmpty[i], rows[i])

    /**
     * `stop` unwinds the whole search: either the second solution is in hand, so no further
     * answer could change the verdict, or the budget is gone. Which of the two it was is read
     * off `solutions.length` and `exhausted` afterwards rather than signalled separately.
     */
    type Step = 'continue' | 'stop'

    const search = (from: number): Step => {
        if (nodes >= budget) { exhausted = true; return 'stop' }
        nodes++

        /*
         * Resume the scan instead of restarting it. A placement always fills the cell the
         * scan stopped at, so every cell before `from` is occupied at this depth — by
         * induction, since the parent passed its own cell's index plus one.
         *
         * This is an optimization and nothing more. Starting from 0 was measured across 259
         * positions — every target pair reachable on open 2x2, 4x4 and 5x5 boards, ten
         * generated puzzles, every one-domino partial position on each, and a full budget
         * sweep — and produced byte-identical results and node counts. It is kept because
         * 18c generates boards in bulk, not because anything depends on it for correctness.
         */
        let at = -1
        for (let k = from; k < size * size; k++) {
            if (board[(k / size) | 0][k % size] === null) { at = k; break }
        }

        if (at < 0) {
            // Full. Every line is closed, and a closed line that failed its target was
            // rejected when it closed, so this is a solution without rechecking anything.
            solutions.push(board.map(row => [...row]))
            return solutions.length >= 2 ? 'stop' : 'continue'
        }

        const i = (at / size) | 0
        const j = at % size

        // Vertical first, then horizontal. A fixed order, so `nodes` is reproducible.
        if (i + 1 < size && board[i + 1][j] === null) {
            put(i, j, 1); put(i + 1, j, 0)
            const step = okAround(i, j) && okAround(i + 1, j) ? search(at + 1) : 'continue'
            take(i + 1, j, 0); take(i, j, 1)
            if (step === 'stop') return 'stop'
        }

        if (j + 1 < size && board[i][j + 1] === null) {
            put(i, j, 0); put(i, j + 1, 2)
            const step = okAround(i, j) && okAround(i, j + 1) ? search(at + 1) : 'continue'
            take(i, j + 1, 2); take(i, j, 0)
            if (step === 'stop') return 'stop'
        }

        return 'continue'
    }

    search(0)

    // Order matters. `exhausted` outranks a single solution, because "I found one and stopped
    // looking" is not "there is exactly one" — reporting that as `solved` is the specific
    // dishonesty this contract exists to prevent.
    if (solutions.length >= 2)
        return { kind: 'multiple', solutions: [solutions[0], solutions[1]], nodes }
    if (exhausted)
        return { kind: 'budget-exhausted', nodes, budget, solutionsFound: solutions.length as 0 | 1 }
    if (solutions.length === 1)
        return { kind: 'solved', solution: solutions[0], nodes }
    return { kind: 'unsolvable', nodes }
}
