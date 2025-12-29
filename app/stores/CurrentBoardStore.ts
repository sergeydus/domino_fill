"use client"
import { makeAutoObservable } from "mobx"
import { DominoLevel } from "../dominoFill/dominoBoard"
import { RootStore } from "./RootStore"

export class CurrentBoardStore {
    rootStore: RootStore
    currentBoard: DominoLevel
    boardWidth: number = 768 //default for hard
    constructor(currentBoard: DominoLevel, rootStore: RootStore) {
        this.currentBoard = currentBoard
        this.rootStore = rootStore
        makeAutoObservable(this)
    }
    setBoard(boards: DominoLevel) {
        this.currentBoard = boards
    }

    get correctHorizontalValues() {
        const correctIndexes = this.currentBoard.board.map((arr, index) => {
            let sum = 0
            for (let i = 0; i < arr.length; i++) {
                const cur = this.currentBoard.board[i][index]
                if (cur == -1) {
                    continue
                }
                sum += (cur || 0)
            }

            return sum
        })
        return correctIndexes
    }
    get correctVerticalValues() {
        return this.currentBoard.board.map((arr) => {
            const sum = arr.reduce<number>((acc, cur) => {
                if (cur == -1) {
                    return acc
                }
                return (acc || 0) + (cur || 0)
            }, 0)
            // console.log(`arr${index}`, JSON.parse(JSON.stringify(arr)), sum)
            return sum
        })
    }
    get squareSize() {
        const boardWidth = this.rootStore.sizeStore.boardSize
        switch (this.currentBoard.board.length) {
            case 6:
                return Math.round(boardWidth / 8)
            case 7:
                return Math.round(boardWidth / 9)
            case 8:
                return Math.round(boardWidth / 10)
            default:
                return 96
        }
    }
    get highlightedSquares2(): [[number, number], [number, number]] | null {
        const hoverCords = this.rootStore.sizeStore.hoverCords
        if (!hoverCords) {
            return null
        }
        const selectedPiece = this.rootStore.boardsStore.selectedPiece
        if (!selectedPiece) {
            return null
        }
        const size = this.squareSize
        const [x, y] = hoverCords
        const i = Math.floor(y / size)
        const j = Math.floor(x / size)
        const boardSize = this.currentBoard.board.length
        // console.log('hover', { i, j, boardSize })
        // if hover is outside of board, ignore, if hover is on rock, ignore
        if ((i < 0 || j < 0) || (i >= boardSize || j >= boardSize) || this.currentBoard.board[i][j] != null) {
            return null
        }
        // console.log('is ok!', { i, j, boardSize })
        if (selectedPiece == 1) {
            // const floor = Math.floor(y)
            const isAboveHalf = y % size > (size / 2)
            if (isAboveHalf) {
                if (i + 1 < this.currentBoard.board.length && this.currentBoard.board[i + 1][j] == null) {
                    return [[i, j], [i + 1, j]]
                }
                else if (i - 1 >= 0 && this.currentBoard.board[i - 1][j] == null) {
                    return [[i, j], [i - 1, j]]
                }
            } else {
                if (i - 1 >= 0 && this.currentBoard.board[i - 1][j] == null) {
                    return [[i, j], [i - 1, j]]
                }
                else if (i + 1 < this.currentBoard.board.length && this.currentBoard.board[i + 1][j] == null) {
                    return [[i, j], [i + 1, j]]
                }
            }
        }
        if (selectedPiece == 2) {
            const isLeftHalf = x % size > (size / 2)
            if (isLeftHalf) {
                if (j + 1 < this.currentBoard.board.length && this.currentBoard.board[i][j + 1] == null) {
                    return [[i, j], [i, j + 1]]
                }
                else if (j - 1 >= 0 && this.currentBoard.board[i][j - 1] == null) {
                    return [[i, j], [i, j - 1]]
                }
            } else {
                if (j - 1 >= 0 && this.currentBoard.board[i][j - 1] == null) {
                    return [[i, j], [i, j - 1]]
                }
                else if (j + 1 < this.currentBoard.board.length && this.currentBoard.board[i][j + 1] == null) {
                    return [[i, j], [i, j + 1]]
                }
            }

        }
        return null
    }
    setPieceOnBoard() {
        const selectedPiece = this.rootStore.boardsStore.selectedPiece
        // console.log('setPieceOnBoard', this.highlightedSquares2)
        if (!this.highlightedSquares2 || !this.currentBoard?.board || !selectedPiece) {
            // console.log('no set piece', this.highlightedSquares2, this.currentBoard?.board)
            return
        }
        const [[i, j], [i2, j2]] = this.highlightedSquares2
        if (this.currentBoard.board[i][j] != null) {
            return
        }
        if (selectedPiece == 1) {
            if (i > i2) {
                this.currentBoard.board[i2][j2] = 1
                this.currentBoard.board[i][j] = 0
            } else {
                this.currentBoard.board[i][j] = 1
                this.currentBoard.board[i2][j2] = 0
            }
        }
        else if (selectedPiece == 2) {
            if (j > j2) {
                this.currentBoard.board[i2][j2] = 0
                this.currentBoard.board[i][j] = 2
            } else {
                this.currentBoard.board[i][j] = 0
                this.currentBoard.board[i2][j2] = 2
            }
        }
    }
    removePiece(i: number, j: number) {
        const value = this.currentBoard.board[i][j]
        if (value === null) return
        if (value == 1) {
            this.currentBoard.board[i][j] = null
            this.currentBoard.board[i + 1][j] = null

        } else {
            this.currentBoard.board[i][j] = null
            this.currentBoard.board[i][j - 1] = null
        }
    }
    get completed() {
        return this.currentBoard && this.correctHorizontalValues?.join(',') == this.currentBoard.boardHorizontalNumbers
            && this.correctVerticalValues?.join(',') == this.currentBoard.boardVerticalNumbers
    }
    setCompleted(isCompleted: boolean) {
        this.currentBoard.completed = isCompleted
    }
}