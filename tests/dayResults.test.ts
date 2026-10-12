import { describe, expect, it } from 'vitest'
import { RULESET, type Attempt } from '@/app/challenge/attempt'
import { dayResults, type DayBoard, type Difficulty } from '@/app/challenge/dayResults'

/**
 * One day's results as data (slice 3b, rules 1 and 2): what the results screen, Share and
 * the screen's opening by itself all read.
 */

const DATE = '2026-10-12'
const SIZE: Record<Difficulty, number> = { easy: 6, normal: 7, hard: 8 }
const board = (difficulty: Difficulty, level: 1 | 2 | 3): DayBoard => ({
    difficulty, level, size: SIZE[difficulty],
    puzzleId: `${DATE}|${difficulty}${level}`, definitionHash: `hash-${difficulty}${level}`,
})
const NINE: DayBoard[] = (['easy', 'normal', 'hard'] as const)
    .flatMap(difficulty => ([1, 2, 3] as const).map(level => board(difficulty, level)))

const START = Date.UTC(2026, 9, 12, 9)
const attempt = (of: DayBoard, over: Partial<Attempt> = {}): Attempt => ({
    puzzleId: of.puzzleId, definitionHash: of.definitionHash, date: DATE, ruleset: RULESET,
    startedAt: START, assisted: false, clockError: false, ...over,
})
const solved = (ms: number, assisted = false): Partial<Attempt> =>
    ({ result: { kind: 'solved', ms }, finishedAt: START + ms, assisted })
const historyOf = (entries: [DayBoard, Partial<Attempt>][]) =>
    new Map(entries.map(([of, over]) => [of.puzzleId, attempt(of, over)]))
const [e1, e2, e3, m1, m2, m3, h1, h2, h3] = NINE

describe('each board\'s state', () => {
    it('reads every kind of result, and its absence', () => {
        const history = historyOf([
            [e1, solved(83_000)],
            [e2, solved(61_000, true)],
            [e3, { result: { kind: 'untimed', reason: 'clock-error' }, finishedAt: START + 5, clockError: true }],
            [m1, { result: { kind: 'given-up' } }],
            [m2, {}],
        ])
        const [easy, medium] = dayResults(DATE, NINE, history).sizes
        expect(easy.boards).toEqual([
            { kind: 'solved', ms: 83_000, assisted: false },
            { kind: 'solved', ms: 61_000, assisted: true },
            { kind: 'untimed', reason: 'clock-error', assisted: false },
        ])
        expect(medium.boards).toEqual([{ kind: 'given-up' }, { kind: 'in-play' }, { kind: 'not-started' }])
    })

    it('gives each size and level its place, whatever order the boards come in', () => {
        const results = dayResults(DATE, [...NINE].reverse(), historyOf([[e1, solved(83_000)], [h3, {}]]))
        expect(results.sizes.map(row => [row.difficulty, row.size])).toEqual([['easy', 6], ['normal', 7], ['hard', 8]])
        expect(results.sizes[0].boards.map(state => state.kind)).toEqual(['solved', 'not-started', 'not-started'])
        expect(results.sizes[2].boards.map(state => state.kind)).toEqual(['not-started', 'not-started', 'in-play'])
    })

    it('ignores an attempt that isn\'t this board\'s: each identity check alone', () => {
        for (const [why, over] of [
            ['puzzle ID', { puzzleId: 'another' }],
            ['definition hash', { definitionHash: 'not-this-puzzle' }],
            ['date', { date: '2026-10-11' }],
        ] as const) {
            const results = dayResults(DATE, NINE, historyOf([[e1, { ...solved(83_000), ...over }]]))
            expect(results.sizes[0].boards[0], why).toEqual({ kind: 'not-started' })
            expect(results.anyResult, why).toBe(false)
        }
    })
})

describe('each size (rule 2)', () => {
    it('totals three timed solves, marked with hints when one had them', () => {
        const history = historyOf([[e1, solved(60_000)], [e2, solved(61_000, true)], [e3, solved(100_000)]])
        const easy = dayResults(DATE, NINE, history).sizes[0]
        expect(easy.result).toEqual({ kind: 'total', ms: 221_000, assisted: true })
        expect(easy.finished).toBe(true)
    })

    it('is partial, and still finished, with an untimed solve', () => {
        const history = historyOf([[e1, solved(60_000)], [e2, solved(61_000)],
            [e3, { result: { kind: 'untimed', reason: 'finish-lost' }, finishedAt: START + 5 }]])
        const easy = dayResults(DATE, NINE, history).sizes[0]
        expect(easy.result).toEqual({ kind: 'partial' })
        expect(easy.finished).toBe(true)
    })

    it('is not finished with a board given up, or still in play', () => {
        const gaveUp = historyOf([[e1, solved(60_000)], [e2, solved(61_000)], [e3, { result: { kind: 'given-up' } }]])
        expect(dayResults(DATE, NINE, gaveUp).sizes[0].finished).toBe(false)
        const inPlay = historyOf([[e1, solved(60_000)], [e2, solved(61_000)], [e3, {}]])
        expect(dayResults(DATE, NINE, inPlay).sizes[0].finished).toBe(false)
    })

    it('is not finished when the day has fewer than three of its boards', () => {
        const two = dayResults(DATE, [e1, e2], historyOf([[e1, solved(60_000)], [e2, solved(61_000)]]))
        expect(two.sizes[0].finished).toBe(false)
    })
})

describe('the day', () => {
    const allNine = (last: Partial<Attempt>) => historyOf([
        [e1, solved(1_000)], [e2, solved(1_000)], [e3, solved(1_000)],
        [m1, solved(1_000)], [m2, solved(1_000)], [m3, solved(1_000)],
        [h1, solved(1_000)], [h2, solved(1_000)], [h3, last],
    ])

    it('is finished when all nine have a result, a given-up board included (user, 2026-10-12)', () => {
        const results = dayResults(DATE, NINE, allNine({ result: { kind: 'given-up' } }))
        expect(results.finished).toBe(true)
        expect(results.sizes[2].finished).toBe(false)
    })

    it('is not finished with a board still in play, or a board missing', () => {
        expect(dayResults(DATE, NINE, allNine({})).finished).toBe(false)
        expect(dayResults(DATE, NINE.slice(0, 8), allNine(solved(1_000))).finished).toBe(false)
    })

    it('has a result once any board has one, given up included', () => {
        expect(dayResults(DATE, NINE, new Map()).anyResult).toBe(false)
        expect(dayResults(DATE, NINE, historyOf([[h2, {}]])).anyResult).toBe(false)
        expect(dayResults(DATE, NINE, historyOf([[h2, { result: { kind: 'given-up' } }]])).anyResult).toBe(true)
        expect(dayResults(DATE, NINE, historyOf([[h2, solved(1_000)]])).anyResult).toBe(true)
    })
})
