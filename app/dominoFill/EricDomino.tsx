import React from "react";

export interface EricDominoProps {
    className?: string;
    style?: React.CSSProperties;
}

const EricDomino: React.FC<EricDominoProps> = ({ className, style }) => {
    // Empty React component - implement rendering here
    return <svg width={96} height={192} className="bg-transparent absolute">
        <rect width={96 - 8} x={4} y={4} height={192 - 8} stroke="black" fill="white" strokeWidth={8} rx={8} ry={8} />
        <circle cx={96 / 2} cy={96 / 2} fill="black" r={8} />
        <line y1={96} y2={96} x1={8} x2={96 - 8} stroke="black" strokeWidth={2} />

    </svg>
};

export default EricDomino;