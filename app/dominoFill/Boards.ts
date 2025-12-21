"use server"
import DominoBoard from "./dominoBoard";

class Boards {
    created = new Date()
    easyBoards!: [DominoBoard, DominoBoard, DominoBoard]
    mediumBoards!: [DominoBoard, DominoBoard, DominoBoard]
    hardBoards!: [DominoBoard, DominoBoard, DominoBoard]
    constructor() {
        // intentionally empty
        this.generateBoards()
        console.log('finished generating boards!')
    }
    generateBoards() {
        this.easyBoards = generateEasyBoards()
        this.mediumBoards = generateMediumBoards()
        this.hardBoards = generateHardBoards()
    }
}


function generateEasyBoards(): [DominoBoard, DominoBoard, DominoBoard] {
    return [new DominoBoard(6, 8), new DominoBoard(6, 6), new DominoBoard(6, 4)]
}
function generateMediumBoards(): [DominoBoard, DominoBoard, DominoBoard] {
    return [new DominoBoard(7, 9), new DominoBoard(7, 7), new DominoBoard(7, 5)]
}
function generateHardBoards(): [DominoBoard, DominoBoard, DominoBoard] {
    return [new DominoBoard(8, 10), new DominoBoard(8, 8), new DominoBoard(8, 6)]
}

const currentActiveBoard = new Boards()
const getCurrentActiveBoard = async (): Promise<Boards> => {
    const now = new Date()
    const created = currentActiveBoard.created

    const differentDay =
        created.getFullYear() !== now.getFullYear() ||
        created.getMonth() !== now.getMonth() ||
        created.getDate() !== now.getDate()

    if (differentDay) {
        currentActiveBoard.generateBoards()
        currentActiveBoard.created = now
        console.log('regenerated boards for new day')
    }

    return JSON.parse(JSON.stringify(currentActiveBoard))
}

export default Boards
export {
    getCurrentActiveBoard
}