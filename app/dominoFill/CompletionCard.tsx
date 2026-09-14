"use client"
import { useEffect, useRef } from "react"
import { observer } from "mobx-react"
import { motion } from "motion/react"
import { LevelStore } from "../stores/BoardsStore"
import { PuzzleSession } from "../stores/PuzzleSession"

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
 *    focusable control to move to — the level arrows are `motion.div`s with an `onClick`.
 *    This card brings its own real `<button>`, so the clause closes here rather than
 *    waiting on P1-8 to convert the arrows.
 * 3. The board is made **`inert`**, not `pointerEvents: none` (spec P1-4). They are not
 *    equivalent: `pointer-events` stops the mouse and nothing else, leaving every cell
 *    still tabbable and still announced, so a keyboard or screen-reader user could keep
 *    "playing" a board that had already been won.
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
            className="control-surface flex flex-col items-center gap-3 rounded-2xl bg-[#419dc8] text-white px-6 py-4 shadow-lg"
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            // Well inside P1-4's 500ms: the card is on screen and announced immediately,
            // and the animation only carries it the last of the way.
            transition={{ duration: 0.25 }}
        >
            <p className="text-2xl font-bold" data-completion-message>
                Solved!
            </p>

            <div className="flex flex-row gap-2 text-lg">
                {levels.hasNextLevel && (
                    <button
                        type="button"
                        ref={nextRef}
                        data-next-level
                        className="control-surface cursor-pointer rounded bg-white/20 px-4 py-2 hover:bg-white/30"
                        onClick={onNext}
                    >
                        Next level
                    </button>
                )}
                <button
                    type="button"
                    ref={replayRef}
                    data-replay
                    className="control-surface cursor-pointer rounded bg-white/20 px-4 py-2 hover:bg-white/30"
                    onClick={() => session.reset()}
                >
                    Play again
                </button>
            </div>
        </motion.div>
    )
}

export default observer(CompletionCard)
