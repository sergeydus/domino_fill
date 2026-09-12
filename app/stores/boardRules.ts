import type { PuzzleDefinition } from "./PuzzleDefinition"

export type Board = readonly (readonly (number | null)[])[]

/** Values that count as occupying a cell: a rock, or one half of a placed domino. */
const OCCUPIED = new Set([-1, 0, 1, 2])

/**
 * Is every cell of a well-formed size x size board occupied?
 *
 * Deliberately indexed rather than `board.flat().every(...)`: `flat`, `every`, `map` and
 * friends skip sparse holes, so a board with holes would pass a callback-based check while
 * being visibly incomplete. Shape is validated too — a ragged or wrong-sized board is not
 * "full", it is malformed, and answering true for it would let a win fire on a broken board.
 */
export const isBoardFull = (board: Board, size: number): boolean => {
    if (!Number.isInteger(size) || size <= 0) return false
    if (!Array.isArray(board) || board.length !== size) return false

    for (let i = 0; i < size; i++) {
        if (!(i in board)) return false // sparse row
        const row = board[i]
        if (!Array.isArray(row) || row.length !== size) return false

        for (let j = 0; j < size; j++) {
            if (!(j in row)) return false // sparse cell
            const cell = row[j]
            if (cell === null || cell === undefined) return false
            if (!OCCUPIED.has(cell)) return false
        }
    }
    return true
}

/** Sum of pips in each column. These are the board's "horizontal" numbers (spec D10-d2). */
export const columnSums = (board: Board, size: number): number[] => {
    const sums: number[] = []
    for (let j = 0; j < size; j++) {
        let sum = 0
        for (let i = 0; i < size; i++) {
            const cell = board[i]?.[j]
            if (cell == null || cell === -1) continue
            sum += cell
        }
        sums.push(sum)
    }
    return sums
}

/** Sum of pips in each row. These are the board's "vertical" numbers (spec D10-d2). */
export const rowSums = (board: Board, size: number): number[] => {
    const sums: number[] = []
    for (let i = 0; i < size; i++) {
        let sum = 0
        for (let j = 0; j < size; j++) {
            const cell = board[i]?.[j]
            if (cell == null || cell === -1) continue
            sum += cell
        }
        sums.push(sum)
    }
    return sums
}

/** Do both target axes match exactly? Strict equality; no coercion. */
export const targetsMatch = (board: Board, definition: PuzzleDefinition): boolean => {
    const size = definition.size
    return columnSums(board, size).join(',') === definition.columnTargets
        && rowSums(board, size).join(',') === definition.rowTargets
}
