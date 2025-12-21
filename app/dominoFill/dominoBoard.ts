"use server"
class DominoBoard {
    board: (number | null)[][];
    boardHorizontalNumbers: string
    boardVerticalNumbers: string
    completed: boolean
    constructor(size = 8, rocks = 10) {
        let boardHorizontalNumbers: string | null = null
        let boardVerticalNumbers: string | null = null
        let finalBoard: number[][] | null = null
        this.completed = false
        // keep generating random boards till one has only one solution
        // (bruteforce)
        do {
            finalBoard = Array.from({ length: size }, () => Array(size).fill(null));
            console.log(`generating size:${size},rocks:${rocks}`)
            this.addRocks(rocks, finalBoard);
            console.log('created board')
            const isvalid = this.testRockValidity(finalBoard)
            console.log('board is', isvalid ? 'valid' : 'not valid')
            const boardResult = this.fillBoard(finalBoard);
            if (boardResult.isPossible && boardResult.boardCode) {
                boardHorizontalNumbers = boardResult.boardCode.slice(0, size)
                boardVerticalNumbers = boardResult.boardCode.slice(size)
            } else {
                console.log(`generating size:${size},rocks:${rocks} failed!`)
            }
        } while (!boardHorizontalNumbers || !boardVerticalNumbers)
        console.log('success!', `generating size:${size},rocks:${rocks}`)
        this.boardHorizontalNumbers = boardHorizontalNumbers
        this.boardVerticalNumbers = boardVerticalNumbers
        this.board = finalBoard
    }

    addRocks(rockCount = 2, board: number[][]) {
        // if (rockCount % 2 !== 0) {
        //     throw new Error("Rocks need to be added in pairs");
        // }
        // Add rocks to the board
        for (let i = 0; i < rockCount; i++) {
            const row = Math.floor(Math.random() * board.length);
            const col = Math.floor(Math.random() * board[0].length);
            const isAlreadyRock = board[row][col] === -1;
            if (isAlreadyRock) {
                i--;
                continue;
            }
            board[row][col] = -1;
        }
    }
    // make sure rocks dont create unsolvable boards    
    testRockValidity(board: number[][]) {
        const walledOffPositions: boolean[][] = Array.from({ length: board.length }, () => Array(board[0].length).fill(false));
        for (let i = 0; i < board.length; i++) {
            for (let j = 0; j < board[i].length; j++) {
                //if its a rock, ignore
                if (board[i][j] == -1) continue
                //check if 3 blocks around the cube are rocks/out of bound
                const isUpBlocked = i === 0 || board[i - 1][j] === -1
                const isDownBlocked = i === board.length - 1 || board[i + 1][j] === -1
                const isLeftBlocked = j === 0 || board[i][j - 1] === -1
                const isRightBlocked = j === board[i].length - 1 || board[i][j + 1] === -1
                const totalBlocked = (isUpBlocked ? 1 : 0) + (isDownBlocked ? 1 : 0) + (isLeftBlocked ? 1 : 0) + (isRightBlocked ? 1 : 0)
                if (totalBlocked >= 4) {
                    console.log('impossible to solve board')
                    return false
                }
                if (totalBlocked == 3) {
                    walledOffPositions[i][j] = true
                }
            }
        }
        for (let i = 0; i < board.length; i++) {
            for (let j = 0; j < board[i].length; j++) {
                //if its a rock, ignore
                if (board[i][j] == -1) continue
                //if there are two neighboring walled off positions, its not solvable
                //check how many neighboring walled off positions there are
                const isUpBlocked = i === 0 ? false : walledOffPositions[i - 1][j]
                const isDownBlocked = i === board.length - 1 ? false : walledOffPositions[i + 1][j]
                const isLeftBlocked = j === 0 ? false : walledOffPositions[i][j - 1]
                const isRightBlocked = j === board[i].length - 1 ? false : walledOffPositions[i][j + 1]
                const totalBlocked = (isUpBlocked ? 1 : 0) + (isDownBlocked ? 1 : 0) + (isLeftBlocked ? 1 : 0) + (isRightBlocked ? 1 : 0)
                if (totalBlocked == 2) {
                    console.log('impossible to solve board')
                    return false
                }


            }
        }
        return true
    }
    findFirstEmpty(board: (number | null)[][]) {
        for (let i = 0; i < board[i].length; i++) {
            for (let j = 0; j < board[i].length; j++) {
                if (board[i][j] === null) {
                    return [i, j]
                }
            }
        }
        return null
    }
    fillBoard(board: number[][]) {
        // console.log('fill board:', this.board)
        const boardSize = board.length;
        const possibleBoards = new Map<string, number>()
        const recur = (board: (number | null)[][]) => {
            // console.log('currentBoard', board)
            //check if board is full
            if (board.flat().every(cell => cell !== null)) {
                //return board string of values, first {boardsize} are sum of horizontal rows, next {boardsize} are sum of vertical columns
                let str = ''
                for (let j = 0; j < boardSize; j++) {
                    let sumVertical = 0
                    for (let i = 0; i < boardSize; i++) {
                        if (board[i][j] == -1) {
                            continue
                        }
                        sumVertical += board[i][j]!
                    }
                    str += sumVertical.toString()
                }
                for (let i = 0; i < boardSize; i++) {
                    let sumHorizontal = 0
                    for (let j = 0; j < boardSize; j++) {
                        if (board[i][j] == -1) {
                            continue
                        }
                        sumHorizontal += board[i][j]!
                    }
                    str += sumHorizontal.toString()
                }
                // console.log('str', str)
                possibleBoards.set(str, (possibleBoards.get(str) ?? 0) + 1)
                return
            }
            else {
                /**
                 * find an empty cell and try to fit a [1] or a [0,2] domino in it
                 *                                     [0]      
                */
                const hasFirstEmpty = this.findFirstEmpty(board)
                if (!hasFirstEmpty) {
                    return
                }
                const editBoard1 = structuredClone(board)
                const editBoard2 = structuredClone(board)
                const [i, j] = hasFirstEmpty
                /**
                * try to fit [1] domino
                *            [0]  
                */
                if (i + 1 < boardSize && board[i + 1][j] === null) {
                    editBoard1[i][j] = 1
                    editBoard1[i + 1][j] = 0
                    recur(editBoard1)
                }

                /**
                * try to fit [0,2] domino  
                */
                if (j + 1 < boardSize && board[i][j + 1] === null) {
                    editBoard2[i][j] = 0
                    editBoard2[i][j + 1] = 2
                    recur(editBoard2)
                }
            }
        }
        recur(board);
        //recur end
        // console.log('possibleBoards', possibleBoards, board)
        const possibleBoard = Array.from(possibleBoards.entries()).find(([code, solutions]) => {
            return solutions === 1
        })
        return {
            isPossible: possibleBoard != null,
            boardCode: possibleBoard?.[0] ?? null
        }
    }
}

export default DominoBoard