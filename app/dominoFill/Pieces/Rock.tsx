import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";
import { PALETTE } from "@/app/palette";
import { PIECE, UNIT as U, pieceBox, viewBox } from "./geometry";

const { outline: O, radius: R, extrusion: E } = PIECE
const Rock: React.FC<React.SVGProps<SVGSVGElement> & { boardsStore: PuzzleSession }> = (props) => {
    const { boardsStore, ...rest } = props
    const size = boardsStore.squareSize
    return (
        // One cell (U), in drawing units; `pieceBox` is where pixels enter.
        <svg {...pieceBox(1, 1, size)} viewBox={viewBox(1, 1)} {...rest}>
            <rect x={O} y={O + E} width={U - 2 * O} height={U - 2 * O} fill={PALETTE.rockSide} rx={R} ry={R} />
            <rect x={O} y={O} width={U - 2 * O} height={U - 2 * O} fill={PALETTE.rockFace} rx={R} ry={R} />
            <rect data-outline x={O} y={O} width={U - 2 * O} height={U - 2 * O + E} fill="none" strokeWidth={O} stroke={PALETTE.pieceOutline} rx={R} ry={R} />
        </svg>
    );
};
export default observer(Rock)