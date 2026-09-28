"use client"
import { makeAutoObservable } from "mobx"

/**
 * Whether the game makes a sound, remembered between visits (spec P2-4, row 20d).
 *
 * A daily puzzle is played in the places people have a spare minute — a train, a queue, a
 * meeting they should be paying attention to — so a game that cannot be silenced is a game
 * that gets closed rather than muted. The setting has to persist for the same reason: one
 * that resets every morning is one the player has to find again every morning.
 *
 * **Muting silences audio and leaves haptics alone**, deliberately. On iOS the hardware
 * mute switch already kills the entire audio channel, which is exactly why P1-5 treats
 * vibration as the real feel budget; taking that away too would leave a muted player with
 * no feedback for a refused move at all.
 */

export const MUTE_KEY = 'dominoFill.muted.v1'

/**
 * Read the stored preference, defaulting to sound on.
 *
 * Every access is guarded: `localStorage` is absent during SSR, and *throws* rather than
 * returning null in a Safari private window and wherever site data is blocked — which is
 * the same lesson `progressStorage` records.
 */
const readMuted = (): boolean => {
    if (typeof localStorage === 'undefined') return false
    try {
        return localStorage.getItem(MUTE_KEY) === 'true'
    } catch {
        return false
    }
}

export class SoundStore {
    muted: boolean

    constructor() {
        /*
         * Read at construction, which is safe here and would not be everywhere.
         *
         * `RootStore` is built inside a client component, so this also runs during SSR --
         * where the guard above returns `false` and the client would then hydrate `true`.
         * That would be a mismatch if the control rendered during hydration, and it does
         * not: `DominoClient` renders a loading state until an effect has run, so nothing
         * that reads this exists in the first client render.
         */
        this.muted = readMuted()
        makeAutoObservable(this)
    }

    setMuted(muted: boolean) {
        this.muted = muted
        if (typeof localStorage === 'undefined') return
        try {
            localStorage.setItem(MUTE_KEY, String(muted))
        } catch {
            // A preference that cannot be saved is still worth honouring for this session.
        }
    }

    toggle() {
        this.setMuted(!this.muted)
    }
}
