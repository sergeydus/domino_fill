"use client"
import React, { CSSProperties } from "react";
import BoardSquare from "./BoardSquare";
import { observer } from "mobx-react";
import Hover from "./Hover";
import Pieces from "./Pieces/Pieces";
import VerticalNumbers from "./VerticalNumbers";
import HorizontalNumbers from "./HorizontalNumbers";
import { CellHover, GRID_BORDER_PX, PuzzleSession } from "../stores/PuzzleSession";

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

    /*
     * Which cell the pointer is over, asked of the browser rather than worked out (P1-2).
     *
     * `closest('[data-cell]')` from the event target means the index comes from the same
     * hit-test that decided where the click landed -- no dividing a coordinate by the
     * store's idea of the cell size, and nothing that can disagree with the layout at a
     * fractional cell size or a stale measurement. The overlays above the cells are
     * `pointer-events: none`, so the target is the cell itself.
     *
     * The one rect read is of that single cell, and only to say which half of it the
     * pointer is in -- which way the domino points, never which cell it is in.
     */
    const readHover = (e: React.MouseEvent<HTMLDivElement>): CellHover | null => {
        const cell = (e.target as Element | null)?.closest?.('[data-cell]')
        if (!cell) return null

        const [i, j] = (cell.getAttribute('data-cell') ?? '').split(',').map(Number)
        if (!Number.isInteger(i) || !Number.isInteger(j)) return null

        const rect = cell.getBoundingClientRect()
        // A zero rect means there is no layout to read -- jsdom, or a hidden board. The
        // cell is still known; only the half is not, so treat the pointer as centred
        // rather than discarding a hover the browser is certain about.
        const fx = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5
        const fy = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5
        return { i, j, fx, fy }
    }

    const onmousemove = (e: React.MouseEvent<HTMLDivElement>) => {
        boardsStore.setHover(readHover(e))
    }
    // Without this the highlight stays frozen wherever the pointer left the grid.
    const onmouseleave = () => boardsStore.clearHover()
    /*
     * Place or remove, decided from the cell under the pointer. Removal used to be the
     * piece overlay's own handler, whose hit region overhung the cell above it (D4).
     *
     * The click resolves its own cell rather than acting on whatever the last move left
     * behind. Reading the stored hover looked equivalent -- a mouse click is always
     * preceded by a move over the same cell -- but it made the click depend on a move
     * having happened at all: a click dispatched straight at a cell placed nothing, and a
     * stale hover would have made a click act on the previous cell. Nothing about a click
     * needs the pointer's history; the event says where it landed.
     */
    const onclick = (e: React.MouseEvent<HTMLDivElement>) => {
        boardsStore.setHover(readHover(e))
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
