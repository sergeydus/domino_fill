"use client"
import { motion } from 'motion/react'
import DominoPieceOne from "./DominoPieceOne"
import DominoPieceTwo from "./DominoPieceTwo";
import { observer } from 'mobx-react';
import { PuzzleSession } from '@/app/stores/PuzzleSession';
import { useStores } from '@/app/hooks/useStore';

const DominoPieces: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore:currentBoard }) => {
    const { boardsStore } = useStores()
    // console.log('pieces rerender')
    const onClickPieceOne = () => {
        boardsStore.setSelectedPiece(1)
    }
    const onClickPieceTwo = () => {
        return boardsStore.setSelectedPiece(2)
    }
    return (
        <div className="flex flex-row bg-[#ababab] rounded-4xl gap-4 text-2xl pt-6 px-4 items-center">
            <motion.div style={{ opacity: boardsStore.selectedPiece == 1 ? 1 : 0.5, scale: 1 }} onClick={onClickPieceOne} data-select-piece="1" className='cursor-pointer p-2' whileHover={{ scale: 1.1 }}  >
                <DominoPieceOne boardsStore={currentBoard} />
            </motion.div>
            <motion.div style={{ opacity: boardsStore.selectedPiece == 2 ? 1 : 0.5, scale: 1 }} onClick={onClickPieceTwo} data-select-piece="2" className='cursor-pointer p-2' whileHover={{ scale: 1.1 }}>
                <DominoPieceTwo boardsStore={currentBoard} />
            </motion.div>
        </div >
    );
}

export default observer(DominoPieces)
