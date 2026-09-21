"use client"
import { useCallback, useEffect, useState } from 'react'
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
import Archive from './Archive'
import DayBanner from './DayBanner'
import AdviceStrip from './AdviceStrip'

/** Page margin kept clear on each side, in CSS px. Part of the fit budget. */
const PAGE_MARGIN_PX = 8

const DominoClient: React.FC = () => {
  const [isLoading, setisLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const { boardsStore, corpus } = useStores()

  /*
   * The day's puzzles are fetched from the published corpus (spec P1-6, row 18d).
   *
   * Two things changed here. The content no longer comes from a Server Action over two
   * bundled day-entries selected by `daysSinceEpoch % 2` -- a rotation that re-served the
   * same puzzles under endlessly many dates, so no date had a stable answer and an archive
   * had nothing to point at. It is now one static, content-hashed month chunk fetched on
   * demand, and the date maps to it permanently.
   *
   * The day itself is still the player's *local* calendar day, and that part is unchanged
   * for the same reason as before: a server's `new Date()` answers to the server's timezone,
   * so a player in Auckland would be handed tomorrow's puzzle before their own midnight
   * while the rollover check below, which can only be local, disagreed with it.
   */
  const loadBoards = useCallback(async () => {
    // The whole result, not just the content: a clock outside the published range is
    // clamped, and the store needs to know that happened or the screen cannot say so.
    boardsStore.receiveDay(await corpus.loadDay(dayKey(new Date())))
  }, [boardsStore, corpus])

  /*
   * Go to a date because the player said so.
   *
   * `setDay` rather than `receiveDay`: the hold-back rule protects someone from having a
   * board taken away by a *clock*, and there is nothing to protect them from when they are
   * the one asking. Their position on the day they leave is saved and reachable again from
   * the archive, which is the whole point of it existing.
   */
  const goToDate = useCallback(async (date: string) => {
    const loaded = await corpus.loadDay(date)
    boardsStore.setDay(loaded.day)
  }, [boardsStore, corpus])

  useEffect(() => {
    // The first load is the only one whose failure the player must see: there is no board
    // behind it to fall back to. Later failures are `useDayRollover`'s business, and it
    // retries them.
    loadBoards()
      .then(() => setFailed(false))
      .catch(() => setFailed(true))
      .finally(() => setisLoading(false))
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
  if (isLoading) return <div>no board</div>
  if (!currentBoard) {
    return (
      <div className='m-auto p-4 text-center' role='alert'>
        <p className='font-semibold'>Today&apos;s puzzles could not be loaded.</p>
        <p className='text-sm opacity-70'>
          {failed ? 'Check your connection and reload the page.' : 'No board'}
        </p>
      </div>
    )
  }
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
      {/* No wrapper: the banner is usually absent, and an empty `data-chrome` row still
          costs the column's gap -- which comes straight out of the board's height budget. */}
      <DayBanner boardsStore={boardsStore} onGoToDate={goToDate} />
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
        <AdviceStrip boardsStore={currentBoard} />
      </div>
      <div data-chrome>
        <GameControls boardsStore={currentBoard} />
      </div>
      {/* One row, not two. Every `data-chrome` row is subtracted from the board's height
          budget, and at 1280x800 an 8x8 board is already within a few pixels of the 38px
          minimum cell -- measured: a separate row for this button put it exactly on the
          floor, where a safe-area inset could no longer shrink it at all. */}
      <div data-chrome className='flex items-center gap-3'>
        <LevelSelector boardsStore={boardsStore} />
        <button
          type='button'
          data-open-archive
          className='rounded-md border px-3 py-1 text-sm'
          onClick={() => boardsStore.setArchiveOpen(true)}
        >
          Archive
        </button>
      </div>
      {/* Mounted only while open: see the note in Archive.tsx. */}
      {boardsStore.archiveOpen
        && <Archive boardsStore={boardsStore} corpus={corpus} onPick={goToDate} />}
      <Tutorial />
    </div>
  );
}

export default observer(DominoClient)
