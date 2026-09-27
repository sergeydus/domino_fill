"use client"
import { observer } from "mobx-react"
import { LevelStore } from "../stores/BoardsStore"
import { PRESSED } from "./controlStates"
import { control } from "../controls"

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
 * Since graphics P1-6 that is `PRESSED`, every toggle's treatment, read from the attribute;
 * the fill was a `motion` tween, and is a CSS transition now, which reduced motion zeroes.
 *
 * **Secondary controls, and no tray (graphics spec P2-2, row 14).** The options sat on a
 * control-surface tray of their own, with no surface, 4px of padding and a white wash for
 * hover: a fourth design for a button. Each option is now a secondary control with its own
 * surface, so the tray would be the same colour behind the same colour, and it went; its
 * 16px of padding paid for most of the options' own. In the 260px rail the options are
 * narrower than their labels and wrap them to two lines, as the CI runner's wider text
 * already did before this row; see `RAIL_WIDTH_PX`.
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
        <div className="flex flex-row gap-2" role="group" aria-label="Difficulty">
            {LEVELS.map(({ key, label }) => {
                const selected = boardsStore.difficulty === key
                return (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={selected}
                        data-difficulty={key}
                        data-selected={selected || undefined}
                        className={`${control('secondary')} ${PRESSED}`}
                        onClick={onClick(key)}
                    >
                        {label}
                    </button>
                )
            })}
        </div >
    );
}

export default observer(DominoSlider)
