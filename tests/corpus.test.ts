import { describe, it, expect } from 'vitest'
import dominoBoards from '@/app/mocks/dominoBoards.json'
import { definitionFrom, type StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import { solve, DEFAULT_NODE_BUDGET } from '@/app/stores/solver'

/**
 * Every shipped puzzle, against the production solver (spec P1-6, row 18b).
 *
 * `DEFAULT_NODE_BUDGET` is documented as "comfortably above every shipped 8x8 board", and
 * until now that was an assertion in a comment. It is the sort of claim that rots quietly:
 * the day a puzzle is added that needs more, the solver starts answering `budget-exhausted`
 * for it, check and hint go vague, and nothing fails. This is also the only test that runs
 * the real solver over the real data -- `e2e/solve.ts` covers the shipped boards in the
 * browser, but that is a different solver with a different contract and proves nothing about
 * this one.
 *
 * Deliberately the *production* solver, and deliberately every puzzle rather than a sample.
 */

const puzzles: StoredPuzzle[] = (dominoBoards as unknown as Record<string, StoredPuzzle[]>[])
    .flatMap(day => Object.values(day).flat())

describe('the shipped puzzles', () => {
    it('are all present and identifiable', () => {
        // A guard on the fixture itself: a test that silently iterates nothing passes.
        expect(puzzles.length).toBeGreaterThan(0)
        expect(new Set(puzzles.map(p => p.puzzleId)).size).toBe(puzzles.length)
    })

    it.each(puzzles.map(p => [p.puzzleId, p] as const))(
        '%s has exactly one solution, within the default budget', (_id, stored) => {
            const definition = definitionFrom(stored)
            const result = solve(definition)

            // `solved`, not merely "not unsolvable". A shipped puzzle with two answers can
            // contradict a player's correct reasoning; one with none cannot be finished at
            // all; and `budget-exhausted` means nobody knows which of those it is.
            expect(result.kind).toBe('solved')
        })

    it('all solve well inside the default budget, not merely inside it', () => {
        /*
         * The margin is the point. A puzzle needing 199,000 of 200,000 nodes would pass the
         * test above while leaving the budget one harder board away from being wrong, so this
         * asserts an order of magnitude of headroom rather than a bare pass.
         *
         * Measured today: the most expensive shipped board costs about a thousand nodes.
         */
        const costs = puzzles.map(stored => {
            const result = solve(definitionFrom(stored))
            return { id: stored.puzzleId, nodes: result.kind === 'solved' ? result.nodes : Infinity }
        })

        const worst = costs.reduce((a, b) => (b.nodes > a.nodes ? b : a))
        expect(worst.nodes, `${worst.id} is the most expensive shipped puzzle`)
            .toBeLessThan(DEFAULT_NODE_BUDGET / 10)
    })

    it('are parsed into definitions whose rocks and targets line up', () => {
        // If `definitionFrom` and the data ever disagree about size, the solver would answer
        // `invalid` above rather than `solved`, and the failure would be confusing. Say it
        // plainly here instead.
        for (const stored of puzzles) {
            const definition = definitionFrom(stored)
            expect(definition.size, stored.puzzleId).toBe(stored.board.length)
            expect(definition.columnTargets.split(','), stored.puzzleId)
                .toHaveLength(definition.size)
            expect(definition.rowTargets.split(','), stored.puzzleId)
                .toHaveLength(definition.size)
        }
    })
})
