import React from "react";
import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";
import { PALETTE } from "@/app/palette";
import { PIECE, UNIT as U, pieceBox, viewBox } from "./geometry";

const { outline: O, radius: R, inset: I, extrusion: E } = PIECE

/**
 * Exactly what a piece needs, and no SVG props (graphics row 6). A spread of caller props
 * onto the svg could override the `width`, `height`, `style` or `viewBox` that `pieceBox`
 * sets, and then `pieceBox` would not be the only place pixels enter; no caller styles a
 * piece, so none is accepted.
 */
type PieceProps = {
    boardsStore: PuzzleSession
    /**
     * Overrides the board's cell size.
     *
     * The piece tray passes a constant. Without it the tray's height is a function of the
     * board's cell size, while the board's cell size is a function of the height left over
     * after the tray -- a feedback loop that visibly creeps the board a couple of pixels
     * larger over several frames before settling.
     */
    cellSize?: number
}

const DominoPieceTwo: React.FC<PieceProps> = (props) => {
    const { boardsStore, cellSize } = props
    const size = cellSize ?? boardsStore.squareSize
    return (
        // Two cells (U each) wide and one tall, in drawing units; `pieceBox` is where pixels enter.
        <svg {...pieceBox(2, 1, size)} viewBox={viewBox(2, 1)}>
            <rect x={I} y={I + E} width={2 * U - 2 * I} height={U - 2 * I} fill={PALETTE.tileSide} rx={R} ry={R} />
            <rect x={I} y={I} width={2 * U - 2 * I} height={U - 2 * I} fill={PALETTE.tileFace} rx={R} ry={R} />
            <rect data-outline x={I} y={I} width={2 * U - 2 * I} height={U - 2 * I + E} stroke={PALETTE.pieceOutline} fill="none" strokeWidth={O} rx={R} ry={R} />

            <line x1={U} y1={PIECE.dividerInset} x2={U} y2={U - PIECE.dividerInset} stroke={PALETTE.divider} strokeWidth={PIECE.dividerWidth} />
            <circle cx={U + U / 3} cy={U / 3} fill={PALETTE.pip} r={PIECE.pipRadius} />
            <circle cx={U + U * 2 / 3} cy={U * 2 / 3} fill={PALETTE.pip} r={PIECE.pipRadius} />
        </svg>
    );
};
export default observer(DominoPieceTwo)