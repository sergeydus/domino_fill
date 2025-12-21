import { observer } from "mobx-react"
import { useStores } from "@/app/hooks/useStore"
import DominoPieceOne from "./DominoPieceOne"
import DominoPieceTwo from "./DominoPieceTwo"
import { motion } from "motion/react"
import Rock from "./Rock"
const Hover: React.FC = () => {
    // console.log('wrapper rerender')
    const { boardsStore } = useStores()
    const size = boardsStore.squareSize
    const board = boardsStore.currentBoard.board
    const ones: [number, number][] = []
    const twos: [number, number][] = []
    const rocks: [number, number][] = []
    for (let i = 0; i < board.length; i++) {
        for (let j = 0; j < board[i].length; j++) {
            if (board[i][j] === 1) ones.push([i, j])
            if (board[i][j] === 2) twos.push([i, j])
            if (board[i][j] === -1) rocks.push([i, j])
        }
    }
    const onclick = (i: number, j: number) => {
        // console.log('remove click1')
        return (e: React.MouseEvent) => {
            console.log('remove click2', { i, j });
            boardsStore.removePiece(i, j)
            e.stopPropagation()
        }
    }
    console.log('ones and twos', { ones, twos })
    return <div className="absolute bg-green-500 z-20">
        {/* <AnimatePresence> */}
        {ones.map(([i, j]) =>
            <motion.div key={`one_${i},${j}`} className="absolute cursor-pointer"
                style={{ top: `${i * size}px`, left: `${j * size}px`, zIndex: 30 + i }} initial={{ opacity: 0, translateY: -26, translateX: -26, rotate: -5 }} animate={{ opacity: 1, translateY: 0, translateX: 0, rotate: 0 }}>
                <DominoPieceOne onClick={onclick(i, j)}
                    // style={{ top: `${i * size}px`, left: `${j * size}px` }}
                    className="absolute z-30 cursor-pointer"
                />
            </motion.div>
        )}
        {twos.map(([i, j]) =>
            <motion.div key={`two_${i},${j}`} className="absolute cursor-pointer"
                style={{ top: `${i * size}px`, left: `${(j - 1) * size}px`, zIndex: 30 + i }} initial={{ opacity: 0, translateY: -26, translateX: -26, rotate: -5 }} animate={{ opacity: 1, translateY: 0, translateX: 0, rotate: 0 }}>
                <DominoPieceTwo onClick={onclick(i, j)}
                    key={`${i},${j}`}

                />
            </motion.div>
        )}
        {rocks.map(([i, j]) =>
            <div key={`${i},${j}`} className="absolute"
                style={{ top: `${i * size}px`, left: `${j * size}px`, zIndex: 30 + i }}>
                <Rock
                    key={`rock_${i},${j}`}
                />
            </div>
        )}
        {/* </AnimatePresence> */}
    </div>
}
export default observer(Hover)