import { observer } from "mobx-react"
import { motion } from 'motion/react'
import { PuzzleSession } from "../stores/PuzzleSession"
const VerticalNumbers: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    // console.log('wrapper rerender')
    const size = boardsStore.squareSize
    const split = boardsStore.definition.rowTargets.split(',')
    const currentSums = boardsStore.currentRowSums
    return <div className="flex flex-col text-6xl">
        {split.map((el: string, index: number) => {
            let color = '#ababab'
            if (currentSums[index] == Number(el)) {
                color = '#4bce4b'
            }
            else if(currentSums[index] > Number(el)) {
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
export default observer(VerticalNumbers)