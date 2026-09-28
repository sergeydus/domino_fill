"use client"
import { makeAutoObservable } from "mobx"
import type { Piece } from "./placement"
import type { RootStore } from "./RootStore"

/**
 * Which controls the board answers to, and the piece held in Pick a piece mode
 * (NEXT-STEPS.md, PL1/PL2 and the implementation contract).
 *
 * **Drag** is the default and is SPEC P1-1's one verb: a drag, a tap or an arrow key names
 * a cell and a direction. **Pick a piece** is opt-in, as in Domino Fit: the player holds
 * one of the two pieces, and a tap or click places it wherever it can cover the cell.
 * Drags keep working in both modes, and in both they place what their direction makes.
 *
 * **The mode is remembered on the device; the held piece is not.** The held piece starts
 * upright and lasts for the session -- across puzzles and across switching the mode off and
 * on -- so returning to the mode returns the same piece. A piece remembered for days would
 * be exactly the forgotten state P1-1 removed.
 */

export type ControlMode = 'drag' | 'pick'

export const CONTROL_MODE_KEY = 'dominoFill.controls.v1'

/** The stored mode, defaulting to drag. Guarded as `SoundStore` guards its preference. */
const readMode = (): ControlMode => {
    if (typeof localStorage === 'undefined') return 'drag'
    try {
        return localStorage.getItem(CONTROL_MODE_KEY) === 'pick' ? 'pick' : 'drag'
    } catch {
        return 'drag'
    }
}

export class ControlStore {
    private readonly rootStore: RootStore
    mode: ControlMode
    held: Piece = 'upright'

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore
        // Safe at construction for the reason `SoundStore` gives: nothing that reads this
        // renders until `DominoClient`'s first effect has run, so SSR's 'drag' never meets a
        // hydrated 'pick'.
        this.mode = readMode()
        makeAutoObservable<ControlStore, 'rootStore'>(this, { rootStore: false })
    }

    /**
     * Switch the controls. Any gesture in progress is dropped on every board -- a pending
     * anchor from one mode means nothing in the other -- and the boards themselves are
     * untouched.
     */
    setMode(mode: ControlMode) {
        if (mode === this.mode) return
        this.mode = mode
        this.rootStore.boardsStore.cancelAllGestures()
        if (typeof localStorage === 'undefined') return
        try {
            localStorage.setItem(CONTROL_MODE_KEY, mode)
        } catch {
            // A mode that cannot be saved is still worth honouring for this session.
        }
    }

    toggleMode() {
        this.setMode(this.mode === 'pick' ? 'drag' : 'pick')
    }

    setHeld(piece: Piece) {
        this.held = piece
    }

    /** Right-click's action in Pick a piece mode: the other piece. */
    switchHeld() {
        this.held = this.held === 'upright' ? 'flat' : 'upright'
    }
}
