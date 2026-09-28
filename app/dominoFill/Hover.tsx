import { observer } from "mobx-react"
import { PuzzleSession } from "../stores/PuzzleSession"

/**
 * The preview under the pointer: one box over the pair a placement would occupy.
 *
 * Drawn as a single rectangle spanning both cells rather than one per cell, so a domino
 * previews as a domino and not as two squares that happen to touch.
 */
const Hover: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const highlightedSquares = boardsStore.highlightedPair
    const size = boardsStore.squareSize
    if (!highlightedSquares) return null

    const [[i1, j1], [i2, j2]] = highlightedSquares
    const startI = Math.min(i1, i2)
    const startJ = Math.min(j1, j2)
    return <>
        <div className="z-10 pointer-events-none absolute opacity-70 bg-drag-wash" style={{ top: `${startI * size}px`, left: `${startJ * size}px`, height: `${size * (Math.abs(i1 - i2) + 1)}px`, width: `${size * (Math.abs(j1 - j2) + 1)}px`, borderTopLeftRadius: '12px', borderTopRightRadius: '12px', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}></div>
    </>
}
export default observer(Hover)