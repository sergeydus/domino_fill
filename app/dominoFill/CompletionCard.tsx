"use client"
import { useEffect, useRef } from "react"
import { observer } from "mobx-react"
import { motion } from "motion/react"
import { LevelStore } from "../stores/BoardsStore"
import { PuzzleSession } from "../stores/PuzzleSession"
import { MOTION } from "./motion"
import { control } from "../controls"
import { DIFFICULTY_NAME } from "./DifficultySlider"

/**
 * What winning looks like (spec P1-4).
 *
 * Before this, solving a board set `pointerEvents: none` and played a file called
 * `winSilent.mp3`: the board stopped responding, nothing was said, and nothing happened
 * next. The game did not celebrate, it *froze* — and since the completion reaction never
 * cleared the flag, the freeze was permanent (D10-h).
 *
 * Three obligations are met here, and it is worth naming them because two are inherited:
 *
 * 1. A visible celebration and a Next/Replay affordance, announced to assistive technology.
 * 2. **P1-1's deferred completion-focus clause.** That clause required focus to move to the
 *    Next control on completion, and was deferred out of row 13 because there was no
 *    focusable control to move to — at the time the level arrows were `motion.div`s with
 *    an `onClick`. This card brought its own real `<button>`, so the clause closed here
 *    rather than waiting on P1-8; row 19 has since converted the arrows too, and the
 *    card's button remains the right target because it is the one the player is looking
 *    at when the board is won.
 * 3. The board is made **`inert`**, not `pointerEvents: none` (spec P1-4). They are not
 *    equivalent: `pointer-events` stops the mouse and nothing else, leaving every cell
 *    still tabbable and still announced, so a keyboard or screen-reader user could keep
 *    "playing" a board that had already been won.
 *
 * **Three levels, loudest first (graphics spec P2-3, row 15).** The outcome, "Solved!", in the
 * card-title role, bold, in `success`: the one thing on the card that is the solved state. Then
 * which puzzle it was, in the body role at a medium weight: the line this row added, so the
 * card says what was solved and not only that something was. Then the actions, secondary
 * controls. Each differs from the others in size *and* weight, so the order holds without
 * colour. The card is the panel's white, lifted by its shadow; it was a green slab, whose
 * white "Solved!" was no louder than the card around it.
 */

type Props = {
    session: PuzzleSession
    levels: LevelStore
}

const CompletionCard: React.FC<Props> = ({ session, levels }) => {
    const cardRef = useRef<HTMLDivElement | null>(null)
    const nextRef = useRef<HTMLButtonElement | null>(null)
    const replayRef = useRef<HTMLButtonElement | null>(null)

    /*
     * Bring the whole card into view, then move focus to its primary action.
     *
     * The card only mounts once the board is solved, so mounting *is* the completion
     * transition and no flag-watching is needed. Next when there is a next level, Replay
     * when there is not: the rule is "the primary action", and on the last level of a
     * difficulty there is no next one to offer.
     *
     * The scroll is not redundant with the focus. Focusing scrolls the *button* into view,
     * which leaves the rest of the card wherever it was -- measured at 360x640, where the
     * card landed at top 532 / bottom 652 in a 640px viewport, so its lower edge and part
     * of the buttons sat below the fold on exactly the device most people play on.
     * `block: 'nearest'` scrolls the minimum needed, and `preventScroll` stops the focus
     * from undoing it.
     */
    useEffect(() => {
        cardRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        (nextRef.current ?? replayRef.current)?.focus({ preventScroll: true })
    }, [])

    const onNext = () => {
        // Guarded rather than assumed: the button is only rendered when there is a next
        // level, but the store is the authority on that.
        levels.goToNextLevel()
    }

    return (
        <motion.div
            ref={cardRef}
            data-completion-card
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-3 rounded-2xl bg-panel text-panel-ink px-6 py-4 shadow-lg"
            // Inside P1-6's limits (`motion.ts`), as P2-3 asks: a tenth of a cell up, where it
            // was 8px and a 90% scale -- a squash measured in card widths, not cells -- over
            // 250ms. The card is on screen and announced immediately either way; the
            // animation only carries it the last of the way.
            initial={{ opacity: 0, y: MOTION.card.offset * session.squareSize }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION.card.duration }}
        >
            <div className="flex flex-col items-center gap-1">
                <p className="text-card-title font-bold text-success" data-completion-message>
                    Solved!
                </p>
                <p className="text-body font-medium" data-completion-detail>
                    {DIFFICULTY_NAME[levels.difficulty]} · puzzle {levels.level} of 3
                </p>
            </div>

            {/* Secondary controls (graphics P2-2, row 14): the card's own surface is the
                outcome, and its actions are what comes after it. */}
            <div className="flex flex-row gap-2">
                {levels.hasNextLevel && (
                    <button
                        type="button"
                        ref={nextRef}
                        data-next-level
                        className={control('secondary')}
                        onClick={onNext}
                    >
                        Next level
                    </button>
                )}
                <button
                    type="button"
                    ref={replayRef}
                    data-replay
                    className={control('secondary')}
                    onClick={() => session.reset()}
                >
                    Play again
                </button>
            </div>
        </motion.div>
    )
}

export default observer(CompletionCard)
