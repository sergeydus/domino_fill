import { observer } from "mobx-react"
import { motion } from 'motion/react'
import { PuzzleSession } from "../stores/PuzzleSession"
import { labelPresentation, labelDescription, LABEL_COLORS } from "./lineLabel"

/**
 * The row labels, down the left of the board (spec P0-3).
 *
 * One gutter, not two: this used to be rendered twice, and the duplicate right-hand copy
 * cost a whole column of width on the one device with none to spare.
 *
 * `min-w-0 min-h-0` because a flex item's default `min-*: auto` is min-content, so a label
 * wider than its box silently props the box open instead of overflowing it. The font is
 * derived from `--cell` rather than the old constant `text-6xl` (60px), which rendered a
 * 60px glyph inside a 39px box at phone size.
 *
 * `padding-top` clears the grid's own top border so each label centres on its row: the
 * board's track includes the border, the label's track does not.
 */
const VerticalNumbers: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const size = boardsStore.squareSize
    const gutter = boardsStore.gutterSize
    const split = boardsStore.definition.rowTargets.split(',')
    const states = boardsStore.rowStates
    return <div
        className="flex flex-col min-w-0 min-h-0 leading-none tabular-nums"
        style={{ paddingTop: 'var(--grid-border)', fontSize: 'var(--label-font)' }}
    >
        {split.map((el: string, index: number) => {
            const presentation = labelPresentation(states[index])
            return (
                <motion.div className="flex items-center justify-center min-w-0 min-h-0"
                    initial={{ color: LABEL_COLORS.neutral }}
                    animate={{ color: presentation.color }}
                    key={index}
                    data-row-label={index}
                    data-line-state={presentation.token}
                    role="img"
                    aria-label={labelDescription(`Row ${index + 1}`, el, states[index])}
                    style={{
                        ...{ width: `${gutter}px`, height: `${size}px` },
                        textDecoration: presentation.textDecoration,
                        outline: presentation.outline,
                        borderRadius: '4px',
                    }}
                >{el}
                </motion.div>
            )
        })}
    </div>
}
export default observer(VerticalNumbers)
