"use client"
import { LevelStore } from "./BoardsStore";
import { SizeStore } from "./SizeStore";
// import { TutorialStore } from "./TutorialStore";
export class RootStore {
    boardsStore: LevelStore
    sizeStore: SizeStore
    constructor() {
        this.boardsStore = new LevelStore(this)
        this.sizeStore = new SizeStore(this)
        // this.tutorialStore = new TutorialStore()
    }
}
const root = new RootStore()
export const rootStore = {
    rootStore: root,
    boardsStore: root.boardsStore,
    sizeStore: root.sizeStore,
    // tutorialStore: new TutorialStore(),
    // currentBoardStore: new BoardsStore(),
};