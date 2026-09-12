"use client"
import React, { CSSProperties } from "react";
import BoardSquare from "./BoardSquare";
import { observer } from "mobx-react";
import Hover from "./Hover";
import Pieces from "./Pieces/Pieces";
import VerticalNumbers from "./VerticalNumbers";
import HorizontalNumbers from "./HorizontalNumbers";
import { useStores } from "../hooks/useStore";
import { PuzzleSession } from "../stores/PuzzleSession";

type Props = {
    boardsStore: PuzzleSession
};

const ClientBoard: React.FC<Props> = ({ boardsStore }: Props) => {
    const { sizeStore } = useStores()
    const size = boardsStore.board.length
    // console.log('rerender client board')
    const gridStyle: CSSProperties = {
        display: "grid",
        gridTemplateColumns: `repeat(${size}, 0fr)`,
    }
    const onmousemove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        // console.log('rect', rect)
        const x = e.clientX - rect.left; //x position within the element.
        const y = e.clientY - rect.top;  //y position within the element.
        sizeStore.setHoverCords([x, y])
    }
    const onclick = () => {
        // const rect = e.currentTarget.getBoundingClientRect();
        // const x = e.clientX - rect.left; //x position within the element.
        // const y = e.clientY - rect.top;  //y position within the element.
        // // boardsStore.setHoverCords([x, y])
        // console.log('click', {x, y})
        boardsStore.setPieceOnBoard()
    }

    const ref = React.useRef<HTMLDivElement>(null)
    // useEffect(() => {
    //     window.onresize = () => {
    //         const size = ref.current?.getBoundingClientRect()
    //         if (size) {
    //             // console.log('resize', e, size.width)
    //             boardsStore.setBoardWidth(size.width)
    //         }
    //     }
    //     return () => {
    //         window.onresize = null
    //     }
    // }, [boardsStore])

    const isDisabled = boardsStore.completed
    return (
        <div className="flex flex-row items-center justify-center select-none" style={{ pointerEvents: isDisabled ? 'none' : 'auto' }}>
            <div className="flex flex-1 flex-col items-center justify-center" style={{width: sizeStore.boardSize}} ref={ref}>
                <HorizontalNumbers boardsStore={boardsStore} />
                <div className="flex flex-row">
                    <VerticalNumbers boardsStore={boardsStore} />
                    <div className="border-[#666666] border-4 rounded-2xl">
                        <div onMouseMove={onmousemove} onClick={onclick} draggable={false} style={gridStyle} className="relative">
                            <Hover boardsStore={boardsStore} />
                            <Pieces boardsStore={boardsStore} />
                            {boardsStore.board.flat().map((_el: number | null, index: number) => {
                                const i = Math.floor(index / size)
                                const j = index % size
                                // const isHighlighted = boardsStore.highlightedSquares?.some(([index, jndex]) => index === i && jndex === j) ?? false
                                return (<BoardSquare key={`${i}_${j}`} i={i} j={j} boardsStore={boardsStore} />)
                            })}
                        </div>
                    </div>
                    <VerticalNumbers boardsStore={boardsStore} />
                </div>
            </div>
        </div>
    )
}
export default observer(ClientBoard)