"use client"
import React, { CSSProperties } from "react";
import DominoBoard from "./dominoBoard";
import BoardSquare from "./BoardSquare";
import { observer } from "mobx-react";
import { useStores } from "../hooks/useStore";
import Hover from "./Hover";
import Pieces from "./Pieces/Pieces";
import VerticalNumbers from "./VerticalNumbers";
import HorizontalNumbers from "./HorizontalNumbers";
import Rock from "./Pieces/Rock";

type Props = {
    size: number;
    board: DominoBoard
};

const ClientBoard: React.FC<Props> = ({ size, board }: Props) => {
    const { boardsStore } = useStores()
    console.log('rerender client board')
    const gridStyle: CSSProperties = {
        display: "grid",
        gridTemplateColumns: `repeat(${size}, 0fr)`,
        // width: "100%",
        // alignSelf:'center'
    }
    const onmousemove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left; //x position within the element.
        const y = e.clientY - rect.top;  //y position within the element.
        boardsStore.setHoverCords([x, y])
    }
    const onclick = (_e: React.MouseEvent<HTMLDivElement>) => {
        // const rect = e.currentTarget.getBoundingClientRect();
        // const x = e.clientX - rect.left; //x position within the element.
        // const y = e.clientY - rect.top;  //y position within the element.
        // // boardsStore.setHoverCords([x, y])
        // console.log('click', {x, y})
        boardsStore.setPieceOnBoard()
    }
    const isDisabled = boardsStore.currentBoard.completed
    return (
        <div className="flex flex-col items-center justify-center select-none" style={{ pointerEvents: isDisabled ? 'none' : 'auto' }}>
            <HorizontalNumbers />
            <div className="flex flex-row">
                <VerticalNumbers />
                <div className="border-[#666666] border-4 rounded-2xl">
                    <div key={boardsStore.difficulty} onMouseMove={onmousemove} onClick={onclick} draggable={false} style={gridStyle} className="relative">
                        <Hover />
                        <Pieces />
                        {board.board.flat().map((_el, index) => {
                            const i = Math.floor(index / size)
                            const j = index % size
                            const isHighlighted = boardsStore.highlightedSquares?.some(([index, jndex]) => index === i && jndex === j) ?? false
                            return (<BoardSquare key={`${i}_${j}`} i={i} j={j} isHighlighted={isHighlighted} />)
                        })}
                    </div>
                </div>
                <VerticalNumbers />
            </div>
        </div>)

}
export default observer(ClientBoard)