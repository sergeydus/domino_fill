import React from "react";
import { useStores } from "@/app/hooks/useStore";
import { observer } from "mobx-react";

const strokeWidth = 6

const DominoPieceTwo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => {
    const { boardsStore } = useStores()
    const size = boardsStore.squareSize
    return (
        <svg width={size * 2} height={size + 16} {...props} className="translate-y-[-16px]">
            <rect width={size * 2 - 8} x={4} y={4 + 16} height={size - 8} fill="#8d8778" strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect width={size * 2 - 8} x={4} y={4} height={size - 8} fill="#FFF3D6" strokeWidth={strokeWidth} rx={8} ry={8} />
            <rect width={size * 2 - 8} x={4} y={4} height={size - 8 + 16} stroke="black" fill="transparent" strokeWidth={strokeWidth} rx={8} ry={8} />

            <line x1={size} y1={16} x2={size} y2={size - 16} stroke="black" strokeWidth={3} />
            <circle cx={size + size / 3} cy={size / 3} fill="black" r={8} />
            <circle cx={size + size * 2 / 3} cy={size * 2 / 3} fill="black" r={8} />
        </svg>
    );
};
export default observer(DominoPieceTwo)