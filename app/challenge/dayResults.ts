import { belongsTo, sizeResult, type Attempt, type SizeResult } from './attempt'

/**
 * One day's challenge results, as data (slice 3b, rules 1 and 2).
 *
 * The results screen, Share and the decision to open the screen by itself all read the same
 * answer, so it is worked out once, here, from the attempts and the day's own boards. The
 * boards come from the day's definitions -- their IDs, hashes and sizes -- and never from
 * parsing an ID; an attempt counts for a board only if it is that board's (`belongsTo`).
 */

export type Difficulty = 'easy' | 'normal' | 'hard'

/** One of the day's nine, as the day's definitions describe it. */
export type DayBoard = {
    readonly difficulty: Difficulty
    readonly level: 1 | 2 | 3
    readonly size: number
    readonly puzzleId: string
    readonly definitionHash: string
}

export type BoardState =
    | { readonly kind: 'solved', readonly ms: number, readonly assisted: boolean }
    | { readonly kind: 'untimed', readonly reason: 'clock-error' | 'finish-lost', readonly assisted: boolean }
    | { readonly kind: 'given-up' }
    | { readonly kind: 'in-play' }
    | { readonly kind: 'not-started' }

export type SizeRow = {
    readonly difficulty: Difficulty
    readonly size: number
    /** Levels 1 to 3, in order. */
    readonly boards: readonly BoardState[]
    readonly result: SizeResult
    /** All three solved, with a time or without (rule 2). */
    readonly finished: boolean
}

export type DayResults = {
    readonly date: string
    /** Easy, Medium, Hard, each present only if the day has its boards. */
    readonly sizes: readonly SizeRow[]
    /** All nine have a result of any kind, given up included (user, 2026-10-12). */
    readonly finished: boolean
    /** At least one board has a result: when the Results button shows (rule 9). */
    readonly anyResult: boolean
}

const ORDER: readonly Difficulty[] = ['easy', 'normal', 'hard']

const stateOf = (attempt: Attempt | null): BoardState => {
    if (!attempt) return { kind: 'not-started' }
    const result = attempt.result
    if (!result) return { kind: 'in-play' }
    switch (result.kind) {
        case 'solved': return { kind: 'solved', ms: result.ms, assisted: attempt.assisted }
        case 'untimed': return { kind: 'untimed', reason: result.reason, assisted: attempt.assisted }
        case 'given-up': return { kind: 'given-up' }
    }
}

const isSolve = (state: BoardState) => state.kind === 'solved' || state.kind === 'untimed'

export const dayResults = (
    date: string,
    boards: readonly DayBoard[],
    history: ReadonlyMap<string, Attempt>,
): DayResults => {
    const attemptFor = (board: DayBoard): Attempt | null => {
        const attempt = history.get(board.puzzleId)
        return attempt && belongsTo(attempt, { ...board, date }) ? attempt : null
    }
    const sizes = ORDER.flatMap(difficulty => {
        const three = boards.filter(board => board.difficulty === difficulty)
            .sort((a, b) => a.level - b.level)
        if (three.length === 0) return []
        const attempts = three.map(attemptFor)
        const states = attempts.map(stateOf)
        return [{
            difficulty,
            size: three[0].size,
            boards: states,
            result: sizeResult(attempts),
            finished: states.length === 3 && states.every(isSolve),
        }]
    })
    const all = sizes.flatMap(row => row.boards)
    const hasResult = (state: BoardState) => isSolve(state) || state.kind === 'given-up'
    return {
        date,
        sizes,
        finished: all.length === 9 && all.every(hasResult),
        anyResult: all.some(hasResult),
    }
}
