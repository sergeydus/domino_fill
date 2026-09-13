import { describe, it, expect, beforeEach } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { isBoardFull, columnSums, rowSums, targetsMatch } from '@/app/stores/boardRules'
import type { Board } from '@/app/stores/boardRules'
import type { BoardsResponse } from '@/app/dominoFill/Boards'

/**
 * P0-6: completion is `isBoardFull && targetsMatch`, both pure and separately testable.
 *
 * The fullness half is an assertion, not a fix for a reachable bug: matching the column
 * sums alone already implies a full board while the D6 pairing invariant holds. It guards
 * against a future change that breaks the pairing.
 */

const full2x2: Board = [[1, 1], [0, 0]]

const def2x2 = (over: Partial<{ h: string, v: string }> = {}) => definitionFrom({
    puzzleId: 'c-2x2',
    board: [[null, null], [null, null]],
    boardHorizontalNumbers: over.h ?? '1,1',
    boardVerticalNumbers: over.v ?? '2,0',
})

let root: RootStore
beforeEach(() => { root = new RootStore() })

describe('isBoardFull (pure)', () => {
    it('accepts a fully covered board', () => {
        expect(isBoardFull(full2x2, 2)).toBe(true)
    })

    it('accepts rocks as occupying a cell', () => {
        expect(isBoardFull([[-1, 1], [-1, 0]], 2)).toBe(true)
        expect(isBoardFull([[-1, -1], [-1, -1]], 2)).toBe(true)
    })

    it('rejects a board with one empty cell', () => {
        expect(isBoardFull([[1, 1], [0, null]], 2)).toBe(false)
    })

    it('rejects undefined cells', () => {
        expect(isBoardFull([[1, 1], [0, undefined as unknown as number]], 2)).toBe(false)
    })

    it('rejects sparse cells that array callbacks would skip', () => {
        // The reason this is an indexed loop: flat()/every() skip holes entirely, so this
        // board would read as "full" under a callback-based check.
        const sparseRow = [1, 1]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const holed: any[] = [0, , ] // index 1 is a hole
        holed.length = 2
        expect(holed.every(c => c === 0 || c === 1)).toBe(true) // the trap
        expect(isBoardFull([sparseRow, holed], 2)).toBe(false)
    })

    it('rejects a sparse row', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rows: any[] = [[1, 1], ,]
        rows.length = 2
        expect(isBoardFull(rows, 2)).toBe(false)
    })

    it.each([
        ['too few rows', [[1, 1]], 2],
        ['too many rows', [[1, 1], [0, 0], [1, 1]], 2],
        ['ragged: short row', [[1, 1], [0]], 2],
        ['ragged: long row', [[1, 1], [0, 0, 0]], 2],
    ])('rejects malformed shape: %s', (_label, board, size) => {
        expect(isBoardFull(board as Board, size as number)).toBe(false)
    })

    it.each([
        ['zero', 0], ['negative', -1], ['non-integer', 2.5],
    ])('rejects a nonsensical size: %s', (_label, size) => {
        expect(isBoardFull(full2x2, size as number)).toBe(false)
    })

    it('rejects an unknown cell value', () => {
        expect(isBoardFull([[1, 1], [0, 7]], 2)).toBe(false)
    })
})

describe('sums (pure)', () => {
    it('sums columns and rows independently, ignoring rocks', () => {
        const board: Board = [[1, -1], [0, 2]]
        expect(columnSums(board, 2)).toEqual([1, 2])
        expect(rowSums(board, 2)).toEqual([1, 2])
    })

    it('treats empty cells as zero', () => {
        expect(columnSums([[null, null], [null, null]], 2)).toEqual([0, 0])
    })
})

describe('targetsMatch (pure, strict equality)', () => {
    it('matches a solved board on both axes', () => {
        expect(targetsMatch(full2x2, def2x2())).toBe(true)
    })

    it('fails when only the horizontal axis mismatches', () => {
        expect(targetsMatch(full2x2, def2x2({ h: '9,9' }))).toBe(false)
    })

    it('fails when only the vertical axis mismatches', () => {
        expect(targetsMatch(full2x2, def2x2({ v: '9,9' }))).toBe(false)
    })

    it('does not coerce: a numerically equal but differently formatted target fails', () => {
        expect(targetsMatch(full2x2, def2x2({ h: '01,1' }))).toBe(false)
        expect(targetsMatch(full2x2, def2x2({ h: '1, 1' }))).toBe(false)
    })
})

describe('completedByRules combines both halves', () => {
    it('is true for a legally solved board', () => {
        const s = new PuzzleSession(def2x2(), root)
        runInAction(() => {
            s.board[0][0] = 1; s.board[1][0] = 0
            s.board[0][1] = 1; s.board[1][1] = 0
        })
        expect(s.isBoardFull).toBe(true)
        expect(s.targetsMatch).toBe(true)
        expect(s.completedByRules).toBe(true)
    })

    it('is false when the targets match but a cell is still empty', () => {
        // The case the fullness assertion exists for: an all-zero target is satisfied by
        // an empty board, so targetsMatch alone would declare a win on an untouched board.
        const s = new PuzzleSession(definitionFrom({
            puzzleId: 'c-zero',
            board: [[null, null], [null, null]],
            boardHorizontalNumbers: '0,0',
            boardVerticalNumbers: '0,0',
        }), root)

        expect(s.targetsMatch).toBe(true)
        expect(s.isBoardFull).toBe(false)
        expect(s.completedByRules).toBe(false)
    })

    it('is false when the board is full but the targets do not match', () => {
        const s = new PuzzleSession(def2x2({ h: '9,9' }), root)
        runInAction(() => {
            s.board[0][0] = 1; s.board[1][0] = 0
            s.board[0][1] = 1; s.board[1][1] = 0
        })
        expect(s.isBoardFull).toBe(true)
        expect(s.targetsMatch).toBe(false)
        expect(s.completedByRules).toBe(false)
    })

    it('counts a rock-covered cell as full', () => {
        const s = new PuzzleSession(definitionFrom({
            puzzleId: 'c-rock',
            board: [[-1, null], [-1, null]],
            boardHorizontalNumbers: '0,1',
            boardVerticalNumbers: '1,0',
        }), root)
        runInAction(() => { s.board[0][1] = 1; s.board[1][1] = 0 })

        expect(s.isBoardFull).toBe(true)
        expect(s.completedByRules).toBe(true)
    })

    it('getters are pure: reading them never sets the stored flag', () => {
        const s = new PuzzleSession(def2x2(), root)
        runInAction(() => {
            s.board[0][0] = 1; s.board[1][0] = 0
            s.board[0][1] = 1; s.board[1][1] = 0
        })
        expect(s.completedByRules).toBe(true)
        expect(s.completed).toBe(false) // only the store's reaction may write this
    })
})

describe('the stored completion flag is written only by the store reaction', () => {
    const solvable = (id: string) => ({
        puzzleId: id,
        board: [[null, null], [null, null]],
        boardHorizontalNumbers: '1,1',
        boardVerticalNumbers: '2,0',
    })

    const response = (): BoardsResponse => ({
        easyBoards: [solvable('e1'), solvable('e2'), solvable('e3')],
        mediumBoards: [solvable('m1'), solvable('m2'), solvable('m3')],
        hardBoards: [solvable('h1'), solvable('h2'), solvable('h3')],
    })

    it('flags a board that arrives already solved, without any move being made', () => {
        // There is no fireImmediately on the reaction: at construction currentBoard is
        // necessarily null. A board that is *already* solved on arrival must therefore be
        // caught by the ordinary null -> session transition when setBoards runs.
        //
        // An all-rock board with zero targets is exactly that board: rocks survive
        // canonicalization (only placed dominoes are stripped) and count as occupying a
        // cell, so isBoardFull and targetsMatch are both true the moment the session is
        // constructed -- before the player touches anything.
        const store = root.boardsStore
        const allRock = (id: string) => ({
            puzzleId: id,
            board: [[-1, -1], [-1, -1]] as (number | null)[][],
            boardHorizontalNumbers: '0,0',
            boardVerticalNumbers: '0,0',
        })
        store.setBoards({
            easyBoards: [allRock('r1'), allRock('r2'), allRock('r3')],
            mediumBoards: [allRock('r4'), allRock('r5'), allRock('r6')],
            hardBoards: [allRock('r7'), allRock('r8'), allRock('r9')],
        })

        const s = store.currentBoard!
        expect(s.completedByRules).toBe(true)
        expect(s.completed).toBe(true) // flagged by the reaction, with no mutation at all
    })

    it('stays false until the combined predicate becomes true, then flips', () => {
        const store = root.boardsStore
        store.setBoards(response())
        const s = store.currentBoard!

        expect(s.completed).toBe(false)

        // One domino down: targets not yet met, board not yet full.
        runInAction(() => { s.board[0][0] = 1; s.board[1][0] = 0 })
        expect(s.completedByRules).toBe(false)
        expect(s.completed).toBe(false)

        // Completing the board satisfies both halves; the reaction observes and marks it.
        runInAction(() => { s.board[0][1] = 1; s.board[1][1] = 0 })
        expect(s.completedByRules).toBe(true)
        expect(s.completed).toBe(true)
    })

    it('marks a second already-solved board when switching to it', () => {
        // Switching to a board that is already solved must still flag it. (Note this also
        // passes when the reaction tracks a plain boolean -- the effect flips `completed`
        // synchronously, so the expression settles back to false between boards. The test
        // pins the behaviour, not the implementation choice.)
        const store = root.boardsStore
        store.setBoards(response())

        const first = store.currentBoard!
        runInAction(() => {
            first.board[0][0] = 1; first.board[1][0] = 0
            first.board[0][1] = 1; first.board[1][1] = 0
        })
        expect(first.completed).toBe(true)

        const second = store.sessions.get('e2')!
        runInAction(() => {
            second.board[0][0] = 1; second.board[1][0] = 0
            second.board[0][1] = 1; second.board[1][1] = 0
        })
        // Not current yet, so nothing has observed it.
        expect(second.completed).toBe(false)

        store.setLevel(2)
        expect(store.currentBoard).toBe(second)
        expect(second.completed).toBe(true)
    })

    it('does not mark an all-zero-target board complete while it is empty', () => {
        const store = root.boardsStore
        const zero = (id: string) => ({
            puzzleId: id,
            board: [[null, null], [null, null]],
            boardHorizontalNumbers: '0,0',
            boardVerticalNumbers: '0,0',
        })
        store.setBoards({
            easyBoards: [zero('z1'), zero('z2'), zero('z3')],
            mediumBoards: [zero('z4'), zero('z5'), zero('z6')],
            hardBoards: [zero('z7'), zero('z8'), zero('z9')],
        })

        const s = store.currentBoard!
        expect(s.targetsMatch).toBe(true)
        expect(s.completed).toBe(false)
    })
})
