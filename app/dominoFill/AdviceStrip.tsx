"use client"
import { observer } from 'mobx-react'
import type { PuzzleSession } from '../stores/PuzzleSession'
import { adviceIsProblem, adviceMessage } from './adviceText'
import { refusalMessage } from './refusalText'

/**
 * Where the board says things: Check's and Hint's answers (spec P1-5, row 18e), and why a
 * move was refused (keyboard polish, section 3 of its contract in NEXT-STEPS).
 *
 * **Two regions, one for the eye and one for the ear**, because what is shown and what is
 * said part ways. A refusal covers an earlier answer in the row, and when the refusal clears
 * the answer comes back into view. When the row was the live region, bringing it back said
 * it again, an answer to a question nobody had just asked. So:
 *
 *   - **the row** (`data-advice`) is what is visible, and is not live. A reason while a
 *     refusal stands, else the latest answer;
 *   - **the announcer** (`data-announcer`) is visually hidden and polite. It holds only
 *     what was said last (`lastSaid`), while it is still current: an answer as it arrives, a
 *     reason until its cross clears (codex). An answer uncovered again is not in it.
 *
 * Each message is in the accessibility tree once. While the announcer holds it, the row's
 * copy is `aria-hidden`, so reading the page does not meet it twice; an answer back in view
 * is the row's alone, and readable there.
 *
 * `role="status"` is polite, so an announcement never interrupts: the player may be
 * mid-drag when it arrives. It does not promise every rapid message is spoken, which is why
 * the contract's acceptance includes a real screen reader.
 *
 * **Keyed on the counters, not on the text.** Pressing Check twice on an unchanged board is
 * two questions and deserves two answers, and a rock refused twice is two refusals; a live
 * region whose content has not changed announces nothing, which is silence exactly when the
 * player is trying again because they are unsure it worked. Remounting the node re-announces
 * it.
 *
 * The announcer is always in the tree, empty when there is nothing to say: a live region that
 * appears at the same moment as its content is a well-known way to have it not announced,
 * because the region has to be observed before the text lands in it.
 */
const AdviceStrip: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const { advice, adviceTick, refusal, rejectionTick, lastSaid } = boardsStore
    const said = refusal ? 'refusal' : advice && lastSaid === 'advice' ? 'advice' : null

    return (
        <>
            <div data-advice className='min-h-6 text-center text-body'>
                {refusal ? (
                    <span
                        key={`refusal-${rejectionTick}`}
                        data-refusal-reason={refusal.reason.kind}
                        aria-hidden='true'
                        className='font-semibold text-problem'
                    >
                        {refusalMessage(refusal.reason)}
                    </span>
                ) : advice && (
                    <span
                        key={adviceTick}
                        data-advice-kind={advice.kind}
                        aria-hidden={said === 'advice' || undefined}
                        className={adviceIsProblem(advice) ? 'font-semibold text-problem' : ''}
                    >
                        {adviceMessage(advice)}
                    </span>
                )}
            </div>
            <div data-announcer role='status' aria-live='polite' aria-atomic='true' className='sr-only text-body'>
                {said === 'refusal' && refusal && (
                    <span key={`refusal-${rejectionTick}`}>{refusalMessage(refusal.reason)}</span>
                )}
                {said === 'advice' && advice && (
                    <span key={`advice-${adviceTick}`}>{adviceMessage(advice)}</span>
                )}
            </div>
        </>
    )
}

export default observer(AdviceStrip)
