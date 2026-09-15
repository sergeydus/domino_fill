"use client"
import { useCallback, useEffect, useState } from 'react'
import { getCurrentActiveBoard } from './Boards'
import DifficultySlider from './DifficultySlider'
import ClientBoard from './ClientBoard'
import DominoPieces from './Pieces/DominoPieces'
import { useStores } from '../hooks/useStore'
import { observer } from 'mobx-react'
import LevelSelector from './LevelSelector'
import GameControls from './GameControls'
import CompletionCard from './CompletionCard'
import Tutorial from './Tutorial'
import { useAvailableBoardBox } from '../hooks/useAvailableBoardBox'
import { useDayRollover } from '../hooks/useDayRollover'
import { dayKey } from '../stores/progressStorage'

/** Page margin kept clear on each side, in CSS px. Part of the fit budget. */
const PAGE_MARGIN_PX = 8

const DominoClient: React.FC = () => {
  const [isLoading, setisLoading] = useState(true)
  const { boardsStore } = useStores()

  /*
   * The player's own calendar day is sent to the server, not inferred there.
   *
   * `getCurrentActiveBoard` is a Server Action, so an unaided `new Date()` inside it is the
   * *server's* timezone: a player in Auckland would be handed tomorrow's puzzle before their
   * own midnight, and one in Los Angeles would still be on yesterday's through the morning --
   * while the rollover check below, which can only be local, disagreed with both.
   */
  const loadBoards = useCallback(async () => {
    const boards = await getCurrentActiveBoard(dayKey(new Date()))
    boardsStore.setBoards(boards)
  }, [boardsStore])

  useEffect(() => {
    loadBoards().then(() => setisLoading(false))
  }, [loadBoards])

  /*
   * The day's puzzle actually changes at midnight (spec P1-7).
   *
   * Without this the board is fetched once and never again, so a tab left open overnight
   * serves yesterday's puzzle for as long as it stays open -- and for a daily game on a
   * phone, "left open overnight" is the ordinary case rather than the edge one.
   *
   * A failed refetch does not reach the screen: the player is mid-game with a perfectly good
   * board, and replacing it with an error because a background refresh missed the server
   * would take away something that was working. It is *returned* rather than swallowed here,
   * so `useDayRollover` can see the failure and try again on the next trigger -- swallowing
   * it here is what made the retry impossible.
   */
  useDayRollover(loadBoards)

  // A callback ref in state, not `useRef`: the column is not mounted on the first render
  // (the board is still loading), and a ref would leave the hook with nothing to observe.
  const [column, setColumn] = useState<HTMLDivElement | null>(null)
  const box = useAvailableBoardBox(column, PAGE_MARGIN_PX)

  const currentBoard = boardsStore.currentBoard
  useEffect(() => {
    currentBoard?.setAvailableBox(box)
  }, [currentBoard, box])

  /*
   * No `onContextMenu` any more.
   *
   * Right-click used to flip the selected piece, which the drag verb removes entirely
   * (P1-1). It was bound to the whole wrapper, so right-clicking the difficulty slider or
   * the level arrows rotated the piece too, and Android fired it on long-press (D10-r).
   */
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
     * The redundant nested `min-h-screen` wrapper that used to be here is gone as simple
     * cleanup. It was *not* making the document two viewports tall: nested `min-height`
     * elements do not add up, and a browser probe showed two nested 800px boxes, not
     * 1600px. The 1095px document measured at the time was content overflow (spec D10-b,
     * recorded there as a false diagnosis).
     *
     * `data-chrome` marks everything that is not the board. `useAvailableBoardBox` sums
     * those heights and gives the board what is left, so the board is budgeted against the
     * space it actually has rather than against the viewport width alone.
     */
    <div
      ref={setColumn}
      className='m-auto flex flex-col gap-4 items-center justify-center'
      style={{
        // The page margin plus whatever the device's safe area asks for, so the board is
        // never laid out under a notch or a home indicator.
        paddingTop: `calc(${PAGE_MARGIN_PX}px + var(--safe-top))`,
        paddingRight: `calc(${PAGE_MARGIN_PX}px + var(--safe-right))`,
        paddingBottom: `calc(${PAGE_MARGIN_PX}px + var(--safe-bottom))`,
        paddingLeft: `calc(${PAGE_MARGIN_PX}px + var(--safe-left))`,
      }}
    >
      <div data-chrome>
        <DifficultySlider boardsStore={boardsStore} />
      </div>
      <ClientBoard boardsStore={currentBoard} />
      <div data-chrome>
        <DominoPieces boardsStore={currentBoard} />
      </div>
      {currentBoard.completed && (
        <div data-chrome>
          <CompletionCard session={currentBoard} levels={boardsStore} />
        </div>
      )}
      <div data-chrome>
        <GameControls boardsStore={currentBoard} />
      </div>
      <div data-chrome>
        <LevelSelector boardsStore={boardsStore} />
      </div>
      <Tutorial />
    </div>
  );
}

export default observer(DominoClient)
