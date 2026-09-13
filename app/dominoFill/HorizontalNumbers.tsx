import { observer } from "mobx-react"
import { motion } from 'motion/react'
import { PuzzleSession } from "../stores/PuzzleSession"

/**
 * The column labels, along the top of the board. See VerticalNumbers for why the font is
 * derived from `--cell`, why `min-w-0 min-h-0` is required, and why the padding is there
 * -- here it is `padding-left`, clearing the grid's left border.
 */
const HorizontalNumbers: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const size = boardsStore.squareSize
    const gutter = boardsStore.gutterSize
    const split = boardsStore.definition.columnTargets.split(',')
    const currentSums = boardsStore.currentColumnSums
    return <div
        className="flex flex-row min-w-0 min-h-0 leading-none tabular-nums"
        style={{ paddingLeft: 'var(--grid-border)', fontSize: 'var(--label-font)' }}
    >
        {split.map((el: string, index: number) => {
            let color = '#ababab'
            if (currentSums[index] == Number(el)) {
                color = '#4bce4b'
            }
            else if (currentSums[index] > Number(el)) {
                color = '#ff0000'
            }
            return (
                <motion.div className="flex items-center justify-center min-w-0 min-h-0"
                    initial={{ color: '#ababab' }}
                    animate={{ color: color }}
                    key={index}
                    data-col-label={index}
                    style={{ width: `${size}px`, height: `${gutter}px` }}
                >{el}
                </motion.div>
            )
        })}
    </div>
}
export default observer(HorizontalNumbers)
