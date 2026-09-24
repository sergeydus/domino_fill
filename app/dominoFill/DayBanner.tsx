"use client"
import { observer } from 'mobx-react'
import type { LevelStore } from '../stores/BoardsStore'

/**
 * Which day is on screen, and the way back to today (spec P1-6/P1-7, row 18d).
 *
 * The visible half of the rollover obligation. When midnight arrives while someone is
 * mid-board, the new day is fetched and **held**, because adopting it would retire the
 * sessions for the puzzles it stops serving and take the board off the screen mid-move.
 * Holding it silently would be its own bug, though — the player would sit on yesterday
 * without being told there is a today — so it is announced here and adopted when they say
 * so.
 *
 * The same strip labels an archive day, because the strongest signal that you are not on
 * today's puzzle is being told which day you *are* on.
 */
type Props = {
    boardsStore: LevelStore
    /** Fetch and show a date. Used when there is no held-back day to adopt. */
    onGoToDate: (date: string) => Promise<void>
}

const DayBanner: React.FC<Props> = ({ boardsStore, onGoToDate }) => {
    const { viewingDate, pendingDay, today, deviceToday, clockClamp } = boardsStore
    if (!viewingDate) return null

    // A clamped clock is worth saying even when the player is on the newest day there is:
    // otherwise the game silently disagrees with their device about what day it is.
    const showing = !boardsStore.isViewingToday || pendingDay !== null || clockClamp !== null
    if (!showing) return null

    const clampNote = clockClamp && deviceToday
        ? ` Your device says ${deviceToday}, which is ${clockClamp === 'before' ? 'before' : 'after'}`
        + ' every published puzzle.'
        : ''

    return (
        <div
            data-chrome
            data-day-banner
            className='flex items-center gap-3 rounded-lg bg-banner-surface px-3 py-2 text-sm'
            // Polite, not assertive: this can appear while someone is placing a piece, and
            // interrupting a screen reader mid-move to say a new puzzle exists would be
            // exactly the kind of "taking the board away" the hold-back rule prevents.
            role='status'
            aria-live='polite'
        >
            <span data-viewing-date>
                {pendingDay
                    ? `A new puzzle is ready. You are still on ${viewingDate}.`
                    : `Showing ${viewingDate}.`}
                {clampNote && <span data-clock-clamp>{clampNote}</span>}
            </span>
            {/*
              * Rendered only when it would do something. A clamped clock used to leave a
              * "Play today" here that fetched the day already on screen -- a button whose
              * whole effect was to tell the player nothing had happened.
              */}
            {boardsStore.canGoToToday && (
                <button
                    type='button'
                    data-go-to-today
                    className='rounded-md bg-banner-action px-2 py-1 font-semibold text-on-banner-action'
                    /*
                     * Two routes to the same place. A held-back day is already fetched, so
                     * adopting it is instant and cannot fail; an archive day was chosen
                     * deliberately and nothing newer was loaded, so getting back to today is
                     * a fetch. Both are the player asking, which is why neither is subject
                     * to the hold-back rule.
                     */
                    onClick={() => {
                        if (pendingDay) { boardsStore.adoptPendingDay(); return }
                        if (today) void onGoToDate(today)
                    }}
                >
                    Play today
                </button>
            )}
        </div>
    )
}

export default observer(DayBanner)
