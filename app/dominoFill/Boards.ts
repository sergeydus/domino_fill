"use server"
import DominoBoard, { DominoLevel } from "./dominoBoard";

export type BoardsResponse = {
    easyBoards: [DominoLevel, DominoLevel, DominoLevel],
    mediumBoards: [DominoLevel, DominoLevel, DominoLevel],
    hardBoards: [DominoLevel, DominoLevel, DominoLevel],
}
class Boards implements BoardsResponse {
    created = new Date()
    easyBoards!: [DominoLevel, DominoLevel, DominoLevel]
    mediumBoards!: [DominoLevel, DominoLevel, DominoLevel]
    hardBoards!: [DominoLevel, DominoLevel, DominoLevel]
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
    return [new DominoBoard({ size: 6, rocks: 8 }), new DominoBoard({ size: 6, rocks: 6 }), new DominoBoard({ size: 6, rocks: 4 })]
}
function generateMediumBoards(): [DominoBoard, DominoBoard, DominoBoard] {
    return [new DominoBoard({ size: 7, rocks: 9 }), new DominoBoard({ size: 7, rocks: 7 }), new DominoBoard({ size: 7, rocks: 5 })]
}
function generateHardBoards(): [DominoBoard, DominoBoard, DominoBoard] {
    return [new DominoBoard({ size: 8, rocks: 10, allow0Lines: false }), new DominoBoard({ size: 8, rocks: 8, allow0Lines: false }), new DominoBoard({ size: 8, rocks: 6, allow0Lines: false })]
}

const currentActiveBoard = new Boards()
const getCurrentActiveBoard = async (): Promise<BoardsResponse> => {
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