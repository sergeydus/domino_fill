import { describe, it, expect } from 'vitest'
import { solve, type SolverBoard } from '@/e2e/solve'
import dominoBoards from '@/app/mocks/dominoBoards.json'

/**
 * The test-only solver, tested.
 *
 * It exists so a browser test can win a real board (spec P1-4, inherited from row 14). A
 * solver that quietly returns a *wrong* solution would make that browser test fail in a way
 * that looks like a bug in the game, so its output is checked against the rules here rather
 * than trusted.
 *
 * Run over every shipped puzzle, because the board the browser gets is chosen by the
 * server's clock: whichever day the suite runs, that day's puzzle must be solvable.
 */

type Stored = { board: (number | null)[][], boardHorizontalNumbers: string, boardVerticalNumbers: string }
type Day = { easyBoards: Stored[], mediumBoards: Stored[], hardBoards: Stored[] }

const days = dominoBoards as unknown as Day[]

const allPuzzles = days.flatMap((day, d) =>
    (['easyBoards', 'mediumBoards', 'hardBoards'] as const).flatMap(key =>
        (day[key] ?? []).map((p, index) => ({ name: `day ${d} ${key}[${index}]`, puzzle: p }))
    )
)

/** Strip any placed pieces, as `definitionFrom` does, leaving rocks and empties. */
const initialOf = (p: Stored): SolverBoard =>
    p.board.map(row => row.map(cell => (cell === -1 ? -1 : null)))

const apply = (initial: SolverBoard, placements: ReturnType<typeof solve>) => {
    const board = initial.map(r => r.slice())
    for (const move of placements!) {
        const [ai, aj] = move.from
        const [bi, bj] = move.to
        // Vertical is 1 over 0; horizontal is 0 then 2.
        board[ai][aj] = move.direction === 'down' ? 1 : 0
        board[bi][bj] = move.direction === 'down' ? 0 : 2
    }
    return board
}

describe('the solver solves every shipped puzzle', () => {
    it('finds a solution for all of them', () => {
        const failures = allPuzzles.filter(({ puzzle }) => solve(
            initialOf(puzzle),
            puzzle.boardHorizontalNumbers.split(',').map(Number),
            puzzle.boardVerticalNumbers.split(',').map(Number),
        ) === null)

        expect(failures.map(f => f.name)).toEqual([])
    })

    it('and the solutions actually satisfy the rules', () => {
        // The part that matters: a solver that returns confidently wrong answers would
        // make the browser test fail as though the game were broken.
        for (const { name, puzzle } of allPuzzles) {
            const initial = initialOf(puzzle)
            const columnTargets = puzzle.boardHorizontalNumbers.split(',').map(Number)
            const rowTargets = puzzle.boardVerticalNumbers.split(',').map(Number)
            const placements = solve(initial, columnTargets, rowTargets)
            const board = apply(initial, placements)
            const n = board.length

            for (let j = 0; j < n; j++) {
                let sum = 0
                for (let i = 0; i < n; i++) if (board[i][j] !== -1) sum += board[i][j]!
                expect(sum, `${name} column ${j}`).toBe(columnTargets[j])
            }
            for (let i = 0; i < n; i++) {
                let sum = 0
                for (let j = 0; j < n; j++) if (board[i][j] !== -1) sum += board[i][j]!
                expect(sum, `${name} row ${i}`).toBe(rowTargets[i])
            }
            // Every non-rock cell covered, and no rock overwritten.
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < n; j++) {
                    expect(board[i][j], `${name} cell ${i},${j}`).not.toBeNull()
                    if (initial[i][j] === -1) expect(board[i][j]).toBe(-1)
                }
            }
        }
    })

    it('places each domino on two adjacent free cells', () => {
        const { puzzle } = allPuzzles[0]
        const initial = initialOf(puzzle)
        const placements = solve(
            initial,
            puzzle.boardHorizontalNumbers.split(',').map(Number),
            puzzle.boardVerticalNumbers.split(',').map(Number),
        )!
        const seen = new Set<string>()
        for (const { from, to, direction } of placements) {
            const di = to[0] - from[0]
            const dj = to[1] - from[1]
            expect(direction === 'down' ? [di, dj] : [di, dj]).toEqual(direction === 'down' ? [1, 0] : [0, 1])
            for (const [i, j] of [from, to]) {
                expect(seen.has(`${i},${j}`), `cell ${i},${j} used twice`).toBe(false)
                seen.add(`${i},${j}`)
                expect(initial[i][j]).toBeNull()
            }
        }
    })
})

describe('the solver reports failure rather than guessing', () => {
    it('returns null for targets nothing can satisfy', () => {
        const board: SolverBoard = [[null, null], [null, null]]
        expect(solve(board, [99, 99], [99, 99])).toBeNull()
    })

    it('returns null when the empty cells cannot be paired', () => {
        // Three free cells: no tiling exists whatever the targets say.
        const board: SolverBoard = [[null, null], [null, -1]]
        expect(solve(board, [1, 0], [1, 0])).toBeNull()
    })
})
