import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";
import { cssVar } from "@/app/palette";
import { PIECE, SKINS, pieceBox, points, viewBox, type Skin } from "./geometry";

/**
 * Exactly what a piece needs, and no SVG props (graphics row 6). A spread of caller props
 * onto the svg could override the `width`, `height`, `style` or `viewBox` that `pieceBox`
 * sets, and then `pieceBox` would not be the only place pixels enter; no caller styles a
 * piece, so none is accepted.
 *
 * One component for every obstacle, drawn in the skin it is given (UI-SPEC §4.4, UI row 4;
 * `Rock` until then). The rock is the only skin; `SKINS` says what one is.
 *
 * Drawn in the order every piece is: the side, then the face and its facets, then the rim
 * (graphics row 8 for the rock's own shape; `ROCK` says how it is built). The rim is the face
 * tone, 2 units round the swept silhouette, in both themes: the side and the shaded facet
 * fail at the edge in dark (§3.1), so they sit inside it.
 */
const Obstacle: React.FC<{ boardsStore: PuzzleSession, skin: Skin }> = ({ boardsStore, skin }) => {
    const size = boardsStore.squareSize
    const shape = SKINS[skin]
    return (
        // One cell, in drawing units; `pieceBox` is where pixels enter.
        <svg {...pieceBox(1, 1, size)} viewBox={viewBox(1, 1)} data-skin={skin}>
            <polygon points={points(shape.silhouette)} style={{ fill: cssVar('rockSide') }} />
            <polygon points={points(shape.face)} style={{ fill: cssVar('rockFace') }} />
            <polygon points={points(shape.lit)} style={{ fill: cssVar('rockLit') }} />
            <polygon points={points(shape.shade)} style={{ fill: cssVar('rockShade') }} />
            <polygon data-outline points={points(shape.silhouette)} fill="none" strokeWidth={PIECE.rim}
                strokeLinejoin="round" style={{ stroke: cssVar('rockFace') }} />
        </svg>
    );
};
export default observer(Obstacle)
