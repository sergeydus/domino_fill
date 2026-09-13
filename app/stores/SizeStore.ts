"use client"
import { makeAutoObservable } from "mobx"
import { RootStore } from "./RootStore"

/** Widest the board is ever allowed to be, in CSS px, however large the screen is. */
const MAX_BOARD_PX = 768

/**
 * The fallback board size, used only until the page has been measured.
 *
 * The real budget comes from `useAvailableBoardBox`, which measures the viewport minus the
 * chrome around the board and hands it to the session (spec P0-3). This store exists for
 * the window between construction and that first measurement -- on the server, and on the
 * first client render, there is nothing to measure.
 *
 * It no longer installs a resize listener. `window.onresize =` clobbered any other
 * listener, was never removed, and ran unthrottled, so dragging a desktop window re-laid
 * out all 36-64 cells on every frame (spec D10-l). The hook owns resize now, coalesced to
 * one measurement per animation frame and cleaned up on unmount.
 */
export class SizeStore {
    rootStore: RootStore
    boardSize: number = MAX_BOARD_PX

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore
        if (typeof window !== 'undefined') {
            this.boardSize = Math.min(window.innerWidth * 0.9, MAX_BOARD_PX)
        }
        makeAutoObservable(this)
    }

    setBoardSize(size: number) {
        this.boardSize = size
    }
}
