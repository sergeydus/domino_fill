"use client"
import React, { CSSProperties } from "react";
import BoardSquare from "./BoardSquare";
import { observer } from "mobx-react";
import Hover from "./Hover";
import Selection from "./Selection";
import Pieces from "./Pieces/Pieces";
import VerticalNumbers from "./VerticalNumbers";
import HorizontalNumbers from "./HorizontalNumbers";
import { GRID_BORDER_PX, PuzzleSession } from "../stores/PuzzleSession";
import { Cell } from "../stores/placement";

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
     * Which cell a pointer event is over, asked of the browser rather than worked out.
     *
     * `elementFromPoint` first, then the event target. Touch pointers get *implicit
     * pointer capture*: every `pointermove` after `pointerdown` retargets to the element
     * the gesture started on, so `e.target` during a touch drag names the cell the finger
     * left, not the one it is over. Capture is released in `pointerdown` below, and
     * `elementFromPoint` is asked directly, which is correct whether or not any given
     * browser honoured that release.
     *
     * The overlays above the cells are `pointer-events: none`, so both routes resolve to
     * the cell itself. No rect is read and no coordinate is divided: there is no
     * grid-to-cell arithmetic here that could name a cell the browser did not.
     */
    const cellFrom = (e: { clientX: number, clientY: number, target: EventTarget | null }): Cell | null => {
        // Feature-checked, not just presence-checked: jsdom has a `document` but no
        // `elementFromPoint`, and calling it threw straight out of the handler.
        const atPoint = typeof document?.elementFromPoint === 'function'
            ? document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-cell]')
            : null
        const el = atPoint ?? (e.target as Element | null)?.closest?.('[data-cell]')
        if (!el) return null

        const [i, j] = (el.getAttribute('data-cell') ?? '').split(',').map(Number)
        return Number.isInteger(i) && Number.isInteger(j) ? [i, j] : null
    }

    /*
     * All-pointer, and deliberately no `onClick`.
     *
     * Mobile browsers synthesise a compatibility `click` after `pointerup`; keeping a
     * click handler alongside these would run the whole verb twice per tap and place two
     * dominoes. `pointermove` is also non-passive, unlike React's `touchmove`, which is
     * the other reason not to mix the two families.
     */
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        // Release the implicit capture touch pointers get, so moves retarget to the cell
        // under the finger. Wrapped because a pointer that has already gone can throw.
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
        const cell = cellFrom(e)
        boardsStore.setHover(cell)
        if (cell) boardsStore.pointerDown(cell)
    }

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        boardsStore.setHover(cellFrom(e))
    }

    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        boardsStore.pointerUp(cellFrom(e))
    }

    /*
     * `pointercancel` is the one to handle: the browser took the gesture away (a scroll
     * or zoom claimed it, the touch was interrupted), and no `pointerup` is coming.
     *
     * `lostpointercapture` is deliberately *not* wired to cancellation. We release capture
     * ourselves in `pointerdown`, so it fires immediately on every touch gesture -- wiring
     * it here would cancel every drag on the frame it began.
     */
    const onPointerCancel = () => boardsStore.cancelDrag()

    /*
     * A drag that leaves the board is abandoned, and the highlight goes with it; without
     * this the preview stays frozen wherever the pointer left.
     *
     * `cancelDrag`, not `cancelGesture`: a touch pointer ceases to exist at `pointerup`,
     * and the browser then fires `pointerout` and `pointerleave` up the whole tree.
     * Measured -- every tap produced a `pointerleave` on the grid right after the release,
     * so cancelling everything here dismissed the candidates the tap had just offered.
     */
    const onPointerLeave = () => boardsStore.cancelDrag()

    /*
     * The same verb from the keyboard: arrows move the focused cell, Space or Enter makes
     * it the anchor, then arrows choose the neighbour. Escape leaves any state it entered.
     *
     * `preventDefault` only when the board actually used the key, so arrows still scroll
     * the page and Space still does whatever it would otherwise do.
     */
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (boardsStore.handleKey(e.key)) e.preventDefault()
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
                {/* `board-grid` carries the static touch policy; see globals.css. */}
                <div
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onPointerLeave={onPointerLeave}
                    onKeyDown={onKeyDown}
                    onBlur={() => boardsStore.cancelGesture()}
                    tabIndex={0}
                    role="grid"
                    aria-label="Domino board"
                    draggable={false}
                    style={gridStyle}
                    className="board-grid relative cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-blue-500"
                >
                    <Hover boardsStore={boardsStore} />
                    <Selection boardsStore={boardsStore} />
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
