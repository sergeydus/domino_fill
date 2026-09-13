import React from "react";
import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";

const strokeWidth = 6

const DominoPieceTwo: React.FC<React.SVGProps<SVGSVGElement> & { boardsStore: PuzzleSession }> = (props) => {
    const { boardsStore, ...rest } = props
    const size = boardsStore.squareSize
    return (
        <svg width={size * 2} height={size + 16} {...rest} className="-translate-y-4">
            <rect width={size * 2 - 8} x={4} y={4 + 16} height={size - 8} fill="#8d8778" strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect width={size * 2 - 8} x={4} y={4} height={size - 8} fill="#FFF3D6" strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect data-outline width={size * 2 - 8} x={4} y={4} height={size - 8 + 16} stroke="black" fill="none" strokeWidth={strokeWidth} rx={8} ry={8} />

            <line x1={size} y1={16} x2={size} y2={size - 16} stroke="black" strokeWidth={3} />
            <circle cx={size + size / 3} cy={size / 3} fill="black" r={8} />
            <circle cx={size + size * 2 / 3} cy={size * 2 / 3} fill="black" r={8} />
        </svg>
    );
};
export default observer(DominoPieceTwo)