// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import type { BoardsResponse } from '@/app/dominoFill/Boards'
import type { StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import {
    KEY_PREFIX, LEGACY_KEY, RETENTION_DAYS, readAllProgress, readProgress,
} from '@/app/stores/progressStorage'

/**
 * Progress survives a reload (spec P1-7), and the store is what makes it so.
 *
 * `tests/progressStorage.test.ts` pins the rules in isolation; this pins the wiring, where
 * the dangerous mistakes are of two kinds.
 *
 * **Destroying the save while trying to write it.** Every version of this feature has had a
 * variant of the same bug: a save that rewrote more than it changed, and a migration that
 * deleted the old copy before the new one had landed. Both are cases of doing the destructive
 * half of an operation first.
 *
 * **Trusting the record.** A restore that does not check what it read against the definition
 * can put the board into a state the rules cannot produce -- a domino where a rock now is.
 *
 * An earlier version of this comment claimed hydrate-then-persist ordering was load-bearing.
 * Mutation-testing disproved it: reactions do not fire on creation, and `setBoards` is one
 * MobX action, so the effect cannot observe a half-hydrated store. What protects the data is
 * that a save names only its own puzzle's key, and that the migration deletes nothing until
 * everything it held is safely across.
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

/**
 * A 2x2 with its right-hand column rocked out: one downward domino solves it.
 *
 * Needed because a completed record is now *checked* rather than believed -- storage cannot
 * hand back `completed: true` over a board that is not actually finished. The 4x4 fixture
 * above can never be completed at all: one rock leaves fifteen cells, and fifteen is odd.
 */
const solvable = (puzzleId: string): StoredPuzzle => {
    const board = Array.from({ length: 2 }, () => Array<number | null>(2).fill(null))
    board[0][1] = -1
    board[1][1] = -1
    return {
        puzzleId,
        board,
        boardHorizontalNumbers: '1,0',
        boardVerticalNumbers: '1,0',
    } as StoredPuzzle
}

/** Three solvable puzzles in the easy slot, for the tests about finishing them. */
const solvableResponse = (): BoardsResponse => ({
    easyBoards: [solvable('easy-1'), solvable('easy-2'), solvable('easy-3')],
    mediumBoards: [puzzle('med-1'), puzzle('med-2'), puzzle('med-3')],
    hardBoards: [puzzle('hard-1'), puzzle('hard-2'), puzzle('hard-3')],
})

/** Win the 2x2 for real, through the placement rules, rather than setting the flag. */
const winIt = (store: RootStore['boardsStore']) => {
    runInAction(() => { store.currentBoard!.placeToward([0, 0], 'down') })
    expect(store.currentBoard!.completed, 'the fixture really is solvable').toBe(true)
}

const response = (suffix = ''): BoardsResponse => ({
    easyBoards: [puzzle(`easy-1${suffix}`), puzzle(`easy-2${suffix}`), puzzle(`easy-3${suffix}`)],
    mediumBoards: [puzzle(`med-1${suffix}`), puzzle(`med-2${suffix}`), puzzle(`med-3${suffix}`)],
    hardBoards: [puzzle(`hard-1${suffix}`), puzzle(`hard-2${suffix}`), puzzle(`hard-3${suffix}`)],
})

const stored = () => ({ puzzles: readAllProgress() })

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
        // Won through the rules, not flagged: a record claiming completion over an unfinished
        // board is refused on the way back in, so a test that fabricated one would be
        // asserting something that can no longer be restored.
        runInAction(() => { root.boardsStore.setBoards(solvableResponse()) })
        winIt(root.boardsStore)

        expect(stored().puzzles['easy-1'].completed).toBe(true)
        expect(reload(solvableResponse()).sessions.get('easy-1')!.completed).toBe(true)
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

    it('writes only the puzzles the player has actually touched', () => {
        /*
         * Not "every puzzle served". Eight empty boards carry no information, and writing them
         * is what made two tabs destructive: a tab that saves all nine also saves its stale
         * copy of the one the *other* tab is playing.
         */
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        expect(Object.keys(stored().puzzles)).toEqual(['easy-1'])
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
        window.localStorage.setItem(`${KEY_PREFIX}easy-1`, '{not json at all')
        const store = reload()
        expect(store.currentBoard).not.toBeNull()
        expect(store.currentBoard!.board[1][1]).toBeNull()
    })

    it('ignores a record left by a version with a different shape', () => {
        // The key carries the schema version, so a v1 document is not even looked at here --
        // `migrateLegacy` owns that. Anything under this version's prefix that does not parse
        // as a v2 record is simply not progress.
        window.localStorage.setItem(`${KEY_PREFIX}easy-1`, JSON.stringify({
            definitionHash: 'x', board: [[1]], completed: true, savedOn: '2026-09-15',
        }))
        expect(reload().currentBoard!.completed).toBe(false)
        expect(reload().currentBoard!.board[1][1]).toBeNull()
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
        runInAction(() => { root.boardsStore.setBoards(solvableResponse()) })
        winIt(root.boardsStore)

        expect(reload(solvableResponse()).level).toBe(2)
    })

    it('stays on the last level when the whole difficulty is finished', () => {
        // Rather than sending the player back to a board they already solved.
        runInAction(() => { root.boardsStore.setBoards(solvableResponse()) })
        for (const level of [1, 2, 3] as const) {
            runInAction(() => { root.boardsStore.setLevel(level) })
            winIt(root.boardsStore)
        }
        expect(reload(solvableResponse()).level).toBe(3)
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

describe('a long-lived tab does not accumulate', () => {
    /*
     * Both of these only appear over days, which is exactly how long a tab on a phone stays
     * open. A session that outlives its puzzle used to be serialized anyway, so a record that
     * retention had just deleted came back on the next move with today's stamp -- it could
     * never age out. And nothing removed those sessions, so the Map grew by nine per day,
     * without bound once P1-6 mints a unique id per day.
     */
    const rollTo = (store: RootStore['boardsStore'], day: number) =>
        runInAction(() => { store.setBoards(response(`-d${day}`)) })

    it('does not resurrect a record that retention has dropped', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })
        expect(stored().puzzles['easy-1']).toBeDefined()

        // Age that record out, then serve a different day and play on it.
        const aged = readProgress('easy-1')!
        window.localStorage.setItem(`${KEY_PREFIX}easy-1`, JSON.stringify({
            ...aged, savedAt: Date.now() - (RETENTION_DAYS + 1) * 86_400_000,
        }))

        rollTo(root.boardsStore, 1)
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        expect(stored().puzzles['easy-1'], 'came back from the dead').toBeUndefined()
    })

    it('holds only the puzzles it is serving, across many rollovers', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })

        for (let day = 1; day <= 20; day++) {
            rollTo(root.boardsStore, day)
            runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })
        }

        // Nine puzzles are served at a time, whatever the calendar has done.
        expect(root.boardsStore.sessions.size).toBe(9)
        expect([...root.boardsStore.sessions.keys()].every(id => id.endsWith('-d20'))).toBe(true)
    })

    it('never serializes a session whose puzzle is not being served', () => {
        /*
         * A second line of defence, tested directly rather than through the first. Dropping
         * stale sessions is what normally keeps them out of the snapshot, so mutating this
         * guard alone changed nothing -- which is not a reason to leave it unexamined, since
         * it is what stops a session reaching the document at all.
         */
        runInAction(() => { root.boardsStore.setBoards(response()) })
        const orphan = root.boardsStore.sessions.get('easy-1')!
        runInAction(() => { root.boardsStore.sessions.set('from-another-day', orphan) })

        expect(Object.keys(root.boardsStore.progressSnapshot)).not.toContain('from-another-day')
    })

    it('keeps the saved records of days it is no longer serving', () => {
        // Bounding the *sessions* must not bound the saves: those are the player's, and
        // retention is the only thing allowed to drop one.
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        rollTo(root.boardsStore, 1)
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        expect(root.boardsStore.sessions.has('easy-1')).toBe(false)
        expect(stored().puzzles['easy-1'], 'the save outlives the session').toBeDefined()
    })
})

describe('two tabs', () => {
    /*
     * Ordinary, not exotic: a phone restoring a session and a desktop with the game pinned.
     * Each store used to merge into the document *it* loaded, so the second to save wrote back
     * a copy from before the first tab's work and quietly undid it.
     *
     * What this fixes and what it does not is worth being exact about. Re-reading storage on
     * every write means a tab never clobbers another tab's work on a *different* puzzle. Two
     * tabs playing the *same* puzzle still resolve last-write-wins, which no amount of merging
     * can decide -- see the multi-tab note in SPEC.
     */
    it('does not undo what the other tab did to a different puzzle', () => {
        const tabA = root.boardsStore
        runInAction(() => { tabA.setBoards(response()) })
        const tabB = reload()   // a second store over the same storage

        runInAction(() => { tabA.currentBoard!.placeToward([1, 1], 'down') })

        runInAction(() => { tabB.setLevel(2) })
        runInAction(() => { tabB.currentBoard!.placeToward([2, 2], 'right') })

        expect(stored().puzzles['easy-1'].board[1][1], 'tab A move').toBe(1)
        expect(stored().puzzles['easy-2'].board[2][2], 'tab B move').toBe(0)
    })

    it('a tab loaded before the other tab saved still does not lose it', () => {
        // The stale-snapshot case: B was constructed when easy-1 was empty.
        const tabA = root.boardsStore
        runInAction(() => { tabA.setBoards(response()) })
        const tabB = reload()

        runInAction(() => { tabA.currentBoard!.placeToward([1, 1], 'down') })
        runInAction(() => { tabB.setLevel(3) })
        runInAction(() => { tabB.currentBoard!.placeToward([1, 1], 'down') })

        expect(stored().puzzles['easy-1'].board[1][1]).toBe(1)
    })
})

describe('two tabs writing at the same time', () => {
    /*
     * The case the previous tests could not reach. They interleaved *stores* but not the
     * read-modify-write inside a single save, so they showed only that a stale snapshot was
     * not written back. With one shared document the real hazard is finer: both tabs read the
     * same document, both write it whole, and the second erases the first -- on a puzzle
     * neither of them was editing.
     *
     * Per-puzzle keys remove that by construction, and the way to demonstrate it is to force
     * the interleaving rather than to hope for it.
     */
    it('an interleaved write does not erase what the other tab saved', () => {
        const tabA = root.boardsStore
        runInAction(() => { tabA.setBoards(response()) })
        const tabB = reload()

        // Both tabs observe storage as it is now...
        const seenByA = readAllProgress()
        const seenByB = readAllProgress()
        expect(seenByA).toEqual(seenByB)

        // ...then both save, A first.
        runInAction(() => { tabA.currentBoard!.placeToward([1, 1], 'down') })
        runInAction(() => { tabB.setLevel(2) })
        runInAction(() => { tabB.currentBoard!.placeToward([2, 2], 'right') })

        expect(readProgress('easy-1')!.board[1][1], 'tab A survived tab B').toBe(1)
        expect(readProgress('easy-2')!.board[2][2], 'tab B saved its own').toBe(0)
    })

    it('a tab writes only its own puzzle key, touching no other', () => {
        // The structural guarantee behind the test above: if a save never names another
        // puzzle's key, no interleaving can lose it.
        runInAction(() => { root.boardsStore.setBoards(response()) })

        const written: string[] = []
        const setItem = vi.spyOn(window.localStorage, 'setItem')
            .mockImplementation((key: string) => { written.push(key) })

        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        expect(written).toEqual([`${KEY_PREFIX}easy-1`])
        setItem.mockRestore()
    })
})

describe('a v1 document is carried forward', () => {
    /*
     * v1 kept one document stamped with a local day string. Both are what v2 replaces, so the
     * migration is a real one rather than a discard: a player mid-puzzle when they picked up
     * the new build should not lose the board.
     */
    const legacyDocument = (savedOn: string) => JSON.stringify({
        version: 1,
        puzzles: {
            'easy-1': {
                definitionHash: root.boardsStore.sessions.get('easy-1')?.definition.definitionHash
                    ?? '',
                board: (() => {
                    const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
                    board[0][0] = -1
                    board[1][1] = 1
                    board[2][1] = 0
                    return board
                })(),
                completed: false,
                savedOn,
            },
        },
    })

    /** The definition hash of a served puzzle, which a legacy record has to match. */
    const definitionHashFor = (puzzleId: string) => {
        const probe = new RootStore()
        runInAction(() => { probe.boardsStore.setBoards(response()) })
        const hash = probe.boardsStore.sessions.get(puzzleId)!.definition.definitionHash
        window.localStorage.clear()
        return hash
    }

    /** A v1 document holding two puzzles, so a migration can fail halfway. */
    const twoPuzzleDocument = () => {
        const hash = definitionHashFor('easy-1')
        const played = () => {
            const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
            board[0][0] = -1
            board[1][1] = 1
            board[2][1] = 0
            return board
        }
        window.localStorage.setItem(LEGACY_KEY, JSON.stringify({
            version: 1,
            puzzles: {
                'easy-1': { definitionHash: hash, board: played(), completed: false, savedOn: '2026-09-15' },
                'easy-2': { definitionHash: hash, board: played(), completed: false, savedOn: '2026-09-15' },
            },
        }))
        return hash
    }

    it('restores a board saved by the previous version', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        const hash = root.boardsStore.sessions.get('easy-1')!.definition.definitionHash
        window.localStorage.clear()
        window.localStorage.setItem(LEGACY_KEY, legacyDocument('2026-09-15').replace('""', `"${hash}"`))

        const store = reload()

        expect(store.sessions.get('easy-1')!.board[1][1]).toBe(1)
    })

    it('retires the old key so the migration cannot run twice', () => {
        window.localStorage.setItem(LEGACY_KEY, legacyDocument('2026-09-15'))
        reload()
        expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
    })

    it('retires the old key even when it holds nothing usable', () => {
        // Otherwise a damaged document is re-examined on every single load, forever.
        window.localStorage.setItem(LEGACY_KEY, '{not a document')
        reload()
        expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull()
    })

    it('does not delete the only copy when a write fails', () => {
        /*
         * The migration reads one document and writes several records, and storage can refuse
         * halfway through -- a full quota, or Safari private mode. Deleting the legacy key
         * before those writes means a failure destroys the only complete copy that existed.
         * Nothing can recover it afterwards: the v1 document is gone and the v2 records were
         * never written.
         */
        const hash = twoPuzzleDocument()
        let writes = 0
        const setItem = vi.spyOn(window.localStorage, 'setItem')
            .mockImplementation(function (this: Storage, key: string, value: string) {
                // The *second* record fails, so the migration is genuinely half done.
                if (key.startsWith(KEY_PREFIX) && ++writes === 2) throw new Error('QuotaExceededError')
                Storage.prototype.setItem.call(this, key, value)
            })

        reload()
        setItem.mockRestore()

        expect(window.localStorage.getItem(LEGACY_KEY), 'the only copy was deleted').not.toBeNull()
        expect(hash).toBeTruthy()
    })

    it('finishes the job on a later load, once storage will take it', () => {
        twoPuzzleDocument()
        let writes = 0
        const setItem = vi.spyOn(window.localStorage, 'setItem')
            .mockImplementation(function (this: Storage, key: string, value: string) {
                if (key.startsWith(KEY_PREFIX) && ++writes === 2) throw new Error('QuotaExceededError')
                Storage.prototype.setItem.call(this, key, value)
            })
        reload()
        setItem.mockRestore()

        reload()

        expect(readProgress('easy-1'), 'first record').not.toBeNull()
        expect(readProgress('easy-2'), 'second record').not.toBeNull()
        expect(window.localStorage.getItem(LEGACY_KEY), 'retired once complete').toBeNull()
    })

    it('shows the saved boards even while the migration cannot be written', () => {
        // Storage may stay blocked for the whole session. The player should still see their
        // board rather than an empty one that silently discards their progress.
        twoPuzzleDocument()
        const setItem = vi.spyOn(window.localStorage, 'setItem')
            .mockImplementation(() => { throw new Error('QuotaExceededError') })

        const store = reload()
        setItem.mockRestore()

        expect(store.sessions.get('easy-1')!.board[1][1], 'restored in memory').toBe(1)
    })

    it('never lets a v1 record overwrite newer v2 progress', () => {
        /*
         * Restartability has a cost if it is naive: a migration that runs again after a
         * partial failure would put the old document back over work done since. An existing
         * v2 record is the newer one by construction, so it wins.
         */
        // The hash comes from the document helper, not from a second `definitionHashFor` call:
        // that helper clears storage, which wiped the legacy key and left this test passing
        // without a migration ever running.
        const hash = twoPuzzleDocument()
        const newer = {
            definitionHash: hash,
            board: (() => {
                const board = Array.from({ length: 4 }, () => Array<number | null>(4).fill(null))
                board[0][0] = -1
                board[2][2] = 0
                board[2][3] = 2
                return board
            })(),
            completed: false,
            savedAt: Date.now(),
        }
        window.localStorage.setItem(`${KEY_PREFIX}easy-1`, JSON.stringify(newer))

        reload()

        expect(readProgress('easy-1')!.board[2][3], 'v2 progress was overwritten').toBe(2)
        expect(readProgress('easy-1')!.board[1][1]).toBeNull()
    })

    it('dates a migrated record from local midnight, so it ages no sooner than before', () => {
        runInAction(() => { root.boardsStore.setBoards(response()) })
        const hash = root.boardsStore.sessions.get('easy-1')!.definition.definitionHash
        window.localStorage.clear()
        window.localStorage.setItem(LEGACY_KEY, legacyDocument('2026-09-15').replace('""', `"${hash}"`))

        reload()

        expect(readProgress('easy-1')!.savedAt).toBe(new Date(2026, 8, 15).getTime())
    })
})

describe('the save is stamped with an absolute instant', () => {
    it('records now, so retention has something to measure', () => {
        const before = Date.now()
        runInAction(() => { root.boardsStore.setBoards(response()) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        expect(readProgress('easy-1')!.savedAt).toBeGreaterThanOrEqual(before)
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
        runInAction(() => { root.boardsStore.setLevel(2) })
        runInAction(() => { root.boardsStore.currentBoard!.placeToward([1, 1], 'down') })

        // Age level 2's record by hand, then reload and move on level 1 only.
        const aged = readProgress('easy-2')!
        const long_ago = Date.now() - 3 * 86_400_000
        window.localStorage.setItem(`${KEY_PREFIX}easy-2`, JSON.stringify({ ...aged, savedAt: long_ago }))

        const before = Date.now()
        const store = reload()
        runInAction(() => { store.currentBoard!.placeToward([2, 2], 'right') })

        expect(readProgress('easy-2')!.savedAt, 'untouched puzzle').toBe(long_ago)
        expect(readProgress('easy-1')!.savedAt, 'the one that moved').toBeGreaterThanOrEqual(before)
    })

    it('drops records older than the retention window when the store loads', () => {
        window.localStorage.setItem(`${KEY_PREFIX}ancient`, JSON.stringify({
            definitionHash: 'x',
            board: [[null]],
            completed: false,
            savedAt: Date.now() - (RETENTION_DAYS + 1) * 86_400_000,
        }))

        reload()
        expect(readProgress('ancient')).toBeNull()
    })

    it('keeps a record saved in the future rather than deleting it', () => {
        /*
         * The westward-travel case, end to end. A player who flies across the date line has
         * records stamped later than their new clock; under v1 these were dated "tomorrow"
         * and the rollover -- which deliberately notices a backward date change -- deleted
         * them. Demonstrated before the fix: the record came back null.
         */
        window.localStorage.setItem(`${KEY_PREFIX}tomorrow`, JSON.stringify({
            definitionHash: 'x',
            board: [[null]],
            completed: false,
            savedAt: Date.now() + 86_400_000,
        }))

        reload()
        expect(readProgress('tomorrow'), 'deleted by travelling west').not.toBeNull()
    })
})
