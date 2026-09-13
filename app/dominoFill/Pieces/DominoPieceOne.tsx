import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";

const strokeWidth = 6
const DominoPieceOne: React.FC<React.SVGProps<SVGSVGElement> & { boardsStore: PuzzleSession }> = (props) => {
    const { boardsStore, ...rest } = props
    const size = boardsStore.squareSize
    return (
        <svg width={size} height={(size * 2) + 16} {...rest} className="-translate-y-4">
            <rect width={size - (strokeWidth * 2)} x={strokeWidth} y={20} height={size * 2 - strokeWidth} fill="#8d8778" strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect width={size - (strokeWidth * 2)} x={strokeWidth} y={4} height={size * 2 - strokeWidth} fill="#FFF3D6" strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect width={size - (strokeWidth * 2) + 4} x={4} y={4} height={size * 2 - strokeWidth + 16} stroke="black" fill="none" strokeWidth={6} rx={8} ry={8} />
            <line x1={16} y1={size} x2={size - 16} y2={size} stroke="black" strokeWidth={3} />
            <circle cx={size / 2} cy={size / 2} fill="black" r={8} />
        </svg>
    );
};
export default observer(DominoPieceOne)