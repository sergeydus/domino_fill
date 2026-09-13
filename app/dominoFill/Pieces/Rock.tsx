import { observer } from "mobx-react";
import { PuzzleSession } from "@/app/stores/PuzzleSession";

const strokeWidth = 6
const Rock: React.FC<React.SVGProps<SVGSVGElement> & { boardsStore: PuzzleSession }> = (props) => {
    const { boardsStore, ...rest } = props
    const size = boardsStore.squareSize
    return (
        <svg width={size} height={size + 16} {...rest} className="-translate-y-4">
            {/* <rect width={size} x={0} y={0} height={size} fill="#868686" rx={8} ry={8} /> */}
            <rect x={strokeWidth} y={strokeWidth + 16} width={size - (strokeWidth * 2)} height={size - strokeWidth * 2} fill="#656565" rx={8} ry={8} />
            <rect x={strokeWidth} y={strokeWidth} width={size - (strokeWidth * 2)} height={size - strokeWidth * 2} fill="#868686" rx={8} ry={8} />
            <rect data-outline x={strokeWidth} y={strokeWidth} width={size - (strokeWidth * 2)} height={size - (strokeWidth * 2) + 16} fill="none" strokeWidth={6} stroke="black" rx={8} ry={8} />
        </svg>
    );
};
export default observer(Rock)