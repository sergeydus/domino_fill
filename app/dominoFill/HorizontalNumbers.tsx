import { observer } from "mobx-react"
import { motion } from 'motion/react'
import { PuzzleSession } from "../stores/PuzzleSession"
import { labelPresentation, labelDescription, LABEL_COLORS, tieStyle } from "./lineLabel"

/**
 * The column labels, along the top of the board. See VerticalNumbers for why the font is
 * derived from `--cell`, why `min-w-0 min-h-0` is required, and why the padding is there
 * -- here it is `padding-left`, clearing the grid's left border.
 */
const HorizontalNumbers: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const size = boardsStore.squareSize
    const gutter = boardsStore.gutterSize
    const split = boardsStore.definition.columnTargets.split(',')
    const states = boardsStore.columnStates
    return <div
        className="flex flex-row min-w-0 min-h-0 leading-none tabular-nums"
        style={{ paddingLeft: 'var(--grid-border)', fontSize: 'var(--label-font)' }}
    >
        {split.map((el: string, index: number) => {
            const presentation = labelPresentation(states[index])
            return (
                <motion.div className="relative flex items-center justify-center min-w-0 min-h-0"
                    initial={{ color: LABEL_COLORS.neutral }}
                    animate={{ color: presentation.color }}
                    key={index}
                    data-col-label={index}
                    data-line-state={presentation.token}
                    role="img"
                    aria-label={labelDescription(`Column ${index + 1}`, el, states[index])}
                    style={{
                        ...{ width: `${size}px`, height: `${gutter}px` },
                        textDecoration: presentation.textDecoration,
                        outline: presentation.outline,
                        borderRadius: '4px',
                    }}
                >{el}
                    {/* The tie to the line (P1-3): see `LABEL_TIE`. */}
                    <span aria-hidden data-label-tie style={tieStyle('below')} />
                </motion.div>
            )
        })}
    </div>
}
export default observer(HorizontalNumbers)
