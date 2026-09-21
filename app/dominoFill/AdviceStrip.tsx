"use client"
import { observer } from 'mobx-react'
import type { PuzzleSession } from '../stores/PuzzleSession'
import { adviceIsProblem, adviceMessage } from './adviceText'

/**
 * Where Check and Hint answer (spec P1-5, row 18e).
 *
 * A live region, because the answer is the whole feature and a sighted player reads it by
 * seeing it appear. `role="status"` with `aria-live="polite"` announces without interrupting
 * — the player may be mid-drag when it arrives, and barging in on that is the same category
 * of rudeness as swapping the board under them.
 *
 * **Keyed on `adviceTick`, not on the text.** Pressing Check twice on an unchanged board is
 * two questions and deserves two answers; a live region whose content has not changed
 * announces nothing at all, which is silence exactly when the player is pressing the button
 * again because they are unsure it worked. Remounting the node re-announces it.
 *
 * The strip is always in the tree, empty when there is nothing to say: a live region that
 * appears at the same moment as its content is a well-known way to have it not announced,
 * because the region has to be observed before the text lands in it.
 */
const AdviceStrip: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const { advice, adviceTick } = boardsStore

    return (
        <div
            data-advice
            role='status'
            aria-live='polite'
            aria-atomic='true'
            className='min-h-6 text-center text-sm'
        >
            {advice && (
                <span
                    key={adviceTick}
                    data-advice-kind={advice.kind}
                    className={adviceIsProblem(advice) ? 'font-semibold text-[#a10000]' : ''}
                >
                    {adviceMessage(advice)}
                </span>
            )}
        </div>
    )
}

export default observer(AdviceStrip)
