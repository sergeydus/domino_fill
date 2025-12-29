"use client"
import { motion } from "motion/react"
import { observer } from "mobx-react"
import { LevelStore } from "../stores/BoardsStore"

const DominoSlider: React.FC<{ boardsStore: LevelStore }> = ({ boardsStore }) => {
    // console.log('difficluly slider rerender')
    const onClick = (dif: 'easy' | 'normal' | 'hard') => {
        return () => { boardsStore.setDifficulty(dif) }
    }
    return (
        <div className="flex flex-row bg-[#ababab] rounded gap-2 text-2xl p-2">
            <motion.button className={`cursor-pointer p-2 rounded`}
                animate={{ backgroundColor: boardsStore.difficulty == 'easy' ? '#419dc8' : undefined }}
                whileHover={{ backgroundColor: '#419dc8' }}
                onClick={onClick('easy')}>
                Easy 6x6
            </motion.button>
            <motion.button className="cursor-pointer p-2 rounded"
                animate={{ backgroundColor: boardsStore.difficulty == 'normal' ? '#419dc8' : undefined }}
                whileHover={{ backgroundColor: '#419dc8' }}
                onClick={onClick('normal')}>
                Medium 7x7
            </motion.button>
            <motion.button className="cursor-pointer p-2 rounded"
                animate={{ backgroundColor: boardsStore.difficulty == 'hard' ? '#419dc8' : undefined }}
                whileHover={{ backgroundColor: '#419dc8' }}
                onClick={onClick('hard')}>
                Hard 8x8
            </motion.button>
            {/* <div className="absolute">yellow</div> */}
        </div >
    );
}

export default observer(DominoSlider)
