import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { definitionFrom, cloneInitialBoard } from '@/app/stores/PuzzleDefinition'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import type { BoardsResponse } from '@/app/dominoFill/Boards'
import type { StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import sourceData from '@/app/mocks/dominoBoards.json'

/**
 * P0-5: immutable puzzle definitions, mutable per-puzzle sessions.
 *
 * Invariants pinned here:
 *  - a definition owns rocks/targets/puzzleId/definitionHash and is never mutated
 *  - a session deep-clones its board; gameplay never writes to the imported JSON
 *  - `currentBoard` is a pure Map lookup
 *  - switching away and back returns the SAME session, with moves intact
 *  - `setBoards` reconciles by puzzleId rather than clearing
 */

// Targets are deliberately non-zero so these fixtures start unsolved. (Since P0-6 an
// all-zero target no longer auto-completes an empty board -- completion requires fullness
// too -- but keeping them non-zero makes these fixtures realistic either way.)
const puzzle = (id: string, over: Partial<StoredPuzzle> = {}): StoredPuzzle => ({
    puzzleId: id,
    board: Array.from({ length: 6 }, () => Array(6).fill(null)),
    boardHorizontalNumbers: '3,3,3,3,3,3',
    boardVerticalNumbers: '3,3,3,3,3,3',
    ...over,
})

const response = (over: Partial<BoardsResponse> = {}): BoardsResponse => ({
    easyBoards: [puzzle('e1'), puzzle('e2'), puzzle('e3')],
    mediumBoards: [puzzle('m1'), puzzle('m2'), puzzle('m3')],
    hardBoards: [puzzle('h1'), puzzle('h2'), puzzle('h3')],
    ...over,
})

let root: RootStore
beforeEach(() => { root = new RootStore() })

describe('PuzzleDefinition', () => {
    it('strips placed pieces, keeping only rocks and empties', () => {
        const board = Array.from({ length: 6 }, () => Array(6).fill(null))
        board[0][0] = -1; board[1][1] = 1; board[2][1] = 0
        const def = definitionFrom(puzzle('p', { board }))

        expect(def.initialBoard[0][0]).toBe(-1)
        expect(def.initialBoard[1][1]).toBeNull()
        expect(def.initialBoard[2][1]).toBeNull()
    })

    it('gives the same hash for identical content and a different one otherwise', () => {
        const a = definitionFrom(puzzle('p'))
        const b = definitionFrom(puzzle('p'))
        const c = definitionFrom(puzzle('p', { boardHorizontalNumbers: '1,0,0,0,0,0' }))

        expect(a.definitionHash).toBe(b.definitionHash)
        expect(a.definitionHash).not.toBe(c.definitionHash)
    })

    it('is frozen', () => {
        const def = definitionFrom(puzzle('p'))
        expect(Object.isFrozen(def)).toBe(true)
        expect(Object.isFrozen(def.initialBoard)).toBe(true)
    })
})

describe('definitions stay frozen inside the store', () => {
    // makeAutoObservable deep-converts by default, which would replace each frozen
    // definition with an observable copy and silently undo definitionFrom's guarantee.
    // The definition collections are observable.ref for exactly this reason.
    it('currentDefinition is still the frozen object after setBoards', () => {
        const store = root.boardsStore
        store.setBoards(response())
        const def = store.currentDefinition!

        expect(Object.isFrozen(def)).toBe(true)
        expect(Object.isFrozen(def.initialBoard)).toBe(true)
        expect(Object.isFrozen(def.initialBoard[0])).toBe(true)
    })

    it("a session's definition is still frozen after setBoards", () => {
        const store = root.boardsStore
        store.setBoards(response())
        const def = store.currentBoard!.definition

        expect(Object.isFrozen(def)).toBe(true)
        expect(Object.isFrozen(def.initialBoard[0])).toBe(true)
    })

    it('the stored definition is the same object the factory produced', () => {
        const store = root.boardsStore
        store.setBoards(response())
        expect(store.currentBoard!.definition).toBe(store.currentDefinition)
    })
})

describe('puzzleId is required at ingestion', () => {
    it('throws rather than inventing a positional id', () => {
        const orphan = { ...puzzle('x') } as Partial<StoredPuzzle>
        delete orphan.puzzleId
        expect(() => definitionFrom(orphan as StoredPuzzle)).toThrow(/requires a puzzleId/)
    })
})

describe('source immutability', () => {
    it('playing a board never mutates the imported JSON', () => {
        const before = JSON.stringify(sourceData)

        const store = root.boardsStore
        // sourceData is an array of day-entries; a single day is one BoardsResponse.
        store.setBoards((sourceData as unknown as BoardsResponse[])[0])
        const session = store.currentBoard!
        expect(session).toBeTruthy()

        // Find a genuinely placeable cell rather than assuming one: the real board has
        // rocks, and a rejected placement would make this test vacuous.
        const cell = session.board.flatMap((row, i) =>
            row.map((_, j) => [i, j] as const)
        ).find(([i, j]) =>
            session.board[i][j] === null && session.board[i + 1]?.[j] === null
        )!
        expect(cell).toBeTruthy()

        root.boardsStore.setSelectedPiece(1)
        session.setHover({ i: cell[0], j: cell[1], fx: 0.5, fy: 0.9 })
        session.setPieceOnBoard()
        session.setCompleted(true)

        expect(session.board.flat().some(c => c === 1 || c === 2)).toBe(true)
        expect(JSON.stringify(sourceData)).toBe(before)
    })

    it('cloneInitialBoard hands back a detached, writable copy', () => {
        // Pins the explicit mechanism. Note that MobX's deep observable conversion also
        // copies the array, so isolation would survive an accidental alias -- but that is an
        // implicit guarantee of makeAutoObservable, not of this code. Depend on the clone.
        const def = definitionFrom(puzzle('p'))
        const clone = cloneInitialBoard(def)

        expect(clone).not.toBe(def.initialBoard)
        expect(Object.isFrozen(clone)).toBe(false)
        clone[0][0] = 1
        expect(def.initialBoard[0][0]).toBeNull()
    })

    it('a session board is not the definition board', () => {
        const def = definitionFrom(puzzle('p'))
        const session = new PuzzleSession(def, root)
        runInAction(() => { session.board[0][0] = 1 })
        expect(def.initialBoard[0][0]).toBeNull()
    })
})

describe('setBoards populates eagerly', () => {
    it('creates a session for every puzzle up front', () => {
        const store = root.boardsStore
        store.setBoards(response())
        expect(store.sessions.size).toBe(9)
        for (const id of ['e1', 'e2', 'e3', 'm1', 'm2', 'm3', 'h1', 'h2', 'h3']) {
            expect(store.sessions.get(id)).toBeInstanceOf(PuzzleSession)
        }
    })

    it('currentBoard is a pure lookup, not a construction', () => {
        const store = root.boardsStore
        store.setBoards(response())
        const a = store.currentBoard
        const b = store.currentBoard
        expect(a).toBe(b)
        expect(a).toBe(store.sessions.get('e1'))
    })

    it('returns null before boards arrive, without constructing anything', () => {
        expect(root.boardsStore.currentBoard).toBeNull()
        expect(root.boardsStore.sessions.size).toBe(0)
    })
})

describe('session identity and isolation', () => {
    it('preserves moves when switching difficulty away and back', () => {
        const store = root.boardsStore
        store.setBoards(response())

        const easy = store.currentBoard!
        runInAction(() => { easy.board[0][0] = 1 })
        runInAction(() => { easy.board[1][0] = 0 })

        store.setDifficulty('hard')
        expect(store.currentBoard).not.toBe(easy)

        store.setDifficulty('easy')
        expect(store.currentBoard).toBe(easy)
        expect(store.currentBoard!.board[0][0]).toBe(1)
    })

    it('preserves moves when switching level away and back', () => {
        const store = root.boardsStore
        store.setBoards(response())

        const first = store.currentBoard!
        runInAction(() => { first.board[2][2] = 1 })
        runInAction(() => { first.board[3][2] = 0 })

        store.setLevel(3)
        expect(store.currentBoard).not.toBe(first)
        store.setLevel(1)

        expect(store.currentBoard).toBe(first)
        expect(store.currentBoard!.board[2][2]).toBe(1)
    })

    it('keeps sessions independent of one another', () => {
        const store = root.boardsStore
        store.setBoards(response())

        runInAction(() => { store.sessions.get('e1')!.board[0][0] = 1 })
        expect(store.sessions.get('e2')!.board[0][0]).toBeNull()
        expect(store.sessions.get('h1')!.board[0][0]).toBeNull()
    })
})

describe('setBoards reconciles rather than clearing', () => {
    it('a repeated identical setBoards preserves sessions and their progress', () => {
        const store = root.boardsStore
        store.setBoards(response())

        const session = store.sessions.get('e1')!
        runInAction(() => { session.board[0][0] = 1 })

        // A duplicate effect or a refetch must not wipe live progress.
        store.setBoards(response())

        expect(store.sessions.get('e1')).toBe(session)
        expect(store.sessions.get('e1')!.board[0][0]).toBe(1)
    })

    it('replaces a session when the same id arrives with changed content', () => {
        const store = root.boardsStore
        store.setBoards(response())

        const stale = store.sessions.get('e1')!
        runInAction(() => { stale.board[0][0] = 1 })

        store.setBoards(response({
            easyBoards: [
                puzzle('e1', { boardHorizontalNumbers: '1,2,3,4,5,6' }), // changed content
                puzzle('e2'), puzzle('e3'),
            ],
        }))

        const fresh = store.sessions.get('e1')!
        expect(fresh).not.toBe(stale)
        expect(fresh.board[0][0]).toBeNull()
        expect(fresh.definition.columnTargets).toBe('1,2,3,4,5,6')
    })

    it('adds new ids without disturbing existing sessions', () => {
        const store = root.boardsStore
        store.setBoards(response())
        const kept = store.sessions.get('e1')!
        runInAction(() => { kept.board[0][0] = 1 })

        store.setBoards(response({
            easyBoards: [puzzle('e1'), puzzle('e2'), puzzle('e9')],
        }))

        expect(store.sessions.get('e1')).toBe(kept)
        expect(store.sessions.get('e1')!.board[0][0]).toBe(1)
        expect(store.sessions.get('e9')).toBeInstanceOf(PuzzleSession)
    })

    it('leaves obsolete entries alone (expiry is a separate, intentional act)', () => {
        const store = root.boardsStore
        store.setBoards(response())
        store.setBoards(response({
            easyBoards: [puzzle('e9'), puzzle('e8'), puzzle('e7')],
        }))
        // e1..e3 are no longer referenced but were not silently destroyed.
        expect(store.sessions.get('e1')).toBeInstanceOf(PuzzleSession)
    })
})

describe('shipped data', () => {
    it('every shipped puzzle has a unique, stable puzzleId', () => {
        const days = sourceData as unknown as BoardsResponse[]
        const ids = days.flatMap(d => [...d.easyBoards, ...d.mediumBoards, ...d.hardBoards])
            .map(b => b.puzzleId)

        expect(ids).toHaveLength(18)
        expect(ids.every(Boolean)).toBe(true)
        expect(new Set(ids).size).toBe(18)
    })
})
