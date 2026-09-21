"use client"
import { motion } from "motion/react"
import { observer } from "mobx-react"
import { LevelStore } from "../stores/BoardsStore"

/**
 * Difficulty (spec P1-8, row 19).
 *
 * These were already real `<button>`s, so they were reachable and operable. What they did
 * not do was say which one is *current*: measured in Chrome, the accessibility tree read
 * `button "Easy 6x6"`, `button "Medium 7x7"`, `button "Hard 8x8"` with no state on any of
 * them, and the only signal that Easy was selected was `background-color`. A screen reader
 * announced three identical choices, and so did a greyscale screen.
 *
 * `aria-pressed` rather than `role="radiogroup"`. The spec offers either; pressed buttons
 * keep these as buttons, which is what every existing test and every sighted player
 * already treats them as, where a radio group would additionally take over the arrow keys
 * and turn three tab stops into one. Both convey the state; only one of them changes the
 * keyboard contract of a control that was not broken.
 *
 * The selected button also gets a ring and bold text, for the reason D10-g gave for the
 * line labels: colour is one channel and roughly one man in twelve cannot use this
 * particular one. `aria-pressed` reaches a screen reader; the ring reaches everyone else.
 */

const LEVELS = [
    { key: 'easy', label: 'Easy 6x6' },
    { key: 'normal', label: 'Medium 7x7' },
    { key: 'hard', label: 'Hard 8x8' },
] as const

const DominoSlider: React.FC<{ boardsStore: LevelStore }> = ({ boardsStore }) => {
    const onClick = (dif: 'easy' | 'normal' | 'hard') => {
        return () => { boardsStore.setDifficulty(dif) }
    }
    return (
        <div className="flex flex-row bg-[#ababab] rounded gap-2 text-2xl p-2" role="group" aria-label="Difficulty">
            {LEVELS.map(({ key, label }) => {
                const selected = boardsStore.difficulty === key
                return (
                    <motion.button
                        key={key}
                        type="button"
                        aria-pressed={selected}
                        data-difficulty={key}
                        data-selected={selected || undefined}
                        className={`cursor-pointer p-2 rounded control-surface ${selected ? 'font-bold ring-2 ring-[#0b3c52]' : ''}`}
                        animate={{ backgroundColor: selected ? '#419dc8' : undefined }}
                        whileHover={{ backgroundColor: '#419dc8' }}
                        onClick={onClick(key)}
                    >
                        {label}
                    </motion.button>
                )
            })}
        </div >
    );
}

export default observer(DominoSlider)
