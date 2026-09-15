// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import type { BoardsResponse } from '@/app/dominoFill/Boards'
import type { StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import { STORAGE_KEY, SCHEMA_VERSION, dayKey, parseDocument } from '@/app/stores/progressStorage'

/**
 * Progress survives a reload (spec P1-7), and the store is what makes it so.
 *
 * `tests/progressStorage.test.ts` pins the rules in isolation; this pins the wiring, where
 * the dangerous mistakes are of two kinds.
 *
 * **Destroying the save while trying to write it.** A `persist` that replaced the document
 * instead of merging into it would delete every record for a puzzle today does not serve,
 * and the data file cycles, so that is most of them.
 *
 * **Trusting the record.** A restore that does not check what it read against the definition
 * can put the board into a state the rules cannot produce -- a domino where a rock now is.
 *
 * An earlier version of this comment also claimed hydrate-then-persist ordering was
 * load-bearing. Mutation-testing disproved it: reactions do not fire on creation, and
 * `setBoards` is one MobX action, so the effect cannot observe a half-hydrated store. The
 * merge above is what actually protects the data.
 */

let root: RootStore

/** Four 4x4 puzzles per difficulty slot, ids stable so a "reload" finds them again. */
const puzzle = (puzzleId: string, rock: [number, number] = [0, 0]): StoredPuzzle => {
    const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
    board[rock[0]][rock[1]] = -1
    return {
        puzzleId,
        board,
        boardHorizontalNumbers: '1,1,1,1',
        boardVerticalNumbers: '1,1,1,1',
    } as StoredPuzzle
}

const response = (suffix = ''): BoardsResponse => ({
    easyBoards: [puzzle(`easy-1${suffix}`), puzzle(`easy-2${suffix}`), puzzle(`easy-3${suffix}`)],
    mediumBoards: [puzzle(`med-1${suffix}`), puzzle(`med-2${suffix}`), puzzle(`med-3${suffix}`)],
    hardBoards: [puzzle(`hard-1${suffix}`), puzzle(`hard-2${suffix}`), puzzle(`hard-3${suffix}`)],
})

const stored = () => parseDocument(window.localStorage.getItem(STORAGE_KEY))

/** A second store over the same storage: this is what a reload actually is. */
const reload = (boards: BoardsResponse = response()) => {
    const next = new RootStore()
    runInAction(() => { next.boardsStore.setBoards(boards) })
    return next.boardsStore
}

beforeEach(() => {
    window.localStorage.clear()
    root = new RootStore()
})

afterEach(() => {
    window.localStorage.clear()
    vi.useRealTimers()
})

describe('a board in progress comes back', () => {
    it('saves a move and restores it into a new store', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        const before = root.boardsStore.currentBoard!.board.map(row => [...row])
        expect(reload().currentBoard!.board).toEqual(before)
    })

    it('saves under the puzzle id, so each board keeps its own progress', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })
        runInAction(() => { root.boardsStore.setLevel(2) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([2, 2], 'right') })

        const document = stored()
        expect(document.puzzles['easy-1'].board[1][1]).toBe(1)
        expect(document.puzzles['easy-2'].board[2][2]).toBe(0)
        // ...and neither leaked into the other.
        expect(document.puzzles['easy-1'].board[2][2]).toBeNull()
    })

    it('restores the completion flag, not merely the pieces', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        const session = root.boardsStore.currentBoard!
        runInAction(() => { session.setCompleted(true) })

        expect(stored().puzzles['easy-1'].completed).toBe(true)
    })

    it('does not restore the undo stack, and says so by clearing it', () => {
        /*
         * A `Move` describes cells against the board that produced it. Carrying a stack
         * across a reload would let Undo write dominoes back onto a board that never had
         * them, so the position is restored and the history is not.
         */
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        const restored = reload().currentBoard!
        expect(restored.board[1][1]).toBe(1)
        expect(restored.moves).toEqual([])
        expect(restored.undo()).toBe(false)
    })

    it('an untouched puzzle is still saved, so its emptiness is a fact and not an absence', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        expect(Object.keys(stored().puzzles).sort()).toEqual([
            'easy-1', 'easy-2', 'easy-3', 'hard-1', 'hard-2', 'hard-3', 'med-1', 'med-2', 'med-3',
        ])
    })
})

describe('restoring a session, directly', () => {
    /*
     * `restore` is exercised through the store above, but only ever on a session built
     * moments earlier -- so anything it clears was already empty, and mutation-testing showed
     * exactly that: deleting the undo-stack clear broke nothing. These call the method on a
     * session that has actually been played, which is the only way its contract is visible.
     */
    const played = () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        const session = root.boardsStore.currentBoard!
        runInAction(() => { session.placeToward([1, 1], 'down') })
        return session
    }

    it('drops an undo stack that describes a board being replaced', () => {
        // A `Move` records what was underneath the cells it wrote. Kept across a restore,
        // Undo would write dominoes back onto a board that never had them.
        const session = played()
        expect(session.moves.length).toBe(1)

        runInAction(() => { session.restore({ board: session.definition.initialBoard.map(row => [...row]), completed: false }) })

        expect(session.moves).toEqual([])
        expect(runInAction(() => session.undo())).toBe(false)
    })

    it('hands out a snapshot that stops tracking the board', () => {
        /*
         * Aliasing matters on the way *out*, not on the way in. Probed: assigning a plain
         * array to a deep-observable field makes MobX copy it, so `restore` cannot alias
         * whatever it was handed however it is written -- an earlier test here asserting that
         * could not fail, and was removed rather than left looking like cover.
         *
         * `snapshot` is the real hazard, and mutation-testing agrees: return the live board
         * and eight tests fail. The saved document would then track the board it was meant to
         * be a record of, so every comparison against it would say "unchanged" and the save
         * would stop happening.
         */
        const session = played()
        const taken = session.snapshot

        runInAction(() => { session.placeToward([2, 2], 'right') })

        expect(taken.board[2][2], 'the snapshot followed the board').toBeNull()
    })

    it('clears the gesture, so no highlight survives under a finger that has gone', () => {
        const session = played()
        runInAction(() => { session.pointerDown([2, 2]) })
        runInAction(() => { session.setHover([2, 2]) })

        runInAction(() => { session.restore({ board: session.definition.initialBoard.map(row => [...row]), completed: false }) })

        expect(session.gesture).toBeNull()
        expect(session.hover).toBeNull()
        expect(session.focusedCell).toBeNull()
    })
})

describe('loading never destroys what is saved', () => {
    it('touches storage not at all until boards arrive', () => {
        /*
         * Constructing the store is what happens during SSR and on every mount before the
         * fetch resolves, so it must not read or write. Asserted with spies rather than by
         * checking the stored value: "nothing was written" is also true of a store that read
         * storage and then decided against writing, and reading during render is its own
         * defect (see app/hooks/useLocalStorage.ts).
         */
        // On the instance, not on `Storage.prototype`. Found by mutation: the test stub in
        // tests/setup.ts is a plain object with its own methods, so a prototype spy observes
        // nothing and every assertion against it passes without running.
        const getItem = vi.spyOn(window.localStorage, 'getItem')
        const setItem = vi.spyOn(window.localStorage, 'setItem')

        new RootStore()

        expect(getItem).not.toHaveBeenCalled()
        expect(setItem).not.toHaveBeenCalled()
        getItem.mockRestore()
        setItem.mockRestore()
    })

    it('a reload does not blank the previous save before restoring it', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        reload()
        expect(stored().puzzles['easy-1'].board[1][1]).toBe(1)
    })

    it('keeps records for puzzles this day does not serve', () => {
        /*
         * The data file cycles, so today's nine are not all the puzzles that exist. A save
         * that replaced the document instead of merging into it would delete a half-finished
         * board every time a different day was served.
         */
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        const tomorrow = reload(response('-b'))
        runInAction(() => { tomorrow.currentBoard!.placeToward([1, 1], 'down') })

        expect(stored().puzzles['easy-1'], 'yesterday\'s save').toBeDefined()
        expect(stored().puzzles['easy-1-b'], 'today\'s save').toBeDefined()
    })
})

describe('a saved board is not trusted just because it is saved', () => {
    it('is discarded when the puzzle content changed under a reused id', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        // Same ids, different rocks: a regenerated data file, and a saved board that could
        // have a domino where a rock now is.
        const changed: BoardsResponse = {
            easyBoards: [puzzle('easy-1', [3, 3]), puzzle('easy-2'), puzzle('easy-3')],
            mediumBoards: response().mediumBoards,
            hardBoards: response().hardBoards,
        }
        expect(reload(changed).currentBoard!.board[1][1]).toBeNull()
    })

    it('is discarded when only the targets changed, which the rocks cannot show', () => {
        /*
         * Found by mutation: deleting the `definitionHash` check left every test green,
         * because the fixture for "content changed" also moved a rock, and the rock
         * comparison caught it on its own. Targets are content too -- same grid, same rocks,
         * different puzzle -- and nothing but the hash can see that.
         */
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        const retargeted: BoardsResponse = {
            ...response(),
            easyBoards: [
                { ...puzzle('easy-1'), boardHorizontalNumbers: '2,2,2,2' } as StoredPuzzle,
                puzzle('easy-2'),
                puzzle('easy-3'),
            ],
        }
        expect(reload(retargeted).sessions.get('easy-1')!.board[1][1]).toBeNull()
    })

    it('survives corrupt storage by starting that puzzle fresh', () => {
        window.localStorage.setItem(STORAGE_KEY, '{not json at all')
        const store = reload()
        expect(store.currentBoard).not.toBeNull()
        expect(store.currentBoard!.board[1][1]).toBeNull()
    })

    it('survives a document from a version this build does not know', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: SCHEMA_VERSION + 99,
            puzzles: { 'easy-1': { definitionHash: 'x', board: [[1]], completed: true, savedOn: '2026-09-15' } },
        }))
        expect(reload().currentBoard!.completed).toBe(false)
    })

    it('keeps playing when storage refuses to be written', () => {
        // Safari private mode, or a full quota. Losing the save is not a reason to lose the
        // move.
        const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError')
        })

        runInAction(() => { root.boardsStore.setBoards(response()) })
        expect(() => runInAction(() => {
            root.boardsStore.currentBoard!.placeToward([1, 1], 'down')
        })).not.toThrow()
        expect(root.boardsStore.currentBoard!.board[1][1]).toBe(1)

        setItem.mockRestore()
    })

    it('keeps playing when storage refuses to be read', () => {
        const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })

        expect(() => reload()).not.toThrow()
        getItem.mockRestore()
    })
})

describe('the player lands on the first unsolved puzzle (D10-i)', () => {
    it('starts at level 1 when nothing has been solved', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        expect(root.boardsStore.level).toBe(1)
    })

    it('skips past puzzles solved in an earlier session', () => {
        // The remaining half of D10-i, which could not be done before there was persisted
        // completion state to read.
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.setCompleted(true) })

        expect(reload().level).toBe(2)
    })

    it('stays on the last level when the whole difficulty is finished', () => {
        // Rather than sending the player back to a board they already solved.
        runInAction(() => { root.boardsStore.setBoards(response()) })
        for (const level of [1, 2, 3] as const) {
            runInAction(() => { root.boardsStore.setLevel(level) })
            runInAction(() => { root.boardsStore.currentBoard!.setCompleted(true) })
        }
        expect(reload().level).toBe(3)
    })

    it('does not move a player who is mid-board when the same day is refetched', () => {
        /*
         * A rollover check that fires on a day that has not actually changed must be inert.
         * Re-selecting here would snatch the board away from someone playing level 3 because
         * level 1 is unfinished.
         */
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.setLevel(3) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        runInAction(() => { root.boardsStore.setBoards(response()) })

        expect(root.boardsStore.level).toBe(3)
        expect(root.boardsStore.currentBoard!.board[1][1]).toBe(1)
    })

    it('re-selects when a rollover serves different puzzles', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.setLevel(3) })

        runInAction(() => { root.boardsStore.setBoards(response('-b')) })

        expect(root.boardsStore.level).toBe(1)
        expect(root.boardsStore.currentBoard!.puzzleId).toBe('easy-1-b')
    })
})

describe('the save is stamped with the local day', () => {
    it('records today, so retention has something to measure', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        expect(stored().puzzles['easy-1'].savedOn).toBe(dayKey(new Date()))
    })

    it('leaves the stamp alone on a puzzle that did not change', () => {
        /*
         * `savedOn` means "when this puzzle last moved", not "when the app was last open".
         * Restamping every record on every write would make retention unreachable: someone
         * who opens the game daily would keep every puzzle ever served alive forever, which
         * is the unbounded growth the window exists to stop.
         */
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        // Age level 2's record by hand, then move on level 1 only.
        const aged = stored()
        aged.puzzles['easy-2'].savedOn = '2026-09-01'
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(aged))

        const store = reload()
        runInAction(() => { store.currentBoard!.placeToward([2, 2], 'right') })

        expect(stored().puzzles['easy-2'].savedOn, 'untouched puzzle').toBe('2026-09-01')
        expect(stored().puzzles['easy-1'].savedOn, 'the one that moved').toBe(dayKey(new Date()))
    })

    it('drops records older than the retention window when the store loads', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: SCHEMA_VERSION,
            puzzles: {
                ancient: {
                    definitionHash: 'x', board: [[null]], completed: true, savedOn: '2000-01-01',
                },
            },
        }))

        reload()
        expect(stored().puzzles.ancient).toBeUndefined()
    })
})
