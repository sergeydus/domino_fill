import React from "react";
import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";
import { PALETTE } from "@/app/palette";

const strokeWidth = 6

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

const DominoPieceTwo: React.FC<PieceProps> = (props) => {
    const { boardsStore, cellSize, ...rest } = props
    const size = cellSize ?? boardsStore.squareSize
    return (
        <svg width={size * 2} height={size + 16} {...rest} className="-translate-y-4">
            <rect width={size * 2 - 8} x={4} y={4 + 16} height={size - 8} fill={PALETTE.tileSide} strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect width={size * 2 - 8} x={4} y={4} height={size - 8} fill={PALETTE.tileFace} strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect data-outline width={size * 2 - 8} x={4} y={4} height={size - 8 + 16} stroke={PALETTE.pieceOutline} fill="none" strokeWidth={strokeWidth} rx={8} ry={8} />

            <line x1={size} y1={16} x2={size} y2={size - 16} stroke={PALETTE.divider} strokeWidth={3} />
            <circle cx={size + size / 3} cy={size / 3} fill={PALETTE.pip} r={8} />
            <circle cx={size + size * 2 / 3} cy={size * 2 / 3} fill={PALETTE.pip} r={8} />
        </svg>
    );
};
export default observer(DominoPieceTwo)