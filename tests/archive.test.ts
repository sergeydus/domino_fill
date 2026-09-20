// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import type { StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import type { DayEntry } from '@/app/stores/corpus'
import type { LoadedDay } from '@/app/stores/corpusSource'
import { KEY_PREFIX, readProgress } from '@/app/stores/progressStorage'

/**
 * A day arrives, and the board on screen is not taken away (spec P1-6/P1-7, row 18d).
 *
 * P1-7 shipped partial for exactly this. `reconcileSessions` retires the sessions for
 * puzzles the new response stops serving, so a rollover at midnight removed the board
 * someone was halfway through. Their *progress* survived — the record is kept for the
 * retention window — but there was nowhere to go and get it, which is why the row-17 note
 * says "closing this needs somewhere to go, which is the archive".
 *
 * So there are two obligations here and they pull against each other:
 *
 *   - a new day must reach the player, or a tab left open overnight serves yesterday
 *     forever, which is the defect `useDayRollover` exists for;
 *   - it must not arrive by removing the board under their hands.
 *
 * The resolution is that a day is *offered*. `receiveDay` decides; `setDay` obeys. Anything
 * the player asks for goes through `setDay`, because the rule protects them from the clock
 * and not from themselves.
 */

let root: RootStore
const store = () => root.boardsStore

/** A 4x4 with one rock: playable, and never completable (fifteen cells is odd). */
const puzzle = (puzzleId: string): StoredPuzzle => {
    const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
    board[0][0] = -1
    return {
        puzzleId,
        board,
        boardHorizontalNumbers: '1,1,1,1',
        boardVerticalNumbers: '1,1,1,1',
    } as StoredPuzzle
}

/** A 2x2 with its right column rocked out: one downward domino solves it. */
const solvable = (puzzleId: string): StoredPuzzle => {
    const board = Array.from({ length: 2 }, () => Array<number | null>(2).fill(null))
    board[0][1] = -1
    board[1][1] = -1
    return {
        puzzleId, board, boardHorizontalNumbers: '1,0', boardVerticalNumbers: '1,0',
    } as StoredPuzzle
}

/** A day whose nine ids carry its date, the way the corpus mints them. */
const day = (date: string, make = puzzle): DayEntry => ({
    date,
    easyBoards: [1, 2, 3].map(n => make(`v1-${date}-easy-${n}`)),
    mediumBoards: [1, 2, 3].map(n => make(`v1-${date}-medium-${n}`)),
    hardBoards: [1, 2, 3].map(n => make(`v1-${date}-hard-${n}`)),
})

/**
 * A day as the loader hands it over: the content, the date that was asked for, and whether
 * it had to be moved to land inside the corpus.
 */
const arriving = (entry: DayEntry, over: Partial<LoadedDay> = {}): LoadedDay => ({
    day: entry, requested: entry.date, clamped: null, ...over,
})

/** Put a domino on the visible board, through the rules. */
const play = () => runInAction(() => { store().currentBoard!.placeToward([1, 0], 'down') })

beforeEach(() => {
    localStorage.clear()
    root = new RootStore()
})

describe('a new day is offered, not imposed', () => {
    it('holds back a day that would take an in-play board away', () => {
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })
        play()
        expect(store().currentIsInPlay).toBe(true)
        const playing = store().currentBoard

        runInAction(() => { store().receiveDay(arriving(day('2026-09-02'))) })

        // Still their board, with their move on it.
        expect(store().currentBoard).toBe(playing)
        expect(store().viewingDate).toBe('2026-09-01')
        expect(store().pendingDay?.date).toBe('2026-09-02')
        // And the clock is not in dispute: it really is the 2nd.
        expect(store().today).toBe('2026-09-02')
        expect(store().isViewingToday).toBe(false)
    })

    it('adopts a day when the board on screen is untouched', () => {
        // Nothing to lose, so nothing to ask about. A prompt here would be noise every
        // morning for the player who finished yesterday or never started it.
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })

        runInAction(() => { store().receiveDay(arriving(day('2026-09-02'))) })

        expect(store().viewingDate).toBe('2026-09-02')
        expect(store().pendingDay).toBeNull()
        expect(store().isViewingToday).toBe(true)
    })

    it('adopts a day when the board on screen is finished', () => {
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01', solvable))) })
        runInAction(() => { store().currentBoard!.placeToward([0, 0], 'down') })
        expect(store().currentBoard!.completed).toBe(true)

        runInAction(() => { store().receiveDay(arriving(day('2026-09-02', solvable))) })

        expect(store().viewingDate).toBe('2026-09-02')
    })

    it('applies a refetch of the day already on screen, even mid-move', () => {
        /*
         * Not a swap, so not subject to the rule -- and it has to be applied, because a
         * rollover whose first attempt failed retries with the same day and the retry must
         * not be refused as if it were news.
         */
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })
        play()
        const board = store().currentBoard!.board.map(row => [...row])

        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })

        expect(store().pendingDay).toBeNull()
        expect(store().viewingDate).toBe('2026-09-01')
        // Reconciled by puzzleId rather than rebuilt, so the move is still there.
        expect(store().currentBoard!.board).toEqual(board)
    })

    it('hands the held-back day over when the player asks for it', () => {
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })
        play()
        runInAction(() => { store().receiveDay(arriving(day('2026-09-02'))) })

        runInAction(() => { store().adoptPendingDay() })

        expect(store().viewingDate).toBe('2026-09-02')
        expect(store().pendingDay).toBeNull()
        expect(store().isViewingToday).toBe(true)
    })

    it('stops announcing a day once the player has arrived at it another way', () => {
        /*
         * Found by mutation-testing. `adoptPendingDay` clears the held day itself, so the
         * only route into `setDay` with one still waiting is the player navigating there --
         * from the archive, or from the banner's own "Play today", which fetches rather
         * than adopting. Without the clear the banner goes on saying "a new puzzle is
         * ready" while they are looking at it.
         */
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })
        play()
        runInAction(() => { store().receiveDay(arriving(day('2026-09-02'))) })
        expect(store().pendingDay).not.toBeNull()

        runInAction(() => { store().setDay(day('2026-09-02')) })

        expect(store().pendingDay).toBeNull()
        expect(store().isViewingToday).toBe(true)
    })

    it('keeps announcing it when the player goes somewhere older instead', () => {
        // The other side of the same line: they have still not seen today.
        runInAction(() => { store().receiveDay(arriving(day('2026-09-05'))) })
        play()
        runInAction(() => { store().receiveDay(arriving(day('2026-09-06'))) })

        runInAction(() => { store().setDay(day('2026-09-02')) })

        expect(store().pendingDay?.date).toBe('2026-09-06')
    })

    it('does nothing when there is no held-back day to adopt', () => {
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })
        runInAction(() => { store().adoptPendingDay() })
        expect(store().viewingDate).toBe('2026-09-01')
    })
})

describe('a date the player chose is theirs until they leave it', () => {
    it('does not walk an archive visitor back to today at midnight', () => {
        /*
         * The same principle as the in-play rule, one step further out. Opening 2026-09-01
         * from the archive is a decision; a poll firing at midnight must not undo it, even
         * though the board is untouched and nothing would be *lost*. What would be lost is
         * the player's place in a thing they went looking for.
         */
        runInAction(() => { store().receiveDay(arriving(day('2026-09-10'))) })
        runInAction(() => { store().setDay(day('2026-09-01')) })
        expect(store().isViewingToday).toBe(false)

        runInAction(() => { store().receiveDay(arriving(day('2026-09-11'))) })

        expect(store().viewingDate).toBe('2026-09-01')
        expect(store().pendingDay?.date).toBe('2026-09-11')
        expect(store().today).toBe('2026-09-11')
    })

    it('follows the calendar again once the player returns to today', () => {
        runInAction(() => { store().receiveDay(arriving(day('2026-09-10'))) })
        runInAction(() => { store().setDay(day('2026-09-01')) })
        runInAction(() => { store().setDay(day('2026-09-10')) })
        expect(store().isViewingToday).toBe(true)

        runInAction(() => { store().receiveDay(arriving(day('2026-09-11'))) })

        expect(store().viewingDate).toBe('2026-09-11')
    })

    it('an explicit move to another date is never refused, mid-move or not', () => {
        runInAction(() => { store().receiveDay(arriving(day('2026-09-10'))) })
        play()

        runInAction(() => { store().setDay(day('2026-09-01')) })

        expect(store().viewingDate).toBe('2026-09-01')
    })
})

describe('the day left behind is still there when you come back', () => {
    it('restores the same puzzleId and definitionHash, with the same board', () => {
        /*
         * The acceptance criterion, stated as one round trip. Leaving a day retires its
         * sessions -- that is deliberate, and it is what stops the Map growing by nine every
         * midnight -- so coming back is a genuine restore from storage, not a session that
         * happened to survive.
         */
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })
        const left = store().currentBoard!
        const puzzleId = left.puzzleId
        const definitionHash = left.definition.definitionHash
        play()
        const board = left.board.map(row => [...row])
        expect(board.flat().some(cell => cell !== null && cell !== -1)).toBe(true)

        // Away, far enough that the session really is gone.
        runInAction(() => { store().setDay(day('2026-09-02')) })
        expect(store().sessions.has(puzzleId)).toBe(false)

        runInAction(() => { store().setDay(day('2026-09-01')) })

        const returned = store().currentBoard!
        expect(returned.puzzleId).toBe(puzzleId)
        expect(returned.definition.definitionHash).toBe(definitionHash)
        expect(returned.board).toEqual(board)
    })

    it('the stored record names the same puzzle the board was restored into', () => {
        // Identity and invalidation are separate fields, and both have to line up: the
        // record is found by `puzzleId` and accepted only if its `definitionHash` matches.
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })
        const puzzleId = store().currentBoard!.puzzleId
        play()

        const record = readProgress(puzzleId)
        expect(record).not.toBeNull()
        expect(localStorage.getItem(`${KEY_PREFIX}${puzzleId}`)).not.toBeNull()
        expect(record!.definitionHash).toBe(store().currentBoard!.definition.definitionHash)

        runInAction(() => { store().setDay(day('2026-09-02')) })
        runInAction(() => { store().setDay(day('2026-09-01')) })

        expect(store().currentBoard!.definition.definitionHash).toBe(record!.definitionHash)
    })

    it('a held-back day, once adopted, still leaves yesterday reachable', () => {
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })
        const yesterday = store().currentBoard!.puzzleId
        play()
        const board = store().currentBoard!.board.map(row => [...row])

        runInAction(() => { store().receiveDay(arriving(day('2026-09-02'))) })
        runInAction(() => { store().adoptPendingDay() })
        expect(store().sessions.has(yesterday)).toBe(false)

        // Through the archive, which is the "somewhere to go" row 17 was waiting for.
        runInAction(() => { store().setDay(day('2026-09-01')) })
        expect(store().currentBoard!.board).toEqual(board)
    })
})

describe('a clock outside the published range', () => {
    /*
     * `loadDay` clamps rather than refusing, because a device clock can be years wrong and a
     * playable board beats an error page. The clamp then has to be *carried*: the first
     * version of this row kept only `loaded.day` and threw `requested`/`clamped` away, which
     * broke both directions.
     *
     * After the corpus, `today` stayed at the device's date, so "am I on today" was false
     * forever -- the banner offered a "Play today" whose entire effect was to refetch the
     * board already on screen -- and the archive would page forward into months holding
     * nothing. Before the corpus, every published day was "in the future", so the archive
     * offered no days at all, including the one being played at that moment.
     */
    const clamped = (entry: DayEntry, requested: string, how: 'before' | 'after') =>
        arriving(entry, { requested, clamped: how })

    it('treats the served day as today when the clock is past the corpus', () => {
        runInAction(() => {
            store().receiveDay(clamped(day('2036-08-31'), '2099-01-01', 'after'))
        })

        // Effective, not literal: everything downstream is bounded by content that exists.
        expect(store().today).toBe('2036-08-31')
        expect(store().isViewingToday).toBe(true)
        // And the device's own answer is kept, because the screen has to say why.
        expect(store().deviceToday).toBe('2099-01-01')
        expect(store().clockClamp).toBe('after')
    })

    it('offers no action when there is nowhere else to go', () => {
        runInAction(() => {
            store().receiveDay(clamped(day('2036-08-31'), '2099-01-01', 'after'))
        })
        // The no-op button. It refetched the day already on screen and reported success.
        expect(store().canGoToToday).toBe(false)
    })

    it('treats the served day as today when the clock is before the corpus', () => {
        runInAction(() => {
            store().receiveDay(clamped(day('2026-09-01'), '2019-04-01', 'before'))
        })

        expect(store().today).toBe('2026-09-01')
        expect(store().clockClamp).toBe('before')
        // The archive bounds itself by `today`; with the device's date it saw nothing at
        // all, since every published day is later than 2019.
        expect(store().today! >= '2026-09-01').toBe(true)
    })

    it('still offers a way back once the player has gone elsewhere', () => {
        runInAction(() => {
            store().receiveDay(clamped(day('2036-08-31'), '2099-01-01', 'after'))
        })
        runInAction(() => { store().setDay(day('2026-09-01')) })

        expect(store().canGoToToday).toBe(true)
        expect(store().today).toBe('2036-08-31')
    })

    it('reports no clamp for an ordinary clock', () => {
        runInAction(() => { store().receiveDay(arriving(day('2026-09-01'))) })
        expect(store().clockClamp).toBeNull()
        expect(store().deviceToday).toBe('2026-09-01')
        expect(store().canGoToToday).toBe(false)
    })
})

describe('the archive panel is store state, so the page can be tested without it', () => {
    it('opens and closes', () => {
        expect(store().archiveOpen).toBe(false)
        runInAction(() => { store().setArchiveOpen(true) })
        expect(store().archiveOpen).toBe(true)
        runInAction(() => { store().setArchiveOpen(false) })
        expect(store().archiveOpen).toBe(false)
    })

    it('reports no viewed day before anything has loaded', () => {
        expect(store().viewingDate).toBeNull()
        expect(store().isViewingToday).toBe(false)
    })
})
