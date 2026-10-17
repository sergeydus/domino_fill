import type { BoardState, DayResults } from '../challenge/dayResults'
import { NAME } from '../siteMetadata'
import { dayWords, sizeWords } from './challengeText'

/**
 * What Share copies (slice 3b, rule 11; user, 2026-10-12): a Wordle-style grid, a square
 * per board and each size's line, then the streak and the site's address.
 *
 *     Domino Fill · 12 Oct 2026
 *     6×6 🟩🟩🟩 3:41
 *     7×7 🟩🟨🟩 5:02 · with hints
 *     8×8 🟩⬛⬜ partial
 *     🔥 12-day streak
 *     domino-fill.vercel.app
 *
 * Spoiler-free by construction: it is made from results alone, so nothing of the puzzles --
 * rocks, numbers, positions -- can reach it.
 */

const square = (state: BoardState): string => {
    switch (state.kind) {
        case 'solved':
        case 'untimed': return state.assisted ? '🟨' : '🟩'
        case 'given-up': return '⬛'
        default: return '⬜'
    }
}

/** `site` is an origin, `resolveSiteUrl`'s; the text carries its host, without the scheme. */
export const shareText = (results: DayResults, streak: number, site: string): string => [
    `${NAME} · ${dayWords(results.date)}`,
    ...results.sizes.map(row =>
        `${row.size}×${row.size} ${row.boards.map(square).join('')} ${sizeWords(row.result)}`),
    ...(streak > 0 ? [`🔥 ${streak}-day streak`] : []),
    new URL(site).host,
].join('\n')
