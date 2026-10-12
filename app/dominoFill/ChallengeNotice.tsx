"use client"
import { observer } from "mobx-react"
import type { PuzzleSession } from "../stores/PuzzleSession"

/**
 * One warning line above a challenge board (slice 3a, rule 17), at most one message, the
 * most important first:
 * 1. this browser can't save at all, so the challenge runs in tab memory (rule 15's
 *    amendment, the user's "timed but unsaved");
 * 2. a detected clock change couldn't be saved yet (rule 5);
 * 3. the board's moves aren't being saved.
 *
 * It exists only while one applies, so it costs the board no height otherwise. A status
 * region, so a new message is announced once.
 */

export const noticeFor = (session: PuzzleSession): string | null => {
    const challenge = session.rootStore.challenge
    const binding = session.challengeBinding
    if (!challenge || !binding || session.challengeView.kind === 'casual') return null
    if (challenge.unsaved) return 'This browser can\'t save the challenge: your times last until you close this tab.'
    if (binding.clockErrorPending && binding.error === 'save') return 'The clock change couldn\'t be saved yet.'
    if (binding.progressSaveFailed) return 'Your moves aren\'t being saved. Keep this page open.'
    return null
}

const ChallengeNotice: React.FC<{ session: PuzzleSession }> = ({ session }) => {
    const notice = noticeFor(session)
    if (!notice) return null
    return (
        <div data-chrome>
            <p role="status" data-challenge-notice className="rounded-lg bg-banner-surface px-3 py-2 text-body">
                {notice}
            </p>
        </div>
    )
}

export default observer(ChallengeNotice)
