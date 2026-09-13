"use client"
import React, { CSSProperties } from "react";
import BoardSquare from "./BoardSquare";
import { observer } from "mobx-react";
import Hover from "./Hover";
import Pieces from "./Pieces/Pieces";
import VerticalNumbers from "./VerticalNumbers";
import HorizontalNumbers from "./HorizontalNumbers";
import { GRID_BORDER_PX, PuzzleSession } from "../stores/PuzzleSession";

type Props = {
    boardsStore: PuzzleSession
};

/** Half the grid's border: the offset the labels must clear to line up with their tracks. */
const BORDER_SIDE_PX = GRID_BORDER_PX / 2

const ClientBoard: React.FC<Props> = ({ boardsStore }: Props) => {
    const size = boardsStore.board.length
    const cell = boardsStore.squareSize
    const gutter = boardsStore.gutterSize

    const gridStyle: CSSProperties = {
        display: "grid",
        gridTemplateColumns: `repeat(${size}, 0fr)`,
    }

    /*
     * The shell is a 2x2 CSS grid -- an empty corner, the column labels, the row labels,
     * and the board -- rather than a stack of centred flex rows.
     *
     * Alignment is then structural: the labels share their track with the board, so they
     * cannot drift from it. The previous layout centred a `(n+2)*cell` row inside a
     * `boardSize` box that was 8px narrower, and let the gutters absorb the difference
     * (spec D3). `--cell` carries the cell size down so the labels can size their font
     * from it instead of a fixed `text-6xl`.
     */
    const shellStyle: CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `${gutter}px auto`,
        gridTemplateRows: `${gutter}px auto`,
        width: boardsStore.shellWidth,
        height: boardsStore.shellHeight,
        // Custom properties are not in CSSProperties' type.
        ['--cell' as keyof CSSProperties]: `${cell}px`,
        ['--label-font' as keyof CSSProperties]: `${boardsStore.labelFontSize}px`,
        ['--grid-border' as keyof CSSProperties]: `${BORDER_SIDE_PX}px`,
    } as CSSProperties

    const onmousemove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left; //x position within the element.
        const y = e.clientY - rect.top;  //y position within the element.
        boardsStore.setHoverPoint([x, y])
    }
    // Without this the highlight stays frozen wherever the pointer left the grid.
    const onmouseleave = () => boardsStore.clearHover()
    // Place or remove, decided from the cell under the pointer. Removal used to be the
    // piece overlay's own handler, whose hit region overhung the cell above it (D4).
    const onclick = () => {
        boardsStore.activateHoveredCell()
    }

    const isDisabled = boardsStore.completed
    return (
        <div
            className="select-none"
            style={{ ...shellStyle, pointerEvents: isDisabled ? 'none' : 'auto' }}
            data-board-shell
        >
            {/* The corner where the two gutters meet; deliberately empty. */}
            <div />
            <HorizontalNumbers boardsStore={boardsStore} />
            <VerticalNumbers boardsStore={boardsStore} />
            <div className="border-[#666666] border-4 rounded-2xl">
                {/* `cursor-pointer` lives here now: it used to be on the piece overlay,
                    which no longer takes pointer events and so no longer sets a cursor. */}
                <div onMouseMove={onmousemove} onMouseLeave={onmouseleave} onClick={onclick} draggable={false} style={gridStyle} className="relative cursor-pointer">
                    <Hover boardsStore={boardsStore} />
                    <Pieces boardsStore={boardsStore} />
                    {boardsStore.board.flat().map((_el: number | null, index: number) => {
                        const i = Math.floor(index / size)
                        const j = index % size
                        return (<BoardSquare key={`${i}_${j}`} i={i} j={j} boardsStore={boardsStore} />)
                    })}
                </div>
            </div>
        </div>
    )
}
export default observer(ClientBoard)
