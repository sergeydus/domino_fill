"use client"
import { observer } from "mobx-react"
import type { BoardView } from "../challenge/coordinator"
import { isCoveredView } from "../challenge/coordinator"
import { formatTime, resultWords } from "./challengeText"

/**
 * The clock line above a challenge board (slice 3a, rules 13-14): the always-visible clock
 * the user chose (2026-10-11), as LinkedIn's timed games show it.
 *
 * Present for every challenge view, covered ones included, where it reads a still `0:00`:
 * that is what gives the cover and the revealed board the same height budget (rule 10).
 * Never for a casual board (Principle 1): no row at all, since an empty `data-chrome` row
 * would still cost the board the column's gap.
 *
 * `role="timer"` is not announced as it ticks; the result is announced once, by the card.
 */

const line = (view: BoardView): { text: string, live: boolean } | null => {
    if (isCoveredView(view)) return { text: formatTime(0), live: false }
    switch (view.kind) {
        case 'legacy': return { text: 'Played before the challenge · untimed', live: false }
        case 'playing': {
            if (view.clockError) return { text: 'Clock changed: no time for this board', live: false }
            const parts = [formatTime(view.elapsed)]
            if (view.assisted) parts.push('hints used')
            if (view.closesTonight) parts.push('ends at midnight')
            return { text: parts.join(' · '), live: true }
        }
        case 'finishing': {
            if (view.clockError) return { text: 'Clock changed: no time for this board', live: false }
            return { text: [formatTime(view.elapsed), ...(view.assisted ? ['hints used'] : [])].join(' · '), live: false }
        }
        case 'result': {
            const result = resultWords(view.result, view.assisted)
            return view.practice
                ? { text: `Practice · ${formatTime(view.practice.elapsed)} · Your result: ${result}`, live: !view.practice.solved }
                : { text: result, live: false }
        }
        default: return null
    }
}

/** Its own `data-chrome` row, or nothing at all: a casual board gets no row, not an empty one. */
const ChallengeClock: React.FC<{ view: BoardView }> = ({ view }) => {
    const shown = line(view)
    if (!shown) return null
    return (
        <div data-chrome>
            <p
                role="timer"
                aria-label="Challenge time"
                data-challenge-clock={view.kind}
                data-running={shown.live || undefined}
                className={`text-center text-clock tabular-nums ${isCoveredView(view) ? 'text-ink-muted' : ''}`}
            >
                {shown.text}
            </p>
        </div>
    )
}

export default observer(ChallengeClock)
