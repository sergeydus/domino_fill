"use client"
import { observer } from "mobx-react"
import type { PuzzleSession } from "../stores/PuzzleSession"
import type { LevelStore } from "../stores/BoardsStore"
import type { BoardView } from "../challenge/coordinator"
import { control } from "../controls"
import { boardName } from "./challengeText"

/**
 * A challenge board before Start (slice 3a, rules 9-11).
 *
 * Rendered *instead of* the board, never over it: a hidden or inert grid would still put
 * the cells, rocks and line targets in the DOM and the accessibility tree, and that is the
 * puzzle (slice 2, item 3). So nothing here is derived from the board's content, only from
 * its size and its place among the nine.
 *
 * It takes the shell's own box (`shellWidth`, `shellHeight`), computed from the same height
 * budget the revealed board gets: every chrome row is present in both states, the clock's
 * included (rule 10). So pressing Start swaps one box for an identical one and nothing on
 * the page moves.
 *
 * One obvious Start, as the LinkedIn games have (Principle 6). Nothing focuses it on
 * arrival: the player may be on their way to another board.
 */

type Props = {
    session: PuzzleSession
    levels: LevelStore
    view: BoardView
}

/** After a reveal that the keyboard asked for, put the keyboard on the board. */
const focusBoard = () => {
    const grid = document.querySelector<HTMLElement>('[data-board-shell] [role="grid"]')
    const cell = grid?.querySelector<HTMLElement>('[tabindex="0"]')
    ;(cell ?? grid)?.focus()
}

const ChallengeCover: React.FC<Props> = ({ session, levels, view }) => {
    const challenge = session.rootStore.challenge
    const binding = session.challengeBinding
    const yesterday = !!binding && !!challenge && binding.date < challenge.deviceDate

    const start = (event: React.MouseEvent<HTMLButtonElement>) => {
        // Focus moves to the board only if Start had it: the Start button is about to stop
        // existing, and focus would otherwise fall back to the page.
        const button = event.currentTarget
        if (document.activeElement !== button) { void session.startChallenge(); return }
        // The start saves first, and the player may move on meanwhile: Tab to another
        // control, or pick another board. Either cancels the handoff, checked at the reveal
        // itself, so the board never takes focus back from where they went (codex).
        let moved = false
        const onFocus = (focus: FocusEvent) => { if (focus.target !== button) moved = true }
        document.addEventListener('focusin', onFocus)
        void session.startChallenge().then(started => requestAnimationFrame(() => {
            document.removeEventListener('focusin', onFocus)
            if (started && !moved && levels.currentBoard === session) focusBoard()
        }))
    }

    let message: string | null = null
    let action: 'start' | 'retry' | null = null
    switch (view.kind) {
        case 'preparing': message = 'Getting the challenge ready…'; break
        case 'unprepared': message = 'The challenge couldn\'t be prepared.'; action = 'retry'; break
        case 'future': message = `This board opens on ${binding?.date}.`; break
        case 'mismatch': message = 'This board\'s saved record doesn\'t match it, so it can\'t be started here.'; break
        case 'starting': action = 'start'; break
        case 'ready':
            if (view.startFailed) message = 'Your start couldn\'t be saved, so your time hasn\'t started.'
            action = 'start'
            break
    }

    return (
        <section
            data-challenge-cover={view.kind}
            aria-label="Challenge board, covered"
            className="flex flex-col items-center justify-center gap-3 rounded-lg border-board-frame bg-panel p-4 text-center text-panel-ink"
            style={{ width: session.shellWidth, height: session.shellHeight, borderWidth: 4 }}
        >
            <p className="text-body font-medium" data-cover-board>
                {boardName(levels.difficulty, session.definition.size, levels.level)}
            </p>
            <p className="text-meta" data-cover-day>
                {yesterday ? 'Yesterday\'s challenge · ends at midnight' : 'Today\'s challenge'}
            </p>
            {message && <p className="text-body" data-cover-message>{message}</p>}
            {action === 'start' && (
                <>
                    <p className="text-body">Your time starts when you press Start.</p>
                    <button
                        type="button"
                        data-challenge-start
                        className={control('primary')}
                        disabled={view.kind === 'starting'}
                        onClick={start}
                    >
                        {view.kind === 'starting' ? 'Starting…' : 'Start'}
                    </button>
                </>
            )}
            {action === 'retry' && (
                <button
                    type="button"
                    data-challenge-retry
                    className={control('secondary')}
                    onClick={() => { void challenge?.retry() }}
                >
                    Try again
                </button>
            )}
        </section>
    )
}

export default observer(ChallengeCover)
