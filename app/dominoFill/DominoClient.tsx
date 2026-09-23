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
import { preloadSounds, unlockSounds } from './feedback'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { FocusAcrossComposition } from './FocusAcrossComposition'
import {
  RAIL_WIDTH_PX, STAGE_GAP_PX, WIDE_BOARD_CAP_PX, WIDE_LAYOUT_QUERY,
} from './composition'

/**
 * Keys that cannot prime audio: a modifier press on its own is not user activation, so
 * calling `play()` from one spends an attempt and records a refusal.
 */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/** Page margin kept clear on each side, in CSS px. Part of the fit budget. */
const PAGE_MARGIN_PX = 8

const DominoClient: React.FC = () => {
  const [isLoading, setisLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const { boardsStore, corpus, sound } = useStores()

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

  /*
   * Prime the audio pool inside the player's first gesture (spec P2-4, row 20d).
   *
   * iOS unlocks media elements one at a time and only from a real user gesture, so an
   * element constructed outside one is refused the first time it plays -- even while a
   * different element plays perfectly. The win sound is the case that suffers: its first
   * play is minutes after any tap, so without this it is silent on exactly the occasion it
   * exists for. `pointerdown` rather than `click`, because it is the earliest gesture the
   * board itself acts on -- and `keydown` beside it, because the whole of P1-8 is that this
   * game is playable without a pointer at all, and a keyboard player would otherwise have
   * had no sound for the entire session.
   *
   * Not `once` (row 20i). Priming can be *refused*, and a listener that removes itself on
   * the first gesture would make that permanent: the player's first tap would decide
   * whether the game ever makes a sound again. The listeners stay until every element has
   * actually been primed, and `unlockSounds` skips the ones that already are.
   */
  useEffect(() => {
    preloadSounds()

    // Idempotent, and it is both the success path and the effect's cleanup.
    const stop = () => {
      document.removeEventListener('pointerdown', prime)
      document.removeEventListener('keydown', prime)
    }
    const prime = (event: Event) => {
      // A modifier on its own is not an activating gesture in any browser, so priming on
      // one would spend the attempt and record a refusal.
      if (event instanceof KeyboardEvent && MODIFIERS.has(event.key)) return
      void unlockSounds().then(done => { if (done) stop() })
    }

    document.addEventListener('pointerdown', prime)
    document.addEventListener('keydown', prime)
    return stop
  }, [])

  // A callback ref in state, not `useRef`: the column is not mounted on the first render
  // (the board is still loading), and a ref would leave the hook with nothing to observe.
  const [column, setColumn] = useState<HTMLDivElement | null>(null)

  /*
   * One column or two (graphics spec P0-1, row 1).
   *
   * In the wide composition the secondary controls move into a rail beside the board, so
   * they stop costing the board *height* and start costing it *width* -- which is the
   * trade that pays, because the desktop has width to spare and the stacked chrome had
   * left an 8x8 board on 41px cells in a 1280x800 window.
   */
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY)
  const box = useAvailableBoardBox(
    column, PAGE_MARGIN_PX, wide ? RAIL_WIDTH_PX + STAGE_GAP_PX : 0)

  const currentBoard = boardsStore.currentBoard
  useEffect(() => {
    currentBoard?.setAvailableBox(box)
  }, [currentBoard, box])

  /*
   * The cap, and only in the wide layout.
   *
   * Below the breakpoint the budget is already doing the capping -- a phone has nothing
   * spare to give away -- so an unconditional cap would be a constant that never fires and
   * could not be trusted to. `Infinity` is the session's own default.
   */
  useEffect(() => {
    currentBoard?.setMaxBoardSize(wide ? WIDE_BOARD_CAP_PX : Infinity)
  }, [currentBoard, wide])

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
  /*
   * The pieces of the page, named once and arranged twice.
   *
   * One *source* for each element, so a control cannot end up fixed in one layout and
   * stale in the other and `data-chrome` markers cannot drift apart. What changes between
   * the compositions is only where these go.
   *
   * That is emphatically **not** the same as one tree at runtime. React identifies an
   * element by its position, so rendering the same JSX under a different parent unmounts
   * it and builds a new one: the DOM node a player was using is destroyed and replaced.
   * An earlier version of this comment said these were "arranged, not rebuilt", which was
   * wrong and cost the keyboard its place -- see the focus restoration above.
   */
  const banner = <DayBanner boardsStore={boardsStore} onGoToDate={goToDate} />

  const difficulty = (
    <div data-chrome>
      <DifficultySlider boardsStore={boardsStore} />
    </div>
  )

  /* The scoring key stays with the board in both compositions (graphics spec 2.3). It is
     not chrome: it explains what is *on* the board, and P1-1 of SPEC.md is explicit that
     it is a legend rather than a control. */
  const legend = (
    <div data-chrome>
      <DominoPieces boardsStore={currentBoard} />
    </div>
  )

  const completion = currentBoard.completed && (
    <div data-chrome>
      <CompletionCard session={currentBoard} levels={boardsStore} />
    </div>
  )

  /* Also board-adjacent, in both: it is a sentence about this board's current state, and
     reading it a column away from the squares it describes would be worse than the
     stacking it replaces. */
  const advice = (
    <div data-chrome>
      <AdviceStrip boardsStore={currentBoard} />
    </div>
  )

  const controls = (
    <div data-chrome>
      <GameControls boardsStore={currentBoard} />
    </div>
  )

  /*
   * One row, not two. Every `data-chrome` row is subtracted from the board's height
   * budget, and at 1280x800 an 8x8 board was already within a few pixels of the 38px
   * minimum cell -- measured: a separate row for this button put it exactly on the floor,
   * where a safe-area inset could no longer shrink it at all.
   *
   * The grouping is kept in the rail too. There the height reason no longer applies, but
   * these three are one thing -- where you are, and how you get elsewhere -- and the row
   * count the sound suite budgets against stays the same in both compositions.
   */
  const navigation = (
    <div data-chrome className={wide ? 'flex flex-wrap items-center gap-3' : 'flex items-center gap-3'}>
      <LevelSelector boardsStore={boardsStore} />
      <button
        type='button'
        data-open-archive
        className='rounded-md border px-3 py-1 text-sm'
        onClick={() => boardsStore.setArchiveOpen(true)}
      >
        Archive
      </button>
      {/*
        * Muting is a real requirement, not a nicety: a daily puzzle is played on a train,
        * in a queue, in a meeting -- and a game that cannot be silenced gets closed
        * instead (spec P2-4).
        *
        * `aria-pressed` says the state, the text says it again for everyone else, and
        * the label names what the control *is* rather than what pressing it does, which
        * is what `aria-pressed` is for.
        */}
      <button
        type='button'
        data-mute
        aria-pressed={sound.muted}
        aria-label='Sound'
        className='control-surface rounded-md border px-3 py-1 text-sm'
        onClick={() => sound.toggle()}
      >
        {sound.muted ? 'Sound off' : 'Sound on'}
      </button>
    </div>
  )

  const overlays = (
    <>
      {/* Mounted only while open: see the note in Archive.tsx. */}
      {boardsStore.archiveOpen
        && <Archive boardsStore={boardsStore} corpus={corpus} onPick={goToDate} />}
      <Tutorial />
    </>
  )

  return (
    /*
     * Wrapped so the keyboard survives the rearrangement.
     *
     * Everything below is rebuilt when `wide` flips -- React reparents by unmounting --
     * so whichever control had focus is destroyed. `FocusAcrossComposition` reads the
     * focus in the instant before the commit and writes it back within the same commit --
     * unless a child's layout effect has already put it somewhere on purpose.
     */
    <FocusAcrossComposition composition={wide ? 'rail' : 'column'}>
      {/*
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
       * The margin and the padding live on this wrapper in both compositions, so the
       * arithmetic `useAvailableBoardBox` does -- viewport minus margin minus insets -- is
       * the same arithmetic whichever one is showing.
       */}
      <div
        data-stage
        data-wide={wide ? '' : undefined}
        className={wide
          ? 'm-auto flex flex-row items-start justify-center'
          : 'm-auto'}
        style={{
          // The page margin plus whatever the device's safe area asks for, so the board is
          // never laid out under a notch or a home indicator.
          paddingTop: `calc(${PAGE_MARGIN_PX}px + var(--safe-top))`,
          paddingRight: `calc(${PAGE_MARGIN_PX}px + var(--safe-right))`,
          paddingBottom: `calc(${PAGE_MARGIN_PX}px + var(--safe-bottom))`,
          paddingLeft: `calc(${PAGE_MARGIN_PX}px + var(--safe-left))`,
          gap: wide ? `${STAGE_GAP_PX}px` : undefined,
        }}
      >
        {/*
          * The measured column: the board and everything that must stay beside it.
          *
          * `data-chrome` marks everything in here that is not the board.
          * `useAvailableBoardBox` sums those heights and gives the board what is left, so
          * the board is budgeted against the space it actually has. Anything in the rail is
          * outside this element and therefore outside that sum -- which is the entire point
          * of the wide composition.
          */}
        <div
          ref={setColumn}
          className='flex flex-col gap-4 items-center justify-center'
        >
          {/* No wrapper: the banner is usually absent, and an empty `data-chrome` row still
              costs the column's gap -- which comes straight out of the board's height
              budget. */}
          {banner}
          {!wide && difficulty}
          <ClientBoard boardsStore={currentBoard} />
          {legend}
          {completion}
          {advice}
          {!wide && controls}
          {!wide && navigation}
          {overlays}
        </div>

        {wide && (
          <div
            data-rail
            className='flex flex-col gap-4 items-stretch'
            style={{ width: `${RAIL_WIDTH_PX}px` }}
          >
            {difficulty}
            {controls}
            {navigation}
          </div>
        )}
      </div>
    </FocusAcrossComposition>
  );
}

export default observer(DominoClient)
