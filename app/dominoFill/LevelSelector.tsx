"use client"
import { observer } from "mobx-react"
import { motion } from 'motion/react'
import { LevelStore } from "../stores/BoardsStore"

const LevelSelector: React.FC<{ boardsStore: LevelStore }> = ({ boardsStore }) => {
    const currentLevel = boardsStore.level
    const hasNextLevel = boardsStore.level < 3
    const hasPreviousLevel = boardsStore.level > 1
    const onNextLevelClick = () => {
        if (hasNextLevel) {
            boardsStore.setLevel((currentLevel + 1) as 1 | 2 | 3)
        }
    }
    const onPreviousLevelClick = () => {
        if (hasPreviousLevel) {
            boardsStore.setLevel((currentLevel - 1) as 1 | 2 | 3)
        }
    }
    return <div className="flex flex-row">
        <motion.div onClick={onPreviousLevelClick} data-level="previous" className="rotate-180 cursor-pointer control-surface" initial={{ scale: 1 }} whileHover={{ scale: 1.2 }} style={{ filter: hasPreviousLevel ? 'unset' : 'grayscale(100%)' }}>
            <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M10 20
       Q8 20 8 22
       V42
       Q8 44 10 44
       H34
       V52
       Q34 56 38 53
       L58 34
       Q60 32 58 30
       L38 11
       Q34 8 34 12
       V20
       Z"
                    fill="#4FC3F7"
                    stroke="#0288D1"
                    strokeWidth="3"
                    strokeLinejoin="round"
                />
            </svg>

        </motion.div>
        <motion.div onClick={onNextLevelClick} data-level="next" className="cursor-pointer control-surface" initial={{ scale: 1 }} whileHover={{ scale: 1.2 }} style={{ filter: hasNextLevel ? 'unset' : 'grayscale(100%)' }}>
            <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M10 20
       Q8 20 8 22
       V42
       Q8 44 10 44
       H34
       V52
       Q34 56 38 53
       L58 34
       Q60 32 58 30
       L38 11
       Q34 8 34 12
       V20
       Z"
                    fill="#4FC3F7"
                    stroke="#0288D1"
                    strokeWidth="3"
                    strokeLinejoin="round"
                />
            </svg>
        </motion.div>
    </div >
}
export default observer(LevelSelector)