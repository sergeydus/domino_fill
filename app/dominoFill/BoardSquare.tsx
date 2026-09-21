"use client"
import React, { CSSProperties, useMemo } from "react";
import { observer } from "mobx-react";
import { PuzzleSession } from "../stores/PuzzleSession";

type Props = {
    i: number
    j: number
    boardsStore: PuzzleSession
};
type Props2 = {
    i: number,
    j: number
    isRock: boolean,
    /** This cell is the one a hint is pointing at (spec P1-5, row 18e). */
    isHinted: boolean,
    boardsStore: PuzzleSession
}

const BoardSquare: React.FC<Props2> = observer(({ isRock, isHinted, i, j, boardsStore }) => {
    // console.log('square rerender')
    const size = boardsStore.board.length
    const isDark = (i + j) % 2 === 0;
    const color = isDark ? '#cbcbcb' : '#ababab'
    //ignore now
    if (isRock) {
        // color = '#000000'
    }
    const squareStyle: CSSProperties = useMemo(() => {
        return {
            aspectRatio: 1,
            height: `${boardsStore.squareSize}px`,
            width: `${boardsStore.squareSize}px`
        }
    }, [boardsStore.squareSize])
    // const onHover = useCallback(() => {
    //     // boardsStore.setHoveredSquare([i, j])
    // }, [boardsStore, i, j])
    // const onHoverLeave = useCallback(() => {
    //     // boardsStore.setHoveredSquare(null)
    // }, [boardsStore])
    const style = useMemo(() => ({ ...squareStyle, backgroundColor: color }), [color, squareStyle])
    /*
     * No click handler any more (spec D10-f).
     *
     * This used to play `snap.mp3` on every square click -- including clicks that placed
     * nothing -- so the sound that means "that worked" also meant "that did not". It also
     * built a new `Audio` per click. Sound now follows the *outcome*, in feedback.ts,
     * driven from the session so the keyboard is treated identically.
     */
    // const isHighlighted = boardsStore.highlightedSquares?.some(([i, j]) => i === row && j === col) ?? false
    // if is in corner, round the corner
    const cornerStyle = useMemo(() => {
        if (i === 0 && j === 0) return { borderTopLeftRadius: '12px' }
        if (i === 0 && j === size - 1) return { borderTopRightRadius: '12px' }
        if (i === size - 1 && j === 0) return { borderBottomLeftRadius: '12px' }
        if (i === size - 1 && j === size - 1) return { borderBottomRightRadius: '12px' }
        return {}
    }, [i, j, size])
    return (
        <div
            className="relative"
            data-cell={`${i},${j}`}
            data-hinted={isHinted || undefined}
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
                    className="pointer-events-none absolute inset-[2px] rounded-[4px] outline-3 outline-[#15661a]"
                />
            )}
            {/* {isHighlighted && <div className="absolute top-0 left-0 right-0 bottom-0 z-1 bg-white opacity-70 pointer-events-none"></div>} */}
            {/* <div>{`i:${i},j:${j}`}({currentBoard.board[i][j]})</div> */}
        </div>)

})
//prevent all squares from rerendering
const SquareWrapper: React.FC<Props> = ({ i, j, boardsStore }) => {
    // console.log('wrapper rerender')
    const isRock = boardsStore.board[i][j] == -1
    const hint = boardsStore.hintCell
    const isHinted = hint?.[0] === i && hint[1] === j
    // const isHighlighted = boardsStore.highlightedSquares?.some(([index, jndex]) => index === i && jndex === j) ?? false
    return <BoardSquare i={i} j={j} isRock={isRock} isHinted={isHinted} boardsStore={boardsStore} />
}

export default observer(SquareWrapper)