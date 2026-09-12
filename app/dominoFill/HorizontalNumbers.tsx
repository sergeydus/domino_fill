import { observer } from "mobx-react"
import { motion } from 'motion/react'
import { PuzzleSession } from "../stores/PuzzleSession"
const HorizontalNumbers: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const size = boardsStore.squareSize
    const split = boardsStore.definition.columnTargets.split(',')
    const currentSums = boardsStore.currentColumnSums
    return <div className="flex flex-row text-6xl">
        {split.map((el: string, index: number) => {
            let color = '#ababab'
            if (currentSums[index] == Number(el)) {
                color = '#4bce4b'
            }
            else if (currentSums[index] > Number(el)) {
                color = '#ff0000'
            }
            return (
                <motion.div className="flex items-center justify-center"
                    initial={{ color: '#ababab' }}
                    animate={{ color: color }}
                    key={index}
                    style={{ width: `${size}px`, height: `${size}px` }}
                >{el}
                </motion.div>
            )
        })}
    </div>
}
export default observer(HorizontalNumbers)