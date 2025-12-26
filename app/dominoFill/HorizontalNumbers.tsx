import { observer } from "mobx-react"
import { motion } from 'motion/react'
import { CurrentBoardStore } from "../stores/CurrentBoardStore"
const HorizontalNumbers: React.FC<{ boardsStore: CurrentBoardStore }> = ({ boardsStore }) => {
    const board = boardsStore.currentBoard
    const size = boardsStore.squareSize
    const split = board.boardHorizontalNumbers.split('')
    const correctIndexes = boardsStore.correctHorizontalValues
    return <div className="flex flex-row text-6xl">
        {split.map((el, index) => {
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