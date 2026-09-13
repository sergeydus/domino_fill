import { observer } from "mobx-react"
import DominoPieceOne from "./DominoPieceOne"
import DominoPieceTwo from "./DominoPieceTwo"
import { motion } from "motion/react"
import Rock from "./Rock"
import { PuzzleSession } from "@/app/stores/PuzzleSession"

const Hover: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    // console.log('wrapper rerender')
    const size = boardsStore.squareSize
    const board = boardsStore.board
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
    /*
     * The overlay is purely decorative and takes no pointer events (spec P0-4 / D4).
     *
     * Each piece's SVG is 16px taller than its cell and shifted up by 16px, so its box
     * overhangs the cell above it by 12px. While this layer was interactive, that overhang
     * hit-tested -- `fill="transparent"` is a paint value, not `none` -- and its handler
     * removed the domino. Clicking the bottom strip of an empty cell therefore deleted the
     * piece below it instead of placing one.
     *
     * Removal now happens on the cell underneath: the pointer handlers resolve a cell and
     * `PuzzleSession.pointerUp` decides what the gesture on it means (P1-1).
     */
    return <div className="absolute z-20 pointer-events-none">
        {/* <AnimatePresence> */}
        {ones.map(([i, j]) =>
            <motion.div key={`one_${i},${j}`} className="absolute" data-piece="one" data-at={`${i},${j}`}
                style={{ top: `${i * size}px`, left: `${j * size}px`, zIndex: 30 + i }} initial={{ opacity: 0, translateY: -26, translateX: -26, rotate: -5 }} animate={{ opacity: 1, translateY: 0, translateX: 0, rotate: 0 }}>
                <DominoPieceOne
                    boardsStore={boardsStore}
                    className="absolute z-30"
                />
            </motion.div>
        )}
        {twos.map(([i, j]) =>
            <motion.div key={`two_${i},${j}`} className="absolute" data-piece="two" data-at={`${i},${j}`}
                style={{ top: `${i * size}px`, left: `${(j - 1) * size}px`, zIndex: 30 + i }} initial={{ opacity: 0, translateY: -26, translateX: -26, rotate: -5 }} animate={{ opacity: 1, translateY: 0, translateX: 0, rotate: 0 }}>
                <DominoPieceTwo
                    boardsStore={boardsStore}
                    key={`${i},${j}`}
                />
            </motion.div>
        )}
        {rocks.map(([i, j]) =>
            <div key={`${i},${j}`} className="absolute" data-piece="rock" data-at={`${i},${j}`}
                style={{ top: `${i * size}px`, left: `${j * size}px`, zIndex: 30 + i }}>
                <Rock boardsStore={boardsStore}
                    key={`rock_${i},${j}`}
                />
            </div>
        )}
        {/* </AnimatePresence> */}
    </div>
}
export default observer(Hover)