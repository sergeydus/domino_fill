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

const DominoPieceOne: React.FC<PieceProps> = (props) => {
    const { boardsStore, cellSize, ...rest } = props
    const size = cellSize ?? boardsStore.squareSize
    return (
        <svg width={size} height={(size * 2) + 16} {...rest} className="-translate-y-4">
            <rect width={size - (strokeWidth * 2)} x={strokeWidth} y={20} height={size * 2 - strokeWidth} fill={PALETTE.tileSide} strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect width={size - (strokeWidth * 2)} x={strokeWidth} y={4} height={size * 2 - strokeWidth} fill={PALETTE.tileFace} strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect data-outline width={size - (strokeWidth * 2) + 4} x={4} y={4} height={size * 2 - strokeWidth + 16} stroke={PALETTE.pieceOutline} fill="none" strokeWidth={6} rx={8} ry={8} />
            <line x1={16} y1={size} x2={size - 16} y2={size} stroke={PALETTE.divider} strokeWidth={3} />
            <circle cx={size / 2} cy={size / 2} fill={PALETTE.pip} r={8} />
        </svg>
    );
};
export default observer(DominoPieceOne)