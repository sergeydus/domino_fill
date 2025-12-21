"use client"
import React, { CSSProperties, use, useMemo } from "react";
import { observer } from "mobx-react";
import { useStores } from "../hooks/useStore";

type Props = {
    i: number
    j: number
    isHighlighted: boolean
};
type Props2 = {
    i: number,
    j: number
    isRock: boolean,
    isHighlighted: boolean
}

const BoardSquare: React.FC<Props2> = observer(({ isRock, i, j, isHighlighted }) => {
    // console.log('square rerender')
    const { boardsStore } = useStores()
    const currentBoard = boardsStore.currentBoard
    const size = currentBoard.board.length
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
    const onClick = () => {
        try {

            console.log('clicked', { i, j })
            const audio = new Audio('snap.mp3');
            audio.play();
        } catch (e) {
            console.log('error', e)
        }
    }
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
        <div className="relative" onClick={onClick} key={i} style={{ ...style, ...cornerStyle }}>
            {/* {isHighlighted && <div className="absolute top-0 left-0 right-0 bottom-0 z-1 bg-white opacity-70 pointer-events-none"></div>} */}
            {/* <div>{`i:${i},j:${j}`}({currentBoard.board[i][j]})</div> */}
        </div>)

})
//prevent all squares from rerendering
const SquareWrapper: React.FC<Props> = ({ i, j, isHighlighted }) => {
    // console.log('wrapper rerender')
    const { boardsStore } = useStores()
    const currentBoard = boardsStore.currentBoard

    const isRock = currentBoard.board[i][j] == -1
    // const isHighlighted = boardsStore.highlightedSquares?.some(([index, jndex]) => index === i && jndex === j) ?? false
    return <BoardSquare i={i} j={j} isRock={isRock} isHighlighted={isHighlighted} />
}

export default observer(SquareWrapper)