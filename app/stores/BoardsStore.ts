"use client"
import { autorun, makeAutoObservable, reaction } from "mobx"
import { DominoLevel } from "../dominoFill/dominoBoard"
import { BoardsResponse } from "../dominoFill/Boards"
import { RootStore } from "./RootStore"
import { CurrentBoardStore } from "./CurrentBoardStore"

export class LevelStore {
    rootStore: RootStore
    difficulty: 'easy' | 'normal' | 'hard' = 'easy'
    level: 1 | 2 | 3 = 1
    selectedPiece: 1 | 2 = 1
    tutorial: DominoLevel = { board: [[null, null], [null, null]], boardHorizontalNumbers: '11', boardVerticalNumbers: '20', completed: false }
    easyBoards: DominoLevel[] | null = null
    mediumBoards: DominoLevel[] | null = null
    hardBoards: DominoLevel[] | null = null
    hasBegan: boolean = false
    hasSeenTutorial: boolean = false
    constructor(rootStore: RootStore) {
        this.rootStore = rootStore
        let audio: HTMLAudioElement | null = null
        if (typeof Audio != 'undefined') {
            audio = new Audio('winSilent.mp3')
        }
        // if (typeof window !== 'undefined') {
        //     this.boardWidth = window.innerWidth < 768 ? window.innerWidth : this.boardWidth
        // }
        if (typeof localStorage !== 'undefined') {
            this.hasSeenTutorial = localStorage.getItem('hasSeenTutorial') === 'true'
        }
        makeAutoObservable(this)
        autorun(() => {
            if (this.currentBoard && this.correctHorizontalValues?.join('') == this.currentBoard?.currentBoard.boardHorizontalNumbers
                && this.correctVerticalValues?.join('') == this.currentBoard?.currentBoard.boardVerticalNumbers
                && !this.currentBoard?.currentBoard.completed) {
                console.log('level complete')
                this.currentBoard.currentBoard.completed = true
                audio?.play()
            }
        })
        reaction(() => this.difficulty, () => {
            let boards: DominoLevel[] | null = null
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
            if (!boards) {
                return
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
    setBoards(boards: BoardsResponse) {
        this.easyBoards = boards.easyBoards
        this.mediumBoards = boards.mediumBoards
        this.hardBoards = boards.hardBoards
    }
    setHasSeenTutorial(seen: boolean) {
        this.hasSeenTutorial = seen
    }
    setLevel(level: 1 | 2 | 3) { this.level = level }
    setDifficulty(dif: 'easy' | 'normal' | 'hard') { this.difficulty = dif }
    setSelectedPiece(piece: 1 | 2) { this.selectedPiece = piece }
    get currentBoard() {
        console.log('get currentBoard recalculated', this.difficulty, this.level)
        // console.log('get currentBoard', this.difficulty, this.level, JSON.stringify({ easyboards: this.easyBoards, mediumBoards: this.mediumBoards, hardBoards: this.hardBoards }))
        let board: DominoLevel | null = null
        if (!this.easyBoards || !this.mediumBoards || !this.hardBoards) {
            return null
        }
        // if (!this.hasSeenTutorial) {
        //     return new CurrentBoardStore(this.tutorial, this.rootStore)
        // }
        switch (this.difficulty) {
            case 'easy': board = this.easyBoards[this.level - 1]; break;
            case 'normal': board = this.mediumBoards[this.level - 1]; break;
            case 'hard': board = this.hardBoards[this.level - 1]; break;
            default: board = this.easyBoards[this.level - 1];
        }
        console.log('new currentBoard...')
        return new CurrentBoardStore(board, this.rootStore)
        // return board
    }
    get correctHorizontalValues() {
        return this.currentBoard?.correctHorizontalValues
    }
    get correctVerticalValues() {
        return this.currentBoard?.correctVerticalValues
    }
}