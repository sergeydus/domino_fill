import { observer } from "mobx-react"
import { motion } from 'motion/react'
import { PuzzleSession } from "../stores/PuzzleSession"
const HorizontalNumbers: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const size = boardsStore.squareSize
    const split = boardsStore.definition.boardHorizontalNumbers.split(',')
    const correctIndexes = boardsStore.correctHorizontalValues
    return <div className="flex flex-row text-6xl">
        {split.map((el: string, index: number) => {
            let color = '#ababab'
            if (correctIndexes[index] == Number(el)) {
                color = '#4bce4b'
            }
            else if (correctIndexes[index] > Number(el)) {
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