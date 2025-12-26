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

const DominoClient: React.FC = () => {
  const [isLoading, setisLoading] = useState(true)
  const { boardsStore } = useStores()
  useEffect(() => {
    getCurrentActiveBoard().then((boards) => {
      console.log('get active board res!!!', boards)
      boardsStore.setBoards(boards)
      setisLoading(false)
    })
  }, [boardsStore])

  const currentBoard = boardsStore.currentBoard
  console.log('client rerender')
  const onRightClick = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('e', e)
    boardsStore.setSelectedPiece(boardsStore.selectedPiece == 1 ? 2 : 1)

    e.preventDefault()
  }
  if (isLoading || !currentBoard) return <div>no board</div>
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-[#e8e7e7] font-sans">
      <div onContextMenu={onRightClick} className='flex flex-col gap-4 items-center justify-center'>
        <DifficultySlider boardsStore={boardsStore} />
        <ClientBoard boardsStore={currentBoard} />
        <DominoPieces boardsStore={currentBoard} />
        <LevelSelector boardsStore={boardsStore} />
      </div>
      <Tutorial />
    </div >
  );
}

export default observer(DominoClient)
