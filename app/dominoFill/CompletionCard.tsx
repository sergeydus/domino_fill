"use client"
import { useEffect, useRef } from "react"
import { observer } from "mobx-react"
import { motion } from "motion/react"
import { LevelStore } from "../stores/BoardsStore"
import { PuzzleSession } from "../stores/PuzzleSession"
import { MOTION } from "./motion"
import { control } from "../controls"
import { DIFFICULTY_NAME } from "./DifficultySlider"
import { formatTime, resultWords } from "./challengeText"
import { isChallengeView } from "./challengeCard"

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
    const retryRef = useRef<HTMLButtonElement | null>(null)
    const view = session.challengeView
    const challenge = isChallengeView(view)
    // Slice 3a, rule 16: on a challenge board, the next of the nine still to play, in any size.
    const next = challenge ? levels.nextChallengeBoard() : null

    /*
     * Bring the whole card into view, then move focus to its primary action.
     *
     * The card only mounts once the board is solved, so mounting *is* the completion
     * transition (a challenge's late actions are below). Next when there is a next level,
     * Replay when there is not: the rule is "the primary action", and on the last level of
     * a difficulty there is no next one to offer.
     *
     * The scroll is not redundant with the focus. Focusing scrolls the *button* into view,
     * which leaves the rest of the card wherever it was -- measured at 360x640, where the
     * card landed at top 532 / bottom 652 in a 640px viewport, so its lower edge and part
     * of the buttons sat below the fold on exactly the device most people play on.
     * `block: 'nearest'` scrolls the minimum needed, and `preventScroll` stops the focus
     * from undoing it.
     *
     * On a challenge board the card can mount with no action at all (slice 3a, rule 16):
     * the last of the nine, while its finish saves, has no Next board and no Practice yet.
     * So the focus is *owed* from mount and paid when the first action appears: Practice
     * once the save commits, or Try again once it fails. The debt is cancelled the moment
     * focus goes anywhere outside the card, so an action that turns up later never takes
     * focus back from where the player went (codex). And when the focused action itself
     * goes, as Try again does once the save goes through, focus falls to the page, and is
     * passed on to the action that took its place.
     */
    const owed = useRef(true)
    const holder = useRef<HTMLElement | null>(null)
    useEffect(() => {
        cardRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const onFocus = (focus: FocusEvent) => {
            if (cardRef.current?.contains(focus.target as Node)) holder.current = focus.target as HTMLElement
            else owed.current = false
        }
        /*
         * A blur lets go of the holder: a move out of the card, and a click on plain text,
         * which moves focus to the page with no `focusin` anywhere (codex). A move to another
         * button in the card sets it again with that button's `focusin`.
         *
         * But Chromium also fires `focusout` when the focused button is *removed* (measured),
         * and that is the handoff case: let go at once, and the removal Practice replaces
         * would hand nothing on. So the letting go waits a microtask, and the handoff effect,
         * which React runs as it commits the removal, comes first (measured in Chromium and
         * jsdom). Were React ever to run it later, the handoff would simply not happen and
         * focus would stay on the page: never a steal.
         */
        const onBlur = (blur: FocusEvent) => {
            const left = blur.target
            queueMicrotask(() => { if (holder.current === left) holder.current = null })
        }
        document.addEventListener('focusin', onFocus)
        document.addEventListener('focusout', onBlur)
        return () => {
            document.removeEventListener('focusin', onFocus)
            document.removeEventListener('focusout', onBlur)
        }
    }, [])
    useEffect(() => {
        const action = nextRef.current ?? replayRef.current ?? retryRef.current
        if (!action) return
        // A holder is kept only while focus stays in the card, so one that has gone took
        // focus with it, down to the page.
        const dropped = !!holder.current && !holder.current.isConnected
        if (!owed.current && !dropped) return
        owed.current = false
        action.focus({ preventScroll: true })
    })

    const onNext = () => {
        // Guarded rather than assumed: the button is only rendered when there is a next
        // level, but the store is the authority on that.
        if (!challenge) levels.goToNextLevel()
        else if (next) levels.goToBoard(next)
    }

    /*
     * The challenge's result lines (slice 3a, rule 15), under the board's name: the time and
     * whether hints were used, or why there is no time; while the first solve saves, that it
     * is saving, and if the save failed, that it is still trying.
     */
    const lines: string[] = []
    if (view.kind === 'finishing') {
        lines.push(view.saveFailed
            ? 'Your time isn\'t saved yet. Keep this page open; it\'s still trying.'
            : 'Saving your time…')
    } else if (view.kind === 'result') {
        const result = resultWords(view.result, view.assisted)
        if (view.practice) lines.push(`Practice · ${formatTime(view.practice.elapsed)}`, `Your result: ${result}`)
        else lines.push(result)
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
                {lines.map(line => (
                    <p key={line} className="text-body tabular-nums" data-completion-result>{line}</p>
                ))}
            </div>

            {/* Secondary controls (graphics P2-2, row 14): the card's own surface is the
                outcome, and its actions are what comes after it. */}
            <div className="flex flex-row gap-2">
                {(challenge ? next !== null : levels.hasNextLevel) && (
                    <button
                        type="button"
                        ref={nextRef}
                        data-next-level
                        className={control('secondary')}
                        onClick={onNext}
                    >
                        {challenge ? 'Next board' : 'Next level'}
                    </button>
                )}
                {view.kind === 'finishing' && view.saveFailed && (
                    <button
                        type="button"
                        ref={retryRef}
                        data-finish-retry
                        className={control('secondary')}
                        onClick={() => { void session.rootStore.challenge?.retry() }}
                    >
                        Try again
                    </button>
                )}
                {view.kind !== 'finishing' && (
                    <button
                        type="button"
                        ref={replayRef}
                        data-replay
                        className={control('secondary')}
                        // Inside the window a replay is timed Practice (D5, rule 11); on a board
                        // with nothing to clear it starts one directly (rule 16).
                        onClick={() => challenge ? session.beginPractice() : session.reset()}
                    >
                        {challenge ? 'Practice' : 'Play again'}
                    </button>
                )}
            </div>
        </motion.div>
    )
}

export default observer(CompletionCard)
