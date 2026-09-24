import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";
import { PALETTE } from "@/app/palette";
import { PIECE, UNIT as U, pieceBox, viewBox } from "./geometry";

const { outline: O, radius: R, extrusion: E } = PIECE
/**
 * Exactly what a piece needs, and no SVG props (graphics row 6). A spread of caller props
 * onto the svg could override the `width`, `height`, `style` or `viewBox` that `pieceBox`
 * sets, and then `pieceBox` would not be the only place pixels enter; no caller styles a
 * piece, so none is accepted.
 */
const Rock: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const size = boardsStore.squareSize
    return (
        // One cell (U), in drawing units; `pieceBox` is where pixels enter.
        <svg {...pieceBox(1, 1, size)} viewBox={viewBox(1, 1)}>
            <rect x={O} y={O + E} width={U - 2 * O} height={U - 2 * O} fill={PALETTE.rockSide} rx={R} ry={R} />
            <rect x={O} y={O} width={U - 2 * O} height={U - 2 * O} fill={PALETTE.rockFace} rx={R} ry={R} />
            <rect data-outline x={O} y={O} width={U - 2 * O} height={U - 2 * O + E} fill="none" strokeWidth={O} stroke={PALETTE.pieceOutline} rx={R} ry={R} />
        </svg>
    );
};
export default observer(Rock)