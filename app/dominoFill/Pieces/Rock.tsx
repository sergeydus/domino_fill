import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";
import { PALETTE } from "@/app/palette";

const strokeWidth = 6
const Rock: React.FC<React.SVGProps<SVGSVGElement> & { boardsStore: PuzzleSession }> = (props) => {
    const { boardsStore, ...rest } = props
    const size = boardsStore.squareSize
    return (
        <svg width={size} height={size + 16} {...rest} className="-translate-y-4">
            <rect x={strokeWidth} y={strokeWidth + 16} width={size - (strokeWidth * 2)} height={size - strokeWidth * 2} fill={PALETTE.rockSide} rx={8} ry={8} />
            <rect x={strokeWidth} y={strokeWidth} width={size - (strokeWidth * 2)} height={size - strokeWidth * 2} fill={PALETTE.rockFace} rx={8} ry={8} />
            <rect data-outline x={strokeWidth} y={strokeWidth} width={size - (strokeWidth * 2)} height={size - (strokeWidth * 2) + 16} fill="none" strokeWidth={6} stroke={PALETTE.pieceOutline} rx={8} ry={8} />
        </svg>
    );
};
export default observer(Rock)