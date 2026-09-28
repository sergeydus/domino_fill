import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";
import { PALETTE } from "@/app/palette";
import { PIECE, ROCK, pieceBox, points, viewBox } from "./geometry";

/**
 * Exactly what a piece needs, and no SVG props (graphics row 6). A spread of caller props
 * onto the svg could override the `width`, `height`, `style` or `viewBox` that `pieceBox`
 * sets, and then `pieceBox` would not be the only place pixels enter; no caller styles a
 * piece, so none is accepted.
 *
 * Drawn in the order every piece is: the side, then the face, then the outline (graphics
 * row 8 for the rock's own shape; `ROCK` says how it is built).
 */
const Rock: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const size = boardsStore.squareSize
    return (
        // One cell, in drawing units; `pieceBox` is where pixels enter.
        <svg {...pieceBox(1, 1, size)} viewBox={viewBox(1, 1)}>
            <polygon points={points(ROCK.silhouette)} fill={PALETTE.rockSide} />
            <polygon points={points(ROCK.face)} fill={PALETTE.rockFace} />
            <polygon points={points(ROCK.lit)} fill={PALETTE.rockLit} />
            <polygon points={points(ROCK.shade)} fill={PALETTE.rockShade} />
            <polygon data-outline points={points(ROCK.silhouette)} fill="none" strokeWidth={PIECE.outline}
                stroke={PALETTE.pieceOutline} strokeLinejoin="round" />
        </svg>
    );
};
export default observer(Rock)
