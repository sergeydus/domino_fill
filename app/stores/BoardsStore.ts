"use client"
import { autorun, makeAutoObservable, reaction } from "mobx"
import DominoBoard from "../dominoFill/dominoBoard"
import Boards from "../dominoFill/Boards"

export class BoardsStore {
    difficulty: 'easy' | 'normal' | 'hard' = 'easy'
    level: 1 | 2 | 3 = 1
    selectedPiece: 1 | 2 = 1
    easyBoards: DominoBoard[] = []
    mediumBoards: DominoBoard[] = []
    hardBoards: DominoBoard[] = []
    hoverCords: [number, number] | null = null
    hoveredSquare: [number, number] | null = null
    boardWidth: number = 768 //default for hard
    constructor() {
        let audio: HTMLAudioElement | null = null
        if (typeof Audio != 'undefined') {
            audio = new Audio('winSilent.mp3')
        }
        // if (typeof window !== 'undefined') {
        //     this.boardWidth = window.innerWidth < 768 ? window.innerWidth : this.boardWidth
        // }
        makeAutoObservable(this)
        autorun(() => {
            if (this.currentBoard && this.correctHorizontalValues.join('') == this.currentBoard?.boardHorizontalNumbers
                && this.correctVerticalValues.join('') == this.currentBoard?.boardVerticalNumbers
                && !this.currentBoard.completed) {
                console.log('level complete')
                this.currentBoard.completed = true
                audio?.play()
            }
        })
        reaction(() => this.difficulty, () => {
            let boards = []
            switch (this.difficulty) {
                case 'easy':
                    boards = this.easyBoards
                    break;
                case 'normal':
                    boards = this.mediumBoards
                    break;
                case 'hard':
                    boards = this.hardBoards
                    break;

                default:
                    boards = this.easyBoards
                    break;
            }
            //find first uncompleted level
            const index = boards.findIndex(el => !el.completed)
            console.log('on change difficutly, index:', index)
            if (index != -1) {
                console.log('set level', index + 1)
                this.setLevel((index + 1) as 1 | 2 | 3)
            } else {
                //if all levels completed, move to last level
                this.setLevel(3)
            }
        })
    }
    setBoards(boards: Boards) {
        this.easyBoards = boards.easyBoards
        this.mediumBoards = boards.mediumBoards
        this.hardBoards = boards.hardBoards
    }
    setLevel(level: 1 | 2 | 3) { this.level = level }
    setDifficulty(dif: 'easy' | 'normal' | 'hard') { this.difficulty = dif }
    setSelectedPiece(piece: 1 | 2) { this.selectedPiece = piece }
    setHoveredSquare(square: [number, number] | null) { this.hoveredSquare = square }
    setHoverCords(cords: [number, number] | null) {
        this.hoverCords = cords
    }
    setBoardWidth(width: number) {
        this.boardWidth = width
    }
    get squareSize() {
        switch (this.difficulty) {
            case 'easy':
                return Math.round(this.boardWidth / 8)
            case 'normal':
                return Math.round(this.boardWidth / 9)
            case 'hard':
                return Math.round(this.boardWidth / 10)
            default:
                return 96
        }
    }
    get currentBoard() {
        let board: DominoBoard | null = null
        switch (this.difficulty) {
            case 'easy': board = this.easyBoards[this.level - 1]; break;
            case 'normal': board = this.mediumBoards[this.level - 1]; break;
            case 'hard': board = this.hardBoards[this.level - 1]; break;
            default: board = this.easyBoards[this.level - 1];
        }
        return board
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
    get highlightedSquares(): [[number, number], [number, number]] | null {
        if (!this.hoveredSquare) {
            return null
        }
        const [i, j] = this.hoveredSquare
        if (this.currentBoard.board[i][j] != null) {
            return null
        }
        if (this.selectedPiece == 1) {
            if (i + 1 < this.currentBoard.board.length && this.currentBoard.board[i + 1][j] == null) {
                return [[i, j], [i + 1, j]]
            }
            else if (i - 1 >= 0 && this.currentBoard.board[i - 1][j] == null) {
                return [[i, j], [i - 1, j]]
            }
        }
        else if (this.selectedPiece == 2) {
            if (j + 1 < this.currentBoard.board.length && this.currentBoard.board[i][j + 1] == null) {
                return [[i, j], [i, j + 1]]
            }
            else if (j - 1 >= 0 && this.currentBoard.board[i][j - 1] == null) {
                return [[i, j], [i, j - 1]]
            }
        }
        // this.currentBoard
        return null
    }
    get highlightedSquares2(): [[number, number], [number, number]] | null {
        if (!this.hoverCords) {
            return null
        }
        const size = this.squareSize
        const [x, y] = this.hoverCords
        const i = Math.floor(y / size)
        const j = Math.floor(x / size)
        const boardSize = this.currentBoard.board.length
        // console.log('hover', { i, j, boardSize })
        // if hover is outside of board, ignore, if hover is on rock, ignore
        if ((i < 0 || j < 0) || (i >= boardSize || j >= boardSize) || this.currentBoard.board[i][j] != null) {
            return null
        }
        // console.log('is ok!', { i, j, boardSize })
        const bob = size
        if (this.selectedPiece == 1) {
            // const floor = Math.floor(y)
            const isAboveHalf = y % bob > (bob / 2)
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
        if (this.selectedPiece == 2) {
            const isLeftHalf = x % bob > (bob / 2)
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
        console.log('setPieceOnBoard', this.highlightedSquares2)
        if (!this.highlightedSquares2 || !this.currentBoard?.board) {
            console.log('no set piece', this.highlightedSquares2, this.currentBoard?.board)
            return
        }
        const [[i, j], [i2, j2]] = this.highlightedSquares2
        if (this.currentBoard.board[i][j] != null) {
            return
        }
        if (this.selectedPiece == 1) {
            if (i > i2) {
                this.currentBoard.board[i2][j2] = 1
                this.currentBoard.board[i][j] = 0
            } else {
                this.currentBoard.board[i][j] = 1
                this.currentBoard.board[i2][j2] = 0
            }
        }
        else if (this.selectedPiece == 2) {
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
}