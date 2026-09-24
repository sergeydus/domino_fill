import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";
import { PALETTE } from "@/app/palette";
import { PIECE, UNIT as U, pieceBox, viewBox } from "./geometry";

const { outline: O, radius: R, inset: I, extrusion: E } = PIECE

type PieceProps = React.SVGProps<SVGSVGElement> & {
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

const DominoPieceOne: React.FC<PieceProps> = (props) => {
    const { boardsStore, cellSize, ...rest } = props
    const size = cellSize ?? boardsStore.squareSize
    return (
        // One cell (U) wide and two tall, in drawing units; `pieceBox` is where pixels enter.
        <svg {...pieceBox(1, 2, size)} viewBox={viewBox(1, 2)} {...rest}>
            <rect x={O} y={I + E} width={U - 2 * O} height={2 * U - O} fill={PALETTE.tileSide} rx={R} ry={R} />
            <rect x={O} y={I} width={U - 2 * O} height={2 * U - O} fill={PALETTE.tileFace} rx={R} ry={R} />
            <rect data-outline x={I} y={I} width={U - 2 * I} height={2 * U - O + E} stroke={PALETTE.pieceOutline} fill="none" strokeWidth={O} rx={R} ry={R} />
            <line x1={PIECE.dividerInset} y1={U} x2={U - PIECE.dividerInset} y2={U} stroke={PALETTE.divider} strokeWidth={PIECE.dividerWidth} />
            <circle cx={U / 2} cy={U / 2} fill={PALETTE.pip} r={PIECE.pipRadius} />
        </svg>
    );
};
export default observer(DominoPieceOne)