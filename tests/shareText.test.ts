import { describe, expect, it } from 'vitest'
import { RULESET, type Attempt } from '@/app/challenge/attempt'
import { dayResults, type DayBoard, type Difficulty } from '@/app/challenge/dayResults'
import { shareText } from '@/app/dominoFill/shareText'
import { dayWords, sizeWords } from '@/app/dominoFill/challengeText'
import { resolveSiteUrl } from '@/app/siteMetadata'

/** What Share copies (slice 3b, rule 11; user, 2026-10-12), exactly. */

const DATE = '2026-10-12'
const SIZE: Record<Difficulty, number> = { easy: 6, normal: 7, hard: 8 }
const NINE: DayBoard[] = (['easy', 'normal', 'hard'] as const).flatMap(difficulty =>
    ([1, 2, 3] as const).map(level => ({
        difficulty, level, size: SIZE[difficulty],
        puzzleId: `${DATE}|${difficulty}${level}`, definitionHash: `hash-${difficulty}${level}`,
    })))
const solved = (ms: number, assisted = false): Partial<Attempt> =>
    ({ result: { kind: 'solved', ms }, finishedAt: ms, assisted })
const results = (over: (Partial<Attempt> | null)[]) => dayResults(DATE, NINE, new Map(
    NINE.flatMap((board, n) => over[n] ? [[board.puzzleId, {
        puzzleId: board.puzzleId, definitionHash: board.definitionHash, date: DATE, ruleset: RULESET,
        startedAt: 0, assisted: false, clockError: false, ...over[n],
    } as Attempt]] : [])))
const SITE = 'https://domino-fill.vercel.app'

describe('the shared text', () => {
    it('is the decided grid, line for line', () => {
        const day = results([
            solved(60_000), solved(80_000), solved(81_000),
            solved(100_000), solved(101_000, true), solved(101_000),
            solved(200_000), { result: { kind: 'given-up' } }, null,
        ])
        expect(shareText(day, 12, SITE)).toBe([
            'Domino Fill · 12 Oct 2026',
            '6×6 🟩🟩🟩 3:41',
            '7×7 🟩🟨🟩 5:02 · with hints',
            '8×8 🟩⬛⬜ partial',
            '🔥 12-day streak',
            'domino-fill.vercel.app',
        ].join('\n'))
    })

    it('marks a solve without a time by its hints, and anything unfinished as not played', () => {
        const day = results([
            { result: { kind: 'untimed', reason: 'clock-error' }, finishedAt: 1, clockError: true },
            { result: { kind: 'untimed', reason: 'finish-lost' }, finishedAt: 1, assisted: true },
            {},
            null, null, null, null, null, null,
        ])
        expect(shareText(day, 1, SITE).split('\n')[1]).toBe('6×6 🟩🟨⬜ partial')
    })

    it('leaves the streak out at 0', () => {
        const text = shareText(results([solved(1_000), null, null, null, null, null, null, null, null]), 0, SITE)
        expect(text).not.toContain('🔥')
        expect(text.split('\n')).toHaveLength(5)
    })

    it('carries the configured site\'s host, never its scheme, and nothing of the puzzles', () => {
        const day = results([solved(1_000), null, null, null, null, null, null, null, null])
        const text = shareText(day, 3, resolveSiteUrl('https://example.org/some/path'))
        expect(text.split('\n').at(-1)).toBe('example.org')
        expect(text).not.toMatch(/https?:/)
        expect(text).not.toMatch(/hash-|\|/)
    })
})

describe('the words it shares with the results screen', () => {
    it('say a size\'s total, with hints, or partial', () => {
        expect(sizeWords({ kind: 'total', ms: 221_000, assisted: false })).toBe('3:41')
        expect(sizeWords({ kind: 'total', ms: 302_000, assisted: true })).toBe('5:02 · with hints')
        expect(sizeWords({ kind: 'partial' })).toBe('partial')
    })

    it('say a date on the calendar, in any month', () => {
        expect(dayWords('2026-10-12')).toBe('12 Oct 2026')
        expect(dayWords('2027-01-01')).toBe('1 Jan 2027')
        expect(dayWords('2026-12-31')).toBe('31 Dec 2026')
    })
})
