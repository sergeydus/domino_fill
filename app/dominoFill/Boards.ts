"use server"
import DominoBoard, { DominoLevel } from "./dominoBoard";
import type { StoredPuzzle } from "../stores/PuzzleDefinition";
import dominoBoardsData from '@/app/mocks/dominoBoards.json';

export type BoardsResponse = {
    easyBoards: StoredPuzzle[],
    mediumBoards: StoredPuzzle[],
    hardBoards: StoredPuzzle[],
}
// Not `implements BoardsResponse`: the runtime shape now requires a puzzleId, which this
// generator does not mint. It is dead scaffolding (never instantiated) and is deleted in
// P2-1 along with the rest; the generator's output contract is rewritten in P1-6.
class Boards {
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

// const currentActiveBoard = new Boards()
const data = dominoBoardsData as unknown as BoardsResponse[];
function dayDiff(date1: Date, date2: Date) {
    const oneDay = 1000 * 60 * 60 * 24;
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.round((d2.getTime() - d1.getTime()) / oneDay);
}

const getCurrentActiveBoard = async (): Promise<BoardsResponse> => {
    const now = new Date()
    const differenceInDays = dayDiff(new Date(0), now)
    console.log('returning item no', differenceInDays % data.length, 'out of', data.length)
    return data[differenceInDays % data.length]
}

export default Boards
export {
    getCurrentActiveBoard
}