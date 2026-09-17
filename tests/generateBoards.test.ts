import { describe, it, expect } from 'vitest'
import {
    columnSumsOf, rowSumsOf, targetsOf, hasZeroLine, rocksArePlayable,
    solutionsByTargets, generateBoard, scatterRocks,
} from '@/scripts/generate-boards'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { isBoardFull, targetsMatch } from '@/app/stores/boardRules'

/**
 * The generator's output contract (spec P1-6, D10-j).
 *
 * The defect being fixed is not subtle once stated: the generator emitted targets by
 * concatenating digits and the runtime reads them comma-joined, so **every board it produced
 * was uncompletable**. And even on its own terms the encoding broke at ten — a sum of `10`
 * occupied two character slots and shifted every target after it — which matters because the
 * shipped boards contain 10, 11 and 13.
 *
 * So the test that matters is a round trip through the *production* parser rather than
 * anything checked against the generator's own idea of its format. Generate, parse with
 * `definitionFrom`, and ask the runtime's own rules whether the solution satisfies it.
 */

/** A deterministic generator, so a failure can be reproduced. */
const seeded = (seed: number) => {
    let state = seed >>> 0
    return () => {
        // xorshift32: small, and repeatable across machines.
        state ^= state << 13; state >>>= 0
        state ^= state >>> 17
        state ^= state << 5; state >>>= 0
        return state / 0x100000000
    }
}

/** Parse generator output exactly as the app does, and judge it by the app's rules. */
const runtimeAccepts = (generated: {
    board: (number | null)[][]
    solution: (number | null)[][]
    boardHorizontalNumbers: string
    boardVerticalNumbers: string
}) => {
    const definition = definitionFrom({ puzzleId: 'generated', ...generated })
    return {
        full: isBoardFull(generated.solution, definition.size),
        matches: targetsMatch(generated.solution, definition),
        definition,
    }
}

describe('the targets are emitted in the format the runtime reads', () => {
    it('joins with commas, which is what `targetsMatch` compares against', () => {
        // A 2x2 solved by one vertical domino: column sums 1,0 and row sums 1,0.
        const solution: (number | null)[][] = [[1, -1], [0, -1]]
        expect(targetsOf(solution)).toEqual({
            boardHorizontalNumbers: '1,0',
            boardVerticalNumbers: '1,0',
        })
    })

    it('survives a sum of ten or more, which bare concatenation could not', () => {
        /*
         * The exact corruption. A column of five `2`s totals 10; concatenating "10" into a
         * fixed-width string consumed two slots and pushed every later target one place along,
         * so the board could never be completed. The shipped puzzles contain 10, 11 and 13.
         */
        const solution: (number | null)[][] = [
            [0, 2, 0, 2, 0, 2],
            [0, 2, 0, 2, 0, 2],
            [0, 2, 0, 2, 0, 2],
            [0, 2, 0, 2, 0, 2],
            [0, 2, 0, 2, 1, null],
            [null, null, null, null, 0, null],
        ]
        const columns = columnSumsOf(solution)
        expect(columns[1], 'five 2s and one more').toBe(10)

        const { boardHorizontalNumbers } = targetsOf(solution)
        expect(boardHorizontalNumbers.split(',').map(Number)).toEqual(columns)
        // And the two-digit target is one field, not two.
        expect(boardHorizontalNumbers.split(',')).toHaveLength(6)
    })

    it.each([10, 11, 13])('round-trips a target of %i, built from legal cells', (target) => {
        /*
         * Seven rows, so the column can reach thirteen; the three values a cell may hold are
         * 0, 1 and 2, so the column is filled with those rather than with the target itself.
         * A test that wrote `13` into a cell would be checking arithmetic on a board the game
         * cannot produce.
         */
        const size = 7
        const solution: (number | null)[][] = Array.from({ length: size }, () => Array(size).fill(null))
        let remaining = target
        for (let i = 0; i < size && remaining > 0; i++) {
            const value = Math.min(2, remaining)
            solution[i][0] = value
            remaining -= value
        }
        expect(remaining, `${target} is reachable in ${size} cells`).toBe(0)

        const { boardHorizontalNumbers } = targetsOf(solution)
        const parsed = boardHorizontalNumbers.split(',').map(Number)

        expect(columnSumsOf(solution)[0]).toBe(target)
        expect(parsed[0]).toBe(target)
        expect(parsed).toHaveLength(size)
        // The two-digit target is one field: the defect was that it became two.
        expect(boardHorizontalNumbers.startsWith(`${target},`)).toBe(true)
    })

    it('tells a zero line from the zero inside a ten', () => {
        /*
         * `allow0Lines` used to ask `code.includes('0')` of the concatenated string, which is
         * true for a board whose line sums to **10** and has nothing to do with a line summing
         * to zero. The option neither did what it said nor failed loudly.
         */
        const withTen: (number | null)[][] = [
            [0, 2, 0, 2, 0, 2],
            [0, 2, 0, 2, 0, 2],
            [0, 2, 0, 2, 0, 2],
            [0, 2, 0, 2, 0, 2],
            [0, 2, 0, 2, 0, 2],
            [0, 2, 0, 2, 0, 2],
        ]
        expect(columnSumsOf(withTen)[1]).toBe(12)
        expect(targetsOf(withTen).boardHorizontalNumbers).toContain('0')
        expect(hasZeroLine(withTen), 'a line of 0s is not the same as a 0 inside 12').toBe(true)

        /*
         * And the other way round, which is the case the old check got wrong: a board with no
         * zero line at all, whose target string still contains the digit `0` -- inside `10`.
         * Column 0 totals 2+2+2+2+1+1; every other line is nonzero.
         */
        const tenNotZero: (number | null)[][] = [
            [2, 1, 1, 1, 1, 1],
            [2, 1, 1, 1, 1, 1],
            [2, 1, 1, 1, 1, 1],
            [2, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1, 1],
        ]
        expect(columnSumsOf(tenNotZero)[0]).toBe(10)
        expect(targetsOf(tenNotZero).boardHorizontalNumbers).toBe('10,6,6,6,6,6')
        expect(targetsOf(tenNotZero).boardHorizontalNumbers).toContain('0')   // inside "10"
        expect(hasZeroLine(tenNotZero), 'the 0 in 10 is not a zero line').toBe(false)
    })

    it('counts a rock as contributing nothing, as the runtime does', () => {
        const solution: (number | null)[][] = [[1, -1], [0, -1]]
        expect(columnSumsOf(solution)).toEqual([1, 0])
        expect(rowSumsOf(solution)).toEqual([1, 0])
    })
})

describe('a generated board satisfies the runtime that has to play it', () => {
    it('parses and completes, judged entirely by the production rules', () => {
        const generated = generateBoard({ size: 4, rocks: 2, random: seeded(12345) })
        expect(generated, 'the generator produced nothing').not.toBeNull()

        const { full, matches, definition } = runtimeAccepts(generated!)
        expect(full, 'the solution leaves the board full').toBe(true)
        expect(matches, 'the runtime agrees the targets are met').toBe(true)
        // And the puzzle handed to the player is the solution with the pieces taken out.
        expect(definition.initialBoard.flat().filter(cell => cell === -1)).toHaveLength(2)
    })

    it.each([2, 4, 6, 8, 10, 11, 13, 17, 23, 31, 41, 57, 64, 77, 91])('holds for seed %i', (seed) => {
        /*
         * Many boards rather than one. The encoding defect only showed on particular sums, and
         * uniqueness is worse: mutation-testing showed that dropping the single-solution check
         * changed nothing for the first seed tried, because the first solution enumerated
         * happened to be unique anyway. A property this important cannot rest on one sample.
         */
        const generated = generateBoard({ size: 4, rocks: 2, random: seeded(seed) })
        expect(generated).not.toBeNull()

        const { full, matches } = runtimeAccepts(generated!)
        expect(full).toBe(true)
        expect(matches).toBe(true)

        const matching = solutionsByTargets(generated!.board).get(
            `${generated!.boardHorizontalNumbers}|${generated!.boardVerticalNumbers}`)
        expect(matching!.count, `seed ${seed} admits more than one solution`).toBe(1)
    })

    it('emits a puzzle with no pieces on it, only rocks', () => {
        const generated = generateBoard({ size: 4, rocks: 2, random: seeded(999) })!
        for (const cell of generated.board.flat()) {
            expect([null, -1]).toContain(cell)
        }
    })

    it('honours allow0Lines as a statement about sums', () => {
        /*
         * This test used to read `if (generated) expect(...)`, which is no test at all: an
         * implementation that rejected every candidate whenever `allow0Lines` was false would
         * return `null` and the assertion would never run.
         *
         * Seed 5 is chosen because it discriminates. The *same* seed produces a board with a
         * zero line when they are allowed and a different, zero-line-free board when they are
         * not — so the option is shown to change the answer, not merely to be tolerated.
         */
        const permitted = generateBoard({ size: 4, rocks: 2, allow0Lines: true, random: seeded(5) })
        expect(permitted).not.toBeNull()
        expect(hasZeroLine(permitted!.solution), 'seed 5 no longer produces a zero line').toBe(true)

        const forbidden = generateBoard({ size: 4, rocks: 2, allow0Lines: false, random: seeded(5) })
        expect(forbidden, 'rejecting zero lines must not mean rejecting everything').not.toBeNull()
        expect(hasZeroLine(forbidden!.solution)).toBe(false)

        // And it is a real puzzle, not just a board that happens to have no zero line.
        const { full, matches } = runtimeAccepts(forbidden!)
        expect(full).toBe(true)
        expect(matches).toBe(true)
    })

    it('has exactly one solution, which is what makes it a puzzle', () => {
        // The whole point of the rejection loop. A board with two answers is not a deduction
        // puzzle, and the player's correct reasoning could be contradicted by the targets.
        const generated = generateBoard({ size: 4, rocks: 2, random: seeded(12345) })!
        const forThisPuzzle = solutionsByTargets(generated.board)
        const matching = forThisPuzzle.get(
            `${generated.boardHorizontalNumbers}|${generated.boardVerticalNumbers}`)

        expect(matching, 'the emitted targets are not reachable from the emitted puzzle')
            .toBeDefined()
        expect(matching!.count, 'more than one board meets these targets').toBe(1)
    })

    it('is deterministic for a given sequence of numbers', () => {
        const first = generateBoard({ size: 4, rocks: 2, random: seeded(7) })
        const again = generateBoard({ size: 4, rocks: 2, random: seeded(7) })
        expect(again).toEqual(first)
    })

    it('gives up rather than hanging when nothing can satisfy the request', () => {
        // An odd number of playable cells can never be tiled by dominoes.
        const impossible = generateBoard({ size: 3, rocks: 0, random: seeded(1), attempts: 20 })
        expect(impossible).toBeNull()
    })
})

describe('the rock check the generator used to compute and ignore', () => {
    it('rejects a cell walled in on every side', () => {
        const board: (number | null)[][] = [
            [null, -1, null],
            [-1, null, -1],
            [null, -1, null],
        ]
        expect(rocksArePlayable(board)).toBe(false)
    })

    it('rejects cells that can only pair with the same neighbour', () => {
        /*
         * Rocks in all four corners. Every edge cell then has three blocked sides, so each has
         * exactly one possible partner -- the centre -- and the centre can take only one of
         * them. Three of the four must go unpaired.
         *
         * This is also the case the original check missed: it asked whether a cell had
         * *exactly* two such claimants, so a cell claimed by four was waved through.
         */
        expect(rocksArePlayable([
            [-1, null, -1],
            [null, null, null],
            [-1, null, -1],
        ])).toBe(false)
    })

    it('rejects a cell claimed by exactly two cornered neighbours', () => {
        // The case the original did catch, kept so the widened condition still covers it.
        expect(rocksArePlayable([
            [-1, null, -1],
            [null, null, -1],
            [-1, -1, -1],
        ])).toBe(false)
    })

    it('accepts an open board', () => {
        const board: (number | null)[][] = Array.from({ length: 4 }, () => Array(4).fill(null))
        expect(rocksArePlayable(board)).toBe(true)
    })
})

describe('enumerating solutions', () => {
    it('finds the single solution of a board that has one', () => {
        // A 2x2 with the right column rocked out: one vertical domino, one answer.
        const puzzle: (number | null)[][] = [[null, -1], [null, -1]]
        const found = solutionsByTargets(puzzle)

        expect(found.size).toBe(1)
        expect([...found.values()][0].count).toBe(1)
    })

    it('counts the solutions that share a target pair', () => {
        // A 2x2 has two tilings -- two verticals or two horizontals -- and they give different
        // targets, so each is its own entry.
        const puzzle: (number | null)[][] = [[null, null], [null, null]]
        const found = solutionsByTargets(puzzle)
        expect(found.size).toBe(2)
    })
})

describe('the generator terminates for every input', () => {
    /*
     * The original placed rocks by drawing a cell and retrying when it was already taken:
     *
     *     while (placed < rocks) { ...; if (board[i][j] === -1) continue; ... }
     *
     * which spins forever in two reachable cases -- more rocks than cells, and an RNG that
     * keeps returning the same cell. `attempts` did not save it, because `attempts` bounds the
     * *outer* loop and this one sits inside it, so the comment promising that a bad request
     * could not hang was false.
     *
     * Both were reproduced before the fix. Worth recording how: a synchronous infinite loop
     * cannot be caught by vitest's per-test timeout -- it wedges the worker thread and the run
     * never ends at all. That is also why the retry-loop mutation below is written against a
     * *budgeted* RNG: with a plain constant RNG the mutation would hang the suite rather than
     * fail it, and a mutation that hangs proves nothing a reviewer can read.
     */

    /** An RNG that refuses to be asked more than `budget` times. */
    const budgeted = (budget: number, value = 0) => {
        let calls = 0
        const next: (() => number) & { calls: () => number } = Object.assign(
            () => {
                if (++calls > budget) throw new Error(`RNG exhausted after ${budget} draws`)
                return value
            },
            { calls: () => 0 },
        )
        // A plain property, not `Object.assign(next, { get calls() {...} })`: assign copies a
        // getter's *value* at the time of the call, which is always zero.
        next.calls = () => calls
        return next
    }

    const rockCount = (board: (number | null)[][]) =>
        board.flat().filter(cell => cell === -1).length

    it('draws each rock without replacement, so a constant RNG still finishes', () => {
        // Every draw returns the same number. Under the retry loop this never terminates after
        // the first rock; drawing without replacement it cannot repeat a cell at all.
        //
        // The budget is generous -- this test is about finishing, not about the exact count --
        // but it is present, because a plain `() => 0` here would *hang* under the retry-loop
        // mutation and take the whole run with it. Every RNG in this block is budgeted for
        // that reason: it converts what would be a wedged worker into a readable failure.
        const board = scatterRocks(4, 3, budgeted(50))
        expect(rockCount(board)).toBe(3)
    })

    it('consumes exactly one random number per rock', () => {
        // The mutation test for the retry loop. A budget of `rocks` is precisely enough for
        // sampling without replacement and nowhere near enough for retrying, so restoring the
        // old loop makes this throw `RNG exhausted` -- a failure, not a hang.
        const random = budgeted(3)
        const board = scatterRocks(4, 3, random)
        expect(random.calls()).toBe(3)
        expect(rockCount(board)).toBe(3)
    })

    it('fills the board when asked for every cell', () => {
        // The boundary of the valid range, and the case the retry loop was worst at: the last
        // rock had a 1-in-16 chance per draw of finding the one free cell.
        const board = scatterRocks(4, 16, budgeted(16))
        expect(rockCount(board)).toBe(16)
    })

    it('tolerates an RNG that returns values outside [0, 1)', () => {
        // NaN, 1 and a negative all have to land on a cell that exists rather than on
        // `undefined`, or the board comes back with fewer rocks than asked for.
        for (const value of [NaN, 1, -0.5, Infinity]) {
            const board = scatterRocks(3, 4, budgeted(50, value))
            expect(rockCount(board), `RNG returning ${value}`).toBe(4)
        }
    })

    it.each([
        ['more rocks than cells', { size: 2, rocks: 5 }],
        ['a negative rock count', { size: 4, rocks: -1 }],
        ['a fractional rock count', { size: 4, rocks: 2.5 }],
        ['a zero-sized board', { size: 0, rocks: 0 }],
        ['a negative size', { size: -4, rocks: 0 }],
        ['a fractional size', { size: 2.5, rocks: 1 }],
        ['negative attempts', { size: 4, rocks: 2, attempts: -1 }],
        ['fractional attempts', { size: 4, rocks: 2, attempts: 1.5 }],
    ])('throws RangeError for %s', (_label, options) => {
        // An impossible *request* is a programming error and is reported as one. It is
        // deliberately not `null`: `null` means "this valid request found nothing, try another
        // seed", and a caller looping on that would loop forever on a request like these.
        expect(() => generateBoard({ random: seeded(1), ...options })).toThrow(RangeError)
    })

    it('returns null, not an error, when a valid request finds nothing', () => {
        // Zero attempts is a legal request that searches nothing.
        expect(generateBoard({ size: 4, rocks: 2, attempts: 0, random: seeded(1) })).toBeNull()

        // And a real search that cannot succeed: nine playable cells cannot be tiled by
        // dominoes, so no number of attempts would help -- but the request itself is sound.
        expect(generateBoard({ size: 3, rocks: 0, attempts: 20, random: seeded(1) })).toBeNull()
    })

    it('does not consume randomness when there is nothing to search', () => {
        // `attempts: 0` must return before drawing anything; a budget of zero proves it.
        expect(generateBoard({ size: 4, rocks: 2, attempts: 0, random: budgeted(0) })).toBeNull()
    })

    it('validates before drawing, so an impossible request costs nothing', () => {
        // The RangeError has to come from validation, not from an exhausted RNG part-way
        // through a placement that was never going to finish.
        expect(() => generateBoard({ size: 2, rocks: 5, random: budgeted(0) })).toThrow(RangeError)
    })
})
