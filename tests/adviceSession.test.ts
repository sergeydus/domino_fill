// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import type { StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import type { DayEntry } from '@/app/stores/corpus'
import { readAllProgress } from '@/app/stores/progressStorage'

/**
 * Asking does not change the answer (spec P1-5, row 18e).
 *
 * The advice rules are pinned in `tests/advice.test.ts`; this pins the wiring, where the
 * dangerous mistakes are. A feature that inspects a position is one refactor away from
 * being a feature that *edits* one, and three things would break quietly if it did:
 *
 *   - the board itself, which is the player's work;
 *   - the undo stack, which would then describe moves against a board that never existed
 *     -- the same failure `reset` clears the stack to avoid;
 *   - persistence, which saves on every change to the snapshot, so a hint that touched the
 *     board would write a save the player did not make and restamp its retention clock.
 *
 * The strongest version of each is asserted here: not "the board looks right afterwards"
 * but "the board is byte-identical, and storage was not written at all".
 */

let root: RootStore
const session = () => root.boardsStore.currentBoard!

/** A 4x4 with one rock: playable, and impossible to finish (fifteen cells is odd). */
const puzzle = (puzzleId: string): StoredPuzzle => {
    const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
    board[0][0] = -1
    return {
        puzzleId, board, boardHorizontalNumbers: '1,1,1,1', boardVerticalNumbers: '1,1,1,1',
    } as StoredPuzzle
}

/** A 2x2 with no rocks whose only completion is two uprights. */
const pair = (puzzleId: string): StoredPuzzle => ({
    puzzleId,
    board: [[null, null], [null, null]] as (number | null)[][],
    boardHorizontalNumbers: '1,1',
    boardVerticalNumbers: '2,0',
} as StoredPuzzle)

const day = (make: (id: string) => StoredPuzzle): DayEntry => ({
    date: '2026-09-01',
    easyBoards: [1, 2, 3].map(n => make(`v1-2026-09-01-easy-${n}`)),
    mediumBoards: [1, 2, 3].map(n => puzzle(`v1-2026-09-01-medium-${n}`)),
    hardBoards: [1, 2, 3].map(n => puzzle(`v1-2026-09-01-hard-${n}`)),
})

const snapshot = () => ({
    board: JSON.stringify(session().board),
    moves: JSON.stringify(session().moves),
    completed: session().completed,
    canUndo: session().canUndo,
    storage: JSON.stringify(readAllProgress()),
})

beforeEach(() => {
    localStorage.clear()
    root = new RootStore()
    runInAction(() => { root.boardsStore.setDay(day(pair)) })
})

describe('advice changes nothing', () => {
    it('leaves the board, the undo stack and storage exactly as they were', () => {
        runInAction(() => { session().placeToward([0, 0], 'down') })
        const before = snapshot()

        runInAction(() => { session().check() })
        runInAction(() => { session().hint() })

        expect(snapshot()).toEqual(before)
    })

    it('leaves an untouched board untouched, and writes no save', () => {
        /*
         * The persistence half stated on its own, because it is the one that would go
         * unnoticed: a save is a write to the puzzle's key *and* a fresh `savedAt`, so a
         * hint that nudged the snapshot would quietly reset the retention clock on a board
         * the player never moved a piece on.
         */
        expect(readAllProgress()).toEqual({})

        runInAction(() => { session().check() })
        runInAction(() => { session().hint() })

        expect(readAllProgress()).toEqual({})
        expect(session().canUndo).toBe(false)
    })

    it('reveals a cell without filling it', () => {
        runInAction(() => { session().hint() })

        const cell = session().hintCell
        expect(cell).not.toBeNull()
        // Pointing at an empty square: a hint that had placed the piece would be pointing
        // at its own work.
        expect(session().board[cell![0]][cell![1]]).toBeNull()
        expect(session().advice).toMatchObject({ kind: 'hint' })
    })

    it('does not make a finished board finishable again, or the reverse', () => {
        runInAction(() => { session().placeToward([0, 0], 'down') })
        runInAction(() => { session().placeToward([0, 1], 'down') })
        expect(session().completedByRules).toBe(true)

        runInAction(() => { session().check() })

        expect(session().completedByRules).toBe(true)
        expect(session().advice).toEqual({ kind: 'solved' })
    })
})

describe('advice goes stale exactly when the position changes', () => {
    it('is cleared by a placement', () => {
        runInAction(() => { session().hint() })
        expect(session().hintCell).not.toBeNull()

        runInAction(() => { session().placeToward([0, 0], 'down') })

        // Otherwise the marker sits on a square the player has just filled.
        expect(session().advice).toBeNull()
        expect(session().hintCell).toBeNull()
    })

    it('is cleared by a removal', () => {
        runInAction(() => { session().placeToward([0, 0], 'down') })
        runInAction(() => { session().check() })
        expect(session().advice).not.toBeNull()

        runInAction(() => { session().removePiece(0, 0) })

        expect(session().advice).toBeNull()
    })

    it('is cleared by undo', () => {
        runInAction(() => { session().placeToward([0, 0], 'down') })
        runInAction(() => { session().check() })

        runInAction(() => { session().undo() })

        expect(session().advice).toBeNull()
    })

    it('is cleared by reset', () => {
        runInAction(() => { session().hint() })
        runInAction(() => { session().reset() })
        expect(session().advice).toBeNull()
    })

    it('survives a refused move, because the position did not change', () => {
        /*
         * A rejected placement shakes the board and changes nothing else. Clearing the
         * hint there would take the answer away at the exact moment the player is jabbing
         * at the board wondering what is wrong -- which is when they most want it.
         */
        runInAction(() => { session().hint() })
        const cell = session().hintCell

        // Into the wall: there is no row below the last one.
        runInAction(() => { session().placeToward([1, 0], 'down') })

        expect(session().lastOutcome).toBe('none')
        expect(session().hintCell).toEqual(cell)
    })
})

describe('asking twice is asking twice', () => {
    it('counts every answer, so an unchanged one is still announced', () => {
        /*
         * A live region whose content has not changed announces nothing. Pressing Check
         * again on an unchanged board is the case where the player is least sure anything
         * happened, so the view keys on the counter rather than on the text.
         */
        runInAction(() => { session().check() })
        const first = session().adviceTick
        runInAction(() => { session().check() })

        expect(session().adviceTick).toBe(first + 1)
        expect(session().advice).toEqual({ kind: 'on-track' })
    })

    it('gives the same cell for the same board', () => {
        runInAction(() => { session().hint() })
        const first = session().hintCell
        runInAction(() => { session().hint() })
        expect(session().hintCell).toEqual(first)
    })
})

describe('advice is per puzzle, not per screen', () => {
    it('does not follow the player to another board', () => {
        // `advice` lives on the session, so switching level cannot show one puzzle's
        // answer over another puzzle's board.
        runInAction(() => { session().hint() })
        const hinted = session()

        runInAction(() => { root.boardsStore.setLevel(2) })

        expect(session()).not.toBe(hinted)
        expect(session().advice).toBeNull()
        expect(hinted.advice).not.toBeNull()
    })

    it('is dropped when a saved board is restored over it', () => {
        // `restore` installs a position this advice was never about.
        runInAction(() => { session().check() })
        runInAction(() => {
            session().restore({ board: [[1, null], [0, null]], completed: false })
        })
        expect(session().advice).toBeNull()
    })
})
