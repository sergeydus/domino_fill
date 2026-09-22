import { observer } from "mobx-react"
import DominoPieceOne from "./DominoPieceOne"
import DominoPieceTwo from "./DominoPieceTwo"
import { motion } from "motion/react"
import Rock from "./Rock"
import { PuzzleSession } from "@/app/stores/PuzzleSession"

const Hover: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
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
     *
     * **`aria-hidden` as well as `pointer-events: none` (spec P1-8, row 19).** "Decorative"
     * was true of the pointer and false of the accessibility tree: measured, these SVGs
     * were eight unnamed `img` nodes *inside* `role="grid"`, and they were the only thing
     * in it before the cells were named. A screen reader walking the board met a run of
     * anonymous images that say nothing about which square they are on or what they are.
     *
     * Hiding the layer loses nothing, because the same information is now on the cell
     * underneath, where it belongs and where it comes with coordinates: "Row 3, column 4,
     * top half of an upright domino".
     */
    return <div className="absolute z-20 pointer-events-none" aria-hidden="true">
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
    </div>
}
export default observer(Hover)