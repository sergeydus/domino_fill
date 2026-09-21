"use client"
import { observer } from "mobx-react"
import { motion } from 'motion/react'
import { LevelStore } from "../stores/BoardsStore"

/**
 * Previous and next puzzle (spec P1-8, row 19).
 *
 * These were the codebase's standing accessibility complaint, cited by name in P1-5's own
 * source as the pile new controls should not join: two `motion.div`s with an `onClick`,
 * carrying no role, no accessible name and no tab stop. Measured before this change, the
 * page's whole tab order was Easy, Medium, Hard, the board, Check, Hint, Reset, Archive --
 * **the level arrows appeared nowhere in it**, so a keyboard could reach every control in
 * the game except the one that changes which puzzle you are playing.
 *
 * Real `<button>`s fix all of it at once: reachable by Tab, operable by Enter and Space,
 * announced as buttons, and `disabled` at the ends of the range rather than merely
 * greyed -- the old version left an unusable control fully interactive and relied on the
 * handler to do nothing, which tells a screen reader nothing at all.
 *
 * The arrow itself is `aria-hidden`: it is one path drawn twice, rotated, and a decorative
 * SVG with no name is noise in the accessibility tree. The button carries the name.
 */

const ARROW_PATH = `M10 20
       Q8 20 8 22
       V42
       Q8 44 10 44
       H34
       V52
       Q34 56 38 53
       L58 34
       Q60 32 58 30
       L38 11
       Q34 8 34 12
       V20
       Z`

const Arrow: React.FC = () => (
    <svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path d={ARROW_PATH} fill="#4FC3F7" stroke="#0288D1" strokeWidth="3" strokeLinejoin="round" />
    </svg>
)

const LevelSelector: React.FC<{ boardsStore: LevelStore }> = ({ boardsStore }) => {
    const currentLevel = boardsStore.level
    const hasNextLevel = boardsStore.level < 3
    const hasPreviousLevel = boardsStore.level > 1
    const onNextLevelClick = () => {
        if (hasNextLevel) {
            boardsStore.setLevel((currentLevel + 1) as 1 | 2 | 3)
        }
    }
    const onPreviousLevelClick = () => {
        if (hasPreviousLevel) {
            boardsStore.setLevel((currentLevel - 1) as 1 | 2 | 3)
        }
    }
    /*
     * The buttons name where they *go*, not which way they point (spec P1-8, row 19).
     *
     * "Next puzzle, 1 of 3" was the first attempt and reads two ways: the "1 of 3" is
     * meant to say where you are, but attached to a button that says "next" it sounds like
     * a destination -- so the control that takes you to puzzle 2 announces the number 1.
     * The destination is what a player choosing a button needs, and the group carries the
     * position instead, which is where a screen reader looks for context anyway.
     *
     * Clamped, so the disabled button at each end names the puzzle you are already on
     * rather than a puzzle 0 or 4 that does not exist.
     */
    const destination = (delta: number) => Math.min(3, Math.max(1, currentLevel + delta))

    return <div className="flex flex-row" role="group" aria-label={`Puzzle ${currentLevel} of 3`}>
        <motion.button
            type="button"
            onClick={onPreviousLevelClick}
            disabled={!hasPreviousLevel}
            data-level="previous"
            aria-label={`Go to puzzle ${destination(-1)} of 3`}
            className="rotate-180 cursor-pointer control-surface disabled:cursor-not-allowed"
            initial={{ scale: 1 }}
            whileHover={hasPreviousLevel ? { scale: 1.2 } : undefined}
            style={{ filter: hasPreviousLevel ? 'unset' : 'grayscale(100%)' }}
        >
            <Arrow />
        </motion.button>
        <motion.button
            type="button"
            onClick={onNextLevelClick}
            disabled={!hasNextLevel}
            data-level="next"
            aria-label={`Go to puzzle ${destination(+1)} of 3`}
            className="cursor-pointer control-surface disabled:cursor-not-allowed"
            initial={{ scale: 1 }}
            whileHover={hasNextLevel ? { scale: 1.2 } : undefined}
            style={{ filter: hasNextLevel ? 'unset' : 'grayscale(100%)' }}
        >
            <Arrow />
        </motion.button>
    </div>
}
export default observer(LevelSelector)
