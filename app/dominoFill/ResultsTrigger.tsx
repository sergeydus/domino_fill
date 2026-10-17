"use client"
import { useEffect } from 'react'
import { reaction } from 'mobx'
import type { LevelStore } from '../stores/BoardsStore'

/** The pause before the results open by themselves (user, 2026-10-12). */
export const RESULTS_DELAY_MS = 1500

/**
 * Opens the results by themselves after this tab's own finish completes a size or the day
 * (slice 3b, rule 8; user, 2026-10-11). Renders nothing.
 *
 * It reacts to the coordinator's `lastFinish`, never to the history, which also changes for
 * other tabs' results. On a new signal it checks that the finished board is still the one on
 * screen, on the day being viewed, and that its size or the day is now finished. Then it
 * waits 1.5 seconds, so the Solved! card's committed time is seen first, and opens Results.
 *
 * The wait ends without opening if the board or the day changes, Archive opens, Practice
 * starts, or Results is opened by hand: the signal is spent then, so opening and closing
 * Results during the wait can't make it open again (codex).
 */
const ResultsTrigger = ({ levels }: { levels: LevelStore }) => {
    useEffect(() => {
        const challenge = levels.rootStore.challenge
        if (!challenge) return
        let cancel = () => {}

        // Each signal is a new value (its serial), so this runs once per result, and never
        // for one from before it mounted.
        const stop = reaction(() => challenge.lastFinish, signal => {
            if (!signal) return
            // The board on screen, which is one of the viewed day's: a board of another day is
            // another session, so this also checks the day.
            const board = levels.currentBoard
            const binding = board && challenge.bindings.get(board)
            const results = levels.challengeResults
            if (!board || !binding || !results || board.definition.puzzleId !== signal.puzzleId) return
            const difficulty = levels.challengeDay?.boards.find(b => b.puzzleId === signal.puzzleId)?.difficulty
            const size = results.sizes.find(row => row.difficulty === difficulty)
            if (!size?.finished && !results.finished) return

            // Anything that moves the player on before the pause ends spends the signal.
            const movedOn = () => levels.currentBoard !== board
                || levels.archiveOpen || levels.results !== null || binding.practice !== null
            if (movedOn()) return
            // No wait is running here: one ends when its board leaves the screen, and a board
            // signals once. A late signal for another board returned above, leaving it alone.
            const watch = reaction(movedOn, moved => { if (moved) cancel() })
            const timer = setTimeout(() => {
                cancel()
                levels.openResults()
            }, RESULTS_DELAY_MS)
            cancel = () => {
                watch()
                clearTimeout(timer)
                cancel = () => {}
            }
        })
        return () => {
            stop()
            cancel()
        }
    }, [levels])
    return null
}

export default ResultsTrigger
