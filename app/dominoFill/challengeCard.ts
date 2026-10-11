import type { BoardView } from "../challenge/coordinator"
import type { PuzzleSession } from "../stores/PuzzleSession"

/** The views that are the challenge's, rather than today's casual game. */
export const isChallengeView = (view: BoardView) => view.kind !== 'casual' && view.kind !== 'legacy'

/**
 * Whether the card is up (slice 3a, rule 15).
 *
 * A casual board keeps today's rule, `completed`. A challenge board follows its view
 * instead (codex): up while a first solve saves, and for a solved result unless a Practice
 * run is under way and unsolved. So a result whose progress was lost still shows its card
 * over the restored empty board, and a covered board never shows one, whatever its old
 * `completed` says.
 */
export const cardIsUp = (session: PuzzleSession): boolean => {
    const view = session.challengeView
    if (!isChallengeView(view)) return session.completed
    if (view.kind === 'finishing') return true
    if (view.kind !== 'result' || view.result.kind === 'given-up') return false
    return view.practice === null || view.practice.solved
}
