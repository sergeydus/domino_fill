"use client"
import { makeAutoObservable } from "mobx"
import { RootStore } from "./RootStore"
import { PuzzleDefinition, cloneInitialBoard } from "./PuzzleDefinition"

/**
 * The mutable half of a puzzle: one player's progress on one `PuzzleDefinition`.
 *
 * Sessions are long-lived and stable — `LevelStore` keeps one per `puzzleId` so that
 * switching difficulty or level and coming back returns the same object with the same moves
 * on it. The board is deep-cloned from the definition at construction, so gameplay never
 * writes through to the definition or to the imported JSON it came from.
 */
export class PuzzleSession {
    rootStore: RootStore
    readonly definition: PuzzleDefinition
    board: (number | null)[][]
    completed: boolean = false

    constructor(definition: PuzzleDefinition, rootStore: RootStore) {
        this.definition = definition
        this.rootStore = rootStore
        this.board = cloneInitialBoard(definition)
        makeAutoObservable(this, { definition: false, rootStore: false })
    }

    get puzzleId() { return this.definition.puzzleId }

    /** Discard all progress and start this puzzle again from its definition. */
    reset() {
        this.board = cloneInitialBoard(this.definition)
        this.completed = false
    }

    get correctHorizontalValues() {
        // Sums a COLUMN despite the name; see spec D10-d2.
        return this.board.map((_row, index) => {
            let sum = 0
            for (let i = 0; i < this.board.length; i++) {
                const cur = this.board[i][index]
                if (cur == -1) continue
                sum += (cur || 0)
            }
            return sum
        })
    }

    get correctVerticalValues() {
        // Sums a ROW despite the name; see spec D10-d2.
        return this.board.map((row) =>
            row.reduce<number>((acc, cur) => (cur == -1 ? acc : (acc || 0) + (cur || 0)), 0)
        )
    }

    get squareSize() {
        const boardWidth = this.rootStore.sizeStore.boardSize
        const size = this.board.length
        switch (size) {
            case 6: return Math.round(boardWidth / 8)
            case 7: return Math.round(boardWidth / 9)
            case 8: return Math.round(boardWidth / 10)
            default: return 96
        }
    }

    get highlightedSquares2(): [[number, number], [number, number]] | null {
        const hoverCords = this.rootStore.sizeStore.hoverCords
        if (!hoverCords) return null
        const selectedPiece = this.rootStore.boardsStore.selectedPiece
        if (!selectedPiece) return null

        const size = this.squareSize
        const [x, y] = hoverCords
        const i = Math.floor(y / size)
        const j = Math.floor(x / size)
        const boardSize = this.board.length

        if ((i < 0 || j < 0) || (i >= boardSize || j >= boardSize) || this.board[i][j] != null) {
            return null
        }
        if (selectedPiece == 1) {
            const isAboveHalf = y % size > (size / 2)
            if (isAboveHalf) {
                if (i + 1 < boardSize && this.board[i + 1][j] == null) return [[i, j], [i + 1, j]]
                if (i - 1 >= 0 && this.board[i - 1][j] == null) return [[i, j], [i - 1, j]]
            } else {
                if (i - 1 >= 0 && this.board[i - 1][j] == null) return [[i, j], [i - 1, j]]
                if (i + 1 < boardSize && this.board[i + 1][j] == null) return [[i, j], [i + 1, j]]
            }
        }
        if (selectedPiece == 2) {
            const isLeftHalf = x % size > (size / 2)
            if (isLeftHalf) {
                if (j + 1 < boardSize && this.board[i][j + 1] == null) return [[i, j], [i, j + 1]]
                if (j - 1 >= 0 && this.board[i][j - 1] == null) return [[i, j], [i, j - 1]]
            } else {
                if (j - 1 >= 0 && this.board[i][j - 1] == null) return [[i, j], [i, j - 1]]
                if (j + 1 < boardSize && this.board[i][j + 1] == null) return [[i, j], [i, j + 1]]
            }
        }
        return null
    }

    setPieceOnBoard() {
        const selectedPiece = this.rootStore.boardsStore.selectedPiece
        const highlighted = this.highlightedSquares2
        if (!highlighted || !selectedPiece) return

        const [[i, j], [i2, j2]] = highlighted
        if (this.board[i][j] != null) return

        if (selectedPiece == 1) {
            if (i > i2) { this.board[i2][j2] = 1; this.board[i][j] = 0 }
            else { this.board[i][j] = 1; this.board[i2][j2] = 0 }
        } else if (selectedPiece == 2) {
            if (j > j2) { this.board[i2][j2] = 0; this.board[i][j] = 2 }
            else { this.board[i][j] = 0; this.board[i2][j2] = 2 }
        }
    }

    removePiece(i: number, j: number) {
        const value = this.board[i][j]
        if (value === null) return
        if (value == 1) {
            this.board[i][j] = null
            this.board[i + 1][j] = null
        } else {
            this.board[i][j] = null
            this.board[i][j - 1] = null
        }
    }

    get completedByRules() {
        return this.correctHorizontalValues.join(',') == this.definition.boardHorizontalNumbers
            && this.correctVerticalValues.join(',') == this.definition.boardVerticalNumbers
    }

    setCompleted(isCompleted: boolean) {
        this.completed = isCompleted
    }
}
