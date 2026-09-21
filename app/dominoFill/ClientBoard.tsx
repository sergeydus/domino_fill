"use client"
import React, { CSSProperties, useEffect, useRef } from "react";
import BoardSquare from "./BoardSquare";
import { motion, useAnimationControls } from "motion/react";
import { observer } from "mobx-react";
import Hover from "./Hover";
import Selection from "./Selection";
import Pieces from "./Pieces/Pieces";
import VerticalNumbers from "./VerticalNumbers";
import HorizontalNumbers from "./HorizontalNumbers";
import { GRID_BORDER_PX, PuzzleSession } from "../stores/PuzzleSession";
import { Cell } from "../stores/placement";
import { feedbackFor } from "./feedback";

type Props = {
    boardsStore: PuzzleSession
};

/** How far a feedback watcher had counted, and on which puzzle it was counting. */
type Seen = { session: PuzzleSession, count: number }

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
     * `elementFromPoint` first, then the event target, and the order matters: touch
     * pointers get *implicit pointer capture*, so every event after `pointerdown`
     * retargets to the cell the gesture started on. Measured, dragging 2,2 -> 3,2:
     * `pointermove.target` stayed `2,2` while `elementFromPoint` returned `3,2`, and
     * capture stayed on the cell for the whole gesture. `elementFromPoint` is therefore
     * the only thing that makes a touch drag work at all; `e.target` is the fallback for
     * environments with no hit-testing (jsdom).
     *
     * The capture is deliberately left in place. It keeps every event funnelled to the
     * grid even when the finger wanders off the board -- measured: a drag ending outside
     * still delivered `pointerup` to the grid, which resolves to no cell and clears the
     * gesture. Released, that release would have gone to whatever is under the finger and
     * the grid would never have heard it.
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
     * Two ways a gesture can end other than a release, both of which abandon an in-flight
     * *drag* and leave a pending offer alone.
     *
     * `pointercancel`: the browser took the gesture away (a scroll or zoom claimed it, the
     * touch was interrupted) and no `pointerup` is coming.
     *
     * `lostpointercapture`: capture went away. On the normal path this fires *after*
     * `pointerup` -- measured, and contrary to an earlier claim here that it fires
     * immediately on `pointerdown` -- by which time the drag is already resolved: a
     * placement cleared the gesture, and an ambiguous tap turned it into `pending`.
     * `cancelDrag` discards only a `drag`, so arriving late costs nothing. What it buys is
     * the abnormal path: capture lost *before* the release, with no `pointercancel` to
     * follow, otherwise leaves a drag armed with no event left to close it.
     */
    const onPointerCancel = () => boardsStore.cancelDrag()
    const onLostPointerCapture = () => boardsStore.cancelDrag()

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
        // All four modifiers, not just the two that pick the shortcut: dropping `shift`
        // makes Ctrl+Shift+Z -- the redo chord -- indistinguishable from undo.
        const modifiers = { ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey }
        if (boardsStore.handleKey(e.key, modifiers)) e.preventDefault()
    }

    /*
     * "The board lost focus" now has to mean the *board*, not a cell (spec P1-8).
     *
     * Under the roving tabindex, focus moves from cell to cell inside the grid, and React's
     * `onBlur` is `focusout`, which bubbles. Measured before this guard existed: moving
     * focus from `0,0` to `0,1` fired `focusout` on the grid with `relatedTarget` set to
     * the sibling cell -- so every single arrow key would have run `cancelGesture` and
     * thrown away the anchor the player had just set, one keystroke before the arrow that
     * was going to use it.
     *
     * `relatedTarget` is null when focus leaves for nothing at all (a click on the page
     * background, the window losing focus), which is the case this handler is really for.
     */
    const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        const next = e.relatedTarget as Node | null
        if (next !== null && e.currentTarget.contains(next)) return
        boardsStore.cancelGesture()
    }

    /*
     * `inert`, not `pointerEvents: none` (spec P1-4).
     *
     * They are not equivalent and the difference is the whole point: `pointer-events`
     * stops the mouse and nothing else, so every cell of a won board stayed tabbable,
     * focusable and announced -- a keyboard or screen-reader user could go on "playing" a
     * board that was already finished. `inert` removes the subtree from hit-testing, from
     * the tab order and from the accessibility tree together, and moves focus out if it is
     * inside.
     */
    /*
     * One place where every outcome becomes feedback (spec P1-5, D10-f).
     *
     * Driven from the session's `outcomeTick` rather than from the pointer handler, so the
     * keyboard is treated identically: a refused arrow key shakes the board exactly as a
     * refused drag does. The counter matters -- two refusals in a row are two events, and
     * watching `lastOutcome` alone would miss the second.
     *
     * Both watchers remember *which session* they were counting, not just how far they had
     * counted. This component is never remounted when the player changes level or
     * difficulty -- `DominoClient` renders it with no `key` -- so the prop becomes a
     * different `PuzzleSession` underneath a component whose refs survive. Sessions are
     * cached and keep their own counters, so comparing a bare number across that switch
     * compares one puzzle's history against another's. Measured before this was fixed:
     * placing a domino on level 1 and then switching to an untouched level 2 fired a
     * rejection buzz on a board that had never refused anything.
     *
     * Arriving at a new session therefore *adopts* its counters and produces nothing. That
     * is deliberately not the same as muting: only the one stale comparison is skipped, and
     * the very next thing the new board does is felt normally.
     */
    const tick = boardsStore.outcomeTick
    const rejections = boardsStore.rejectionTick
    /** Initialised from the session in hand, so mounting is never itself an event. */
    const lastHandled = useRef<Seen>({ session: boardsStore, count: tick })
    const lastShaken = useRef<Seen>({ session: boardsStore, count: rejections })
    const shake = useAnimationControls()

    useEffect(() => {
        const seen = lastHandled.current
        lastHandled.current = { session: boardsStore, count: tick }
        if (seen.session !== boardsStore || seen.count === tick) return
        feedbackFor(boardsStore.lastOutcome)
    }, [tick, boardsStore])

    /*
     * The shake, driven imperatively rather than by remounting.
     *
     * An earlier version bumped a `key` to replay the animation, which remounts the grid --
     * and the grid is the focusable element. Measured: the first successful move changed the
     * key, React remounted, focus was lost, `onBlur` fired `cancelGesture`, and a keyboard
     * player's pending anchor vanished before the arrow that would have used it. Controls
     * replay the same animation without touching the tree.
     *
     * `rejectionTick` counts refusals only and starts at zero, so nothing plays on load.
     */
    useEffect(() => {
        const seen = lastShaken.current
        lastShaken.current = { session: boardsStore, count: rejections }
        if (seen.session !== boardsStore) {
            // The controls are shared across sessions because the element is. A shake still
            // running when the player switches would otherwise finish on a board that never
            // earned it, so it is stopped and the offset cleared.
            shake.stop()
            void shake.set({ x: 0 })
            return
        }
        if (seen.count === rejections) return
        void shake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.28 } })
    }, [rejections, boardsStore, shake])

    const isDisabled = boardsStore.completed
    return (
        <div
            className="select-none"
            style={shellStyle}
            inert={isDisabled}
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
                <motion.div
                    animate={shake}
                    data-rejected={rejections > 0 ? rejections : undefined}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                    onLostPointerCapture={onLostPointerCapture}
                    onPointerLeave={onPointerLeave}
                    onKeyDown={onKeyDown}
                    onBlur={onBlur}
                    /*
                     * Exactly one tab stop for the whole board, wherever the keyboard is.
                     *
                     * P1-8 sketches this as "container `tabIndex={0}`, focused cell `0`,
                     * rest `-1`", which leaves *two* stops once a cell is focused -- the
                     * container is earlier in document order, so Tab would land on the
                     * board, then on a square inside it, then leave. Handing the stop over
                     * to the cell instead is the same rule with the container included in
                     * the rotation, and `-1` keeps it programmatically focusable, which is
                     * what `.focus()` on the grid still relies on.
                     */
                    tabIndex={boardsStore.focusedCell === null ? 0 : -1}
                    role="grid"
                    aria-label={`Domino board, ${size} by ${size}`}
                    aria-rowcount={size}
                    aria-colcount={size}
                    draggable={false}
                    style={gridStyle}
                    className="board-grid relative cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-blue-500"
                >
                    <Hover boardsStore={boardsStore} />
                    <Selection boardsStore={boardsStore} />
                    <Pieces boardsStore={boardsStore} />
                    {/*
                      * `role="row"` wrappers with `display: contents` (spec P1-8).
                      *
                      * A grid needs rows between it and its cells, and the cells have to
                      * stay direct children of the CSS grid or `grid-template-columns`
                      * stops applying to them. `display: contents` is what satisfies both,
                      * and its reputation for dropping elements out of the accessibility
                      * tree is why it was measured before it was used: in the browser this
                      * suite runs, the probe returned `grid > row > gridcell` with every
                      * row present, and the cells laid out in their columns unchanged.
                      */}
                    {boardsStore.board.map((_row, i) => (
                        <div
                            key={`row_${i}`}
                            role="row"
                            aria-rowindex={i + 1}
                            data-row={i}
                            style={{ display: 'contents' }}
                        >
                            {boardsStore.board[i].map((_cell, j) => (
                                <BoardSquare key={`${i}_${j}`} i={i} j={j} boardsStore={boardsStore} />
                            ))}
                        </div>
                    ))}
                </motion.div>
            </div>
        </div>
    )
}
export default observer(ClientBoard)
