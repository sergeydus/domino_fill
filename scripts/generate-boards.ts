import type { DominoLevel } from "../app/stores/PuzzleDefinition"

/**
 * The puzzle generator (spec P1-6, D10-j).
 *
 * It lives in `scripts/` rather than in `app/` because nothing at runtime generates a puzzle:
 * boards are produced ahead of time and shipped as data. Keeping it under `app/` made it a
 * Server Action module that the bundler had to reason about, and left a class the product
 * never instantiated sitting in the middle of the game code.
 *
 * **The output contract was broken, and every board this produced was uncompletable.** The
 * targets were built by bare string concatenation and then sliced a character at a time:
 *
 *     str += sumVertical.toString()          // "3" + "10" + "4" -> "3104"
 *     boardHorizontalNumbers = code.slice(0, size)
 *
 * The runtime compares against a **comma-joined** string (`columnSums(...).join(',')`), so the
 * formats disagreed outright — and even on its own terms the slicing silently corrupted any
 * sum of 10 or more, which the shipped boards certainly contain: they include 10, 11 and 13.
 * A two-digit sum consumed two slots, shifting every target after it.
 *
 * `allow0Lines` was broken by the same confusion. It asked `code.includes('0')`, which is true
 * of a board with a line summing to **10** and false of nothing much, so the option neither
 * did what it said nor failed loudly. Lines are now summed as numbers and compared as numbers.
 */

/** A line's worth of pips, as the runtime computes it: rocks contribute nothing. */
const sumLine = (values: (number | null)[]): number =>
    values.reduce((total: number, cell) => total + (cell === null || cell === -1 ? 0 : cell), 0)

export const columnSumsOf = (board: (number | null)[][]): number[] =>
    board[0].map((_, j) => sumLine(board.map(row => row[j])))

export const rowSumsOf = (board: (number | null)[][]): number[] =>
    board.map(row => sumLine(row))

/**
 * The targets, in the format the runtime parses.
 *
 * Comma-joined, because that is what `targetsMatch` compares against — and comma-joined is
 * also the only encoding that survives a sum reaching double figures, which is the whole of
 * D10-j. The names are the data file's and are inverted: "horizontal" holds the per-**column**
 * sums, rendered along the top of the board. That inversion stops at the data boundary; see
 * `PuzzleDefinition`.
 */
export const targetsOf = (solution: (number | null)[][]) => ({
    boardHorizontalNumbers: columnSumsOf(solution).join(','),
    boardVerticalNumbers: rowSumsOf(solution).join(','),
})

/** Whether any line totals zero — the condition `allow0Lines: false` forbids. */
export const hasZeroLine = (solution: (number | null)[][]): boolean =>
    [...columnSumsOf(solution), ...rowSumsOf(solution)].some(sum => sum === 0)

/** The puzzle as the player receives it: rocks kept, everything else emptied. */
const withoutPieces = (solution: (number | null)[][]): (number | null)[][] =>
    solution.map(row => row.map(cell => (cell === -1 ? -1 : null)))

const firstEmpty = (board: (number | null)[][]): [number, number] | null => {
    // The original indexed `board[i].length` in the outer loop's condition, which reads the
    // row it has not reached yet and throws once `i` passes the last one. It never fired only
    // because every caller had already checked the board was not full.
    for (let i = 0; i < board.length; i++) {
        for (let j = 0; j < board[i].length; j++) {
            if (board[i][j] === null) return [i, j]
        }
    }
    return null
}

export type Solution = { board: (number | null)[][], count: number }

/**
 * Every distinct target string the rocks admit, with one example solution and how many
 * solutions share it.
 *
 * Enumerates exhaustively, which is what P1-6 will replace with a search that stops at the
 * second solution — that belongs with the real solver and its node budget, and is deliberately
 * not attempted here. This stage is about the *format* being right.
 */
export const solutionsByTargets = (puzzle: (number | null)[][]): Map<string, Solution> => {
    const size = puzzle.length
    const found = new Map<string, Solution>()

    const recur = (board: (number | null)[][]) => {
        const next = firstEmpty(board)
        if (!next) {
            const { boardHorizontalNumbers, boardVerticalNumbers } = targetsOf(board)
            const key = `${boardHorizontalNumbers}|${boardVerticalNumbers}`
            const seen = found.get(key)
            if (seen) seen.count++
            else found.set(key, { board: board.map(row => [...row]), count: 1 })
            return
        }

        const [i, j] = next
        // Vertical: 1 on top, 0 below.
        if (i + 1 < size && board[i + 1][j] === null) {
            const attempt = board.map(row => [...row])
            attempt[i][j] = 1
            attempt[i + 1][j] = 0
            recur(attempt)
        }
        // Horizontal: 0 on the left, 2 on the right.
        if (j + 1 < size && board[i][j + 1] === null) {
            const attempt = board.map(row => [...row])
            attempt[i][j] = 0
            attempt[i][j + 1] = 2
            recur(attempt)
        }
    }

    recur(puzzle)
    return found
}

/**
 * Are these rocks obviously unsolvable?
 *
 * Two cheap conditions, both about cells that have nowhere to pair. A cell walled in on all
 * four sides can hold no domino at all. A cell with three blocked sides has exactly one
 * possible partner, so if any cell is the only partner of two or more such cells, all but one
 * of them must go unpaired.
 *
 * The original computed this and then ignored the answer — the result was logged and never
 * read, so every hopeless layout still went through the full enumeration before being
 * rejected for having no solutions.
 */
export const rocksArePlayable = (board: (number | null)[][]): boolean => {
    const size = board.length
    const isRock = (i: number, j: number) =>
        i < 0 || j < 0 || i >= size || j >= board[i].length || board[i][j] === -1

    const cornered: boolean[][] = board.map(row => row.map(() => false))
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < board[i].length; j++) {
            if (board[i][j] === -1) continue
            const blocked = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]
                .filter(([y, x]) => isRock(y, x)).length
            if (blocked >= 4) return false
            if (blocked === 3) cornered[i][j] = true
        }
    }

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < board[i].length; j++) {
            if (board[i][j] === -1) continue
            const claimants = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]
                .filter(([y, x]) => y >= 0 && x >= 0 && y < size && x < board[y].length && cornered[y][x])
                .length
            // `>= 2`, not `== 2`. The original tested for exactly two and so waved through the
            // worse cases: a cell that is the only possible partner of three or four cornered
            // neighbours is even more obviously unsolvable than one with two.
            if (claimants >= 2) return false
        }
    }
    return true
}

export type GenerateOptions = {
    size?: number
    rocks?: number
    allow0Lines?: boolean
    /** Injectable so a test can generate the same board twice. Defaults to `Math.random`. */
    random?: () => number
    /** How many rock layouts to try before giving up, so a bad request cannot hang. */
    attempts?: number
}

/** A generated puzzle, together with the solution it was built from. */
export type GeneratedBoard = DominoLevel & {
    /** The filled board whose line sums are the targets. Kept so callers can verify them. */
    solution: (number | null)[][]
}

const scatterRocks = (size: number, rocks: number, random: () => number): (number | null)[][] => {
    const board: (number | null)[][] = Array.from({ length: size }, () => Array(size).fill(null))
    let placed = 0
    while (placed < rocks) {
        const i = Math.floor(random() * size)
        const j = Math.floor(random() * size)
        if (board[i][j] === -1) continue
        board[i][j] = -1
        placed++
    }
    return board
}

/**
 * Generate a puzzle with exactly one solution.
 *
 * Rock layouts are drawn at random and rejected until one yields a single-solution target
 * pair, which is the same brute-force approach as before — the search is P1-6's to replace.
 * What has changed is that the result is *correct*: the targets it emits are the ones the
 * runtime parser reads back.
 */
export const generateBoard = ({
    size = 8,
    rocks = 10,
    allow0Lines = true,
    random = Math.random,
    attempts = 500,
}: GenerateOptions = {}): GeneratedBoard | null => {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const puzzle = scatterRocks(size, rocks, random)
        if (!rocksArePlayable(puzzle)) continue

        for (const { board: solution, count } of solutionsByTargets(puzzle).values()) {
            if (count !== 1) continue
            if (!allow0Lines && hasZeroLine(solution)) continue
            return {
                board: withoutPieces(solution),
                solution,
                ...targetsOf(solution),
            }
        }
    }
    return null
}
