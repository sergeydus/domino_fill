/**
 * A solver, for the tests only.
 *
 * Row 14 deferred a browser test that actually *wins* a board, because winning a shipped
 * puzzle needs its solution and the project has no solver until P1-6. Hardcoding one is not
 * an option either: `getCurrentActiveBoard` picks the day's puzzle from the server's clock,
 * so the board under test changes daily and no fixture can name it.
 *
 * So the test solves whatever board is on screen. Plain backtracking over the first empty
 * cell, trying vertical then horizontal, pruned by the pip sums. Measured against all 18
 * shipped puzzles: every one solves, worst case 1ms.
 *
 * **This is not P1-6's solver and must not become it.** That one needs a defined contract —
 * a node budget, a timeout behaviour, an answer for unsolvable positions — because it
 * answers questions for the *player* (P1-5's check and hint). This one answers a single
 * question for a test, from the empty board, where a solution is known to exist.
 */

/** A board as the DOM reports it: rocks are -1, empty cells null. */
export type SolverBoard = (number | null)[][]

export type Placement = {
    /** The anchor cell: the top half of a vertical domino, the left half of a horizontal. */
    from: readonly [number, number]
    to: readonly [number, number]
    direction: 'down' | 'right'
}

/**
 * Solve, returning the placements in the order they should be made.
 *
 * Vertical dominoes are 1 on top and 0 below; horizontal are 0 on the left and 2 on the
 * right. The solver only ever anchors downward or rightward, which is enough to reach every
 * arrangement: every domino has exactly one top-or-left cell, and the scan finds it first.
 */
export const solve = (
    initial: SolverBoard,
    columnTargets: number[],
    rowTargets: number[],
    nodeBudget = 2_000_000,
): Placement[] | null => {
    const n = initial.length
    const board = initial.map(row => row.slice())
    const colSums = new Array<number>(n).fill(0)
    const rowSums = new Array<number>(n).fill(0)
    const placements: Placement[] = []
    let nodes = 0

    /** Cells still empty on each axis, so a finished line can be checked exactly. */
    const remaining = () => {
        const cols = new Array<number>(n).fill(0)
        const rows = new Array<number>(n).fill(0)
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (board[i][j] === null) { cols[j]++; rows[i]++ }
            }
        }
        return { cols, rows }
    }

    /**
     * Still consistent? A sum may not exceed its target, and a line with no empty cells
     * left must match it exactly. That second half is what makes this finish quickly:
     * a line is rejected the moment it is closed out wrong, not at the end of the search.
     */
    const consistent = () => {
        const { cols, rows } = remaining()
        for (let j = 0; j < n; j++) {
            if (colSums[j] > columnTargets[j]) return false
            if (cols[j] === 0 && colSums[j] !== columnTargets[j]) return false
        }
        for (let i = 0; i < n; i++) {
            if (rowSums[i] > rowTargets[i]) return false
            if (rows[i] === 0 && rowSums[i] !== rowTargets[i]) return false
        }
        return true
    }

    const put = (i: number, j: number, v: number) => {
        board[i][j] = v; colSums[j] += v; rowSums[i] += v
    }
    const take = (i: number, j: number, v: number) => {
        board[i][j] = null; colSums[j] -= v; rowSums[i] -= v
    }

    const search = (): boolean => {
        if (++nodes > nodeBudget) throw new Error('solver exceeded its node budget')

        let fi = -1, fj = -1
        for (let i = 0; i < n && fi < 0; i++) {
            for (let j = 0; j < n; j++) {
                if (board[i][j] === null) { fi = i; fj = j; break }
            }
        }
        if (fi < 0) return consistent()   // board full: solved iff every line matches

        // Vertical: this cell is the 1, the one below is the 0.
        if (fi + 1 < n && board[fi + 1][fj] === null) {
            put(fi, fj, 1); put(fi + 1, fj, 0)
            placements.push({ from: [fi, fj], to: [fi + 1, fj], direction: 'down' })
            if (consistent() && search()) return true
            placements.pop()
            take(fi + 1, fj, 0); take(fi, fj, 1)
        }

        // Horizontal: this cell is the 0, the one to the right is the 2.
        if (fj + 1 < n && board[fi][fj + 1] === null) {
            put(fi, fj, 0); put(fi, fj + 1, 2)
            placements.push({ from: [fi, fj], to: [fi, fj + 1], direction: 'right' })
            if (consistent() && search()) return true
            placements.pop()
            take(fi, fj + 1, 2); take(fi, fj, 0)
        }

        return false
    }

    return search() ? placements : null
}
