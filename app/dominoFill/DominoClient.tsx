"use client"
import { useEffect, useState } from 'react'
import { getCurrentActiveBoard } from './Boards'
import DifficultySlider from './DifficultySlider'
import ClientBoard from './ClientBoard'
import DominoPieces from './Pieces/DominoPieces'
import { useStores } from '../hooks/useStore'
import { observer } from 'mobx-react'
import LevelSelector from './LevelSelector'
import Tutorial from './Tutorial'
import { useAvailableBoardBox } from '../hooks/useAvailableBoardBox'

/** Page margin kept clear on each side, in CSS px. Part of the fit budget. */
const PAGE_MARGIN_PX = 8

const DominoClient: React.FC = () => {
  const [isLoading, setisLoading] = useState(true)
  const { boardsStore } = useStores()
  useEffect(() => {
    getCurrentActiveBoard().then((boards) => {
      boardsStore.setBoards(boards)
      setisLoading(false)
    })
  }, [boardsStore])

  // A callback ref in state, not `useRef`: the column is not mounted on the first render
  // (the board is still loading), and a ref would leave the hook with nothing to observe.
  const [column, setColumn] = useState<HTMLDivElement | null>(null)
  const box = useAvailableBoardBox(column, PAGE_MARGIN_PX)

  const currentBoard = boardsStore.currentBoard
  useEffect(() => {
    currentBoard?.setAvailableBox(box)
  }, [currentBoard, box])

  const onRightClick = (e: React.MouseEvent<HTMLDivElement>) => {
    boardsStore.setSelectedPiece(boardsStore.selectedPiece == 1 ? 2 : 1)
    e.preventDefault()
  }
  if (isLoading || !currentBoard) return <div>no board</div>
  return (
    /*
     * `m-auto` rather than `justify-center` on the parent. An auto margin resolves to zero
     * when there is no free space, so an overflowing column stays anchored at the top and
     * every part of it can be scrolled to.
     *
     * To be precise about what that does and does not fix: centring only strands content
     * above the scroll origin when the container has a *definite* height. Measured, with
     * the board overflowing at 800x400: `min-h-svh` plus `justify-center` clips nothing,
     * because the container simply grows. Swap the `min-h` for `h-svh` and it clips at
     * once. The auto margin is what makes that distinction stop mattering.
     *
     * The `min-h-screen` wrapper that used to be here as well is gone: the page had it
     * twice, nested, so the document was always two viewports tall and always had a
     * scrollbar (spec D10-b).
     *
     * `data-chrome` marks everything that is not the board. `useAvailableBoardBox` sums
     * those heights and gives the board what is left, so the board is budgeted against the
     * space it actually has rather than against the viewport width alone.
     */
    <div
      ref={setColumn}
      onContextMenu={onRightClick}
      className='m-auto flex flex-col gap-4 items-center justify-center'
      style={{ padding: PAGE_MARGIN_PX }}
    >
      <div data-chrome>
        <DifficultySlider boardsStore={boardsStore} />
      </div>
      <ClientBoard boardsStore={currentBoard} />
      <div data-chrome>
        <DominoPieces boardsStore={currentBoard} />
      </div>
      <div data-chrome>
        <LevelSelector boardsStore={boardsStore} />
      </div>
      <Tutorial />
    </div>
  );
}

export default observer(DominoClient)
