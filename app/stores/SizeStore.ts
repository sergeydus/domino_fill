"use client"
import { makeAutoObservable } from "mobx"
import { RootStore } from "./RootStore"

export class SizeStore {
    rootStore: RootStore
    boardSize: number = 768 //default for hard
    hoverCords: [number, number] | null = null
    constructor(rootStore: RootStore) {
        this.rootStore = rootStore
        if (typeof window !== 'undefined') {
            window.onresize = () => {
                const vw = window.innerWidth / 100
                this.setBoardSize(Math.min(vw * 90, 768))
                // console.log('resize board size:', this.boardSize)
            }
            const vw = window.innerWidth / 100
            this.boardSize = Math.min(vw * 90, 768)
        }
        // console.log('SizeStore init', this.boardSize)
        makeAutoObservable(this)
    }
    // get pieceSize() {
    // }
    setBoardSize(size: number) {
        this.boardSize = size
    }
    setHoverCords(cords: [number, number] | null) {
        this.hoverCords = cords
    }
}