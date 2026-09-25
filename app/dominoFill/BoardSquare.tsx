"use client"
import React, { CSSProperties, useEffect, useMemo, useRef } from "react";
import { observer } from "mobx-react";
import { PuzzleSession } from "../stores/PuzzleSession";
import { cellDescription } from "./cellLabel";
import { PALETTE } from "../palette";

type Props = {
    i: number
    j: number
    boardsStore: PuzzleSession
};
type Props2 = {
    i: number,
    j: number
    /** This cell is the one a hint is pointing at (spec P1-5, row 18e). */
    isHinted: boolean,
    /** The keyboard is on this cell, so it is the grid's single tab stop (spec P1-8). */
    isFocused: boolean,
    /** The anchor of a half-made move, and the squares it could pair with. */
    isAnchor: boolean,
    isCandidate: boolean,
    boardsStore: PuzzleSession
}

const BoardSquare: React.FC<Props2> = observer((
    { isHinted, isFocused, isAnchor, isCandidate, i, j, boardsStore },
) => {
    const size = boardsStore.board.length
    // Named for what it tests: it was `isDark`, and it picks the lighter tone.
    const isEven = (i + j) % 2 === 0;
    const color = isEven ? PALETTE.checkerLight : PALETTE.checkerDark
    const squareStyle: CSSProperties = useMemo(() => {
        return {
            aspectRatio: 1,
            height: `${boardsStore.squareSize}px`,
            width: `${boardsStore.squareSize}px`
        }
    }, [boardsStore.squareSize])
    const style = useMemo(() => ({ ...squareStyle, backgroundColor: color }), [color, squareStyle])
    /*
     * No click handler any more (spec D10-f).
     *
     * This used to play `snap.mp3` on every square click -- including clicks that placed
     * nothing -- so the sound that means "that worked" also meant "that did not". It also
     * built a new `Audio` per click. Sound now follows the *outcome*, in feedback.ts,
     * driven from the session so the keyboard is treated identically.
     */
    // Round only the four corners of the board, not of every cell -- by the board's one
    // corner token, which the frame's inner edge also follows (ClientBoard, P1-3).
    const cornerStyle = useMemo(() => {
        const r = 'var(--board-corner)'
        if (i === 0 && j === 0) return { borderTopLeftRadius: r }
        if (i === 0 && j === size - 1) return { borderTopRightRadius: r }
        if (i === size - 1 && j === 0) return { borderBottomLeftRadius: r }
        if (i === size - 1 && j === size - 1) return { borderBottomRightRadius: r }
        return {}
    }, [i, j, size])

    /*
     * The roving tabindex, made real (spec P1-8).
     *
     * A tabindex alone only decides where Tab lands. What a screen reader *announces* is
     * driven by where DOM focus actually is, so the focused cell has to be focused -- and
     * that is the whole reason this is worth doing: arrowing around the board then reads
     * out each square with no live region involved, because the browser is doing it.
     *
     * Only ever *moves* focus that is already inside the board. Calling `focus()` because
     * the store changed would otherwise yank the page away from whatever the player was
     * doing -- a restored session sets `focusedCell`, and so does undo.
     */
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const el = ref.current
        if (!isFocused || el === null || el === document.activeElement) return
        const grid = el.closest('[role="grid"]')
        if (grid?.contains(document.activeElement) === true) el.focus()
    }, [isFocused])

    const value = boardsStore.board[i][j]
    return (
        <div
            ref={ref}
            className="relative outline-none"
            data-cell={`${i},${j}`}
            data-hinted={isHinted || undefined}
            role="gridcell"
            /*
             * Exactly one cell in the grid is tabbable, so the board is one tab stop
             * rather than 36-64 of them -- the failure mode P1-8 names explicitly. With
             * no focused cell yet, the top-left square holds the stop, and the grid itself
             * holds none, so Tab lands on a square and not on the board around it.
             */
            tabIndex={isFocused || (boardsStore.focusedCell === null && i === 0 && j === 0) ? 0 : -1}
            /*
             * Taking focus *is* moving the keyboard here (spec P1-8).
             *
             * Without this the store learns nothing when Tab puts the keyboard on a
             * square, so `focusedCell` stays null and the next arrow key is spent
             * initialising it instead of moving: measured from a cold page, tabbing in and
             * pressing Right left the player still on `0,0`, and only a second press
             * reached `0,1`. A keypress that visibly does nothing is the kind of thing a
             * player reads as the board being broken.
             *
             * Guarded so that re-focusing the square the store already knows about does
             * not write, which keeps `focus()` from the effect above out of a render loop.
             *
             * The cell it names is `[i, j]` and that is load-bearing, not decorative. A
             * non-initial square carries `tabIndex=-1`, which keeps it out of the tab
             * order while leaving it **programmatically focusable** -- which is how
             * assistive technology moves focus around a grid, and how any application
             * code would. Measured: `.focus()` on `3,4` puts the store on `3,4` and the
             * next arrow key moves to `3,5`; with a constant `[0, 0]` the store would
             * believe the keyboard is at the origin and the arrow would jump there.
             *
             * A `.click()` cannot check this, because `pointerDown` assigns `focusedCell`
             * itself and masks whatever this handler did. An earlier version of the test
             * clicked, the constant survived it, and the survivor was wrongly written off
             * as equivalent -- on reasoning that only considered the pointer and Tab, and
             * never asked what else can focus a square.
             */
            onFocus={() => { if (!isFocused) boardsStore.setFocusedCell([i, j]) }}
            aria-label={cellDescription([i, j], value, { isAnchor, isCandidate, isHinted })}
            aria-selected={isAnchor || undefined}
            key={i}
            style={{ ...style, ...cornerStyle }}
        >
            {/*
              * An outline rather than a border or a background, for the reason row 11
              * settled for the line states: outlines take no layout space, and a border
              * here would reopen the gutter overflow P0-3 closed. Inset so it reads as
              * marking the cell rather than the gap beside it.
              */}
            {isHinted && (
                <div
                    className="pointer-events-none absolute inset-[2px] rounded-[4px] outline-3 outline-hint"
                />
            )}
        </div>)

})
//prevent all squares from rerendering
const SquareWrapper: React.FC<Props> = ({ i, j, boardsStore }) => {
    // No `isRock` prop any more: a rock is `-1` on the board, and that is the same value
    // `cellDescription` reads to name the square. Two sources for one fact is one too many.
    const hint = boardsStore.hintCell
    const isHinted = hint?.[0] === i && hint[1] === j
    const focus = boardsStore.focusedCell
    const isFocused = focus?.[0] === i && focus[1] === j
    const anchor = boardsStore.pendingAnchor
    const isAnchor = anchor?.[0] === i && anchor[1] === j
    const isCandidate = boardsStore.candidateCells.some(([ci, cj]) => ci === i && cj === j)
    return <BoardSquare
        i={i} j={j} isHinted={isHinted} isFocused={isFocused}
        isAnchor={isAnchor} isCandidate={isCandidate} boardsStore={boardsStore}
    />
}

export default observer(SquareWrapper)
