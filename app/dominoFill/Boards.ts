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

/**
 * Days since the epoch for a `YYYY-MM-DD` key, or null if it is not one.
 *
 * Parsed as UTC so the arithmetic is calendar arithmetic. The key already *is* the caller's
 * local day; re-interpreting it in the server's zone would put the timezone back in.
 *
 * The round trip at the end is the whole validation, and it is stricter than it looks. A
 * shape check had been here as well, and mutation-testing showed it could be removed without
 * a single test noticing -- because anything the regex would reject fails to survive parsing
 * and reformatting anyway: `tomorrow` and `2026-09-15; DROP` parse to NaN, `2026-9-15` comes
 * back as `2026-09-15`, and `2026-13-01` comes back as `2027-01-01`. One check that is tested
 * beats two where only one does the work.
 */
const daysSinceEpoch = (dayKey: string): number | null => {
    const [year, month, day] = dayKey.split('-').map(Number)
    const time = Date.UTC(year, month - 1, day)
    if (Number.isNaN(time)) return null
    // Date.UTC normalises out-of-range parts (month 13 becomes January), so a key that does
    // not survive a round trip was never a real date.
    const normalised = new Date(time).toISOString().slice(0, 10)
    return normalised === dayKey ? Math.floor(time / 86_400_000) : null
}

/**
 * The day's puzzles, for the caller's own calendar day (spec P1-7).
 *
 * `dayKey` is passed in rather than taken from `new Date()` here, and that is the whole
 * point: this runs on the server, so its clock answers to the server's timezone. A player in
 * Auckland gets tomorrow's puzzle before their own midnight and a player in Los Angeles is
 * still on yesterday's for most of their morning — and the rollover check in the browser,
 * which is necessarily local, would disagree with the content it was refetching.
 *
 * The argument is untrusted input, so it is validated and falls back to the server's date
 * rather than being believed. The worst a bad key can do is select a different puzzle from a
 * fixed list, but "small blast radius" is not a reason to skip the check.
 */
const getCurrentActiveBoard = async (dayKey?: string): Promise<BoardsResponse> => {
    const fromClient = dayKey ? daysSinceEpoch(dayKey) : null
    const differenceInDays = fromClient ?? dayDiff(new Date(0), new Date())
    return data[((differenceInDays % data.length) + data.length) % data.length]
}

export default Boards
export {
    getCurrentActiveBoard
}