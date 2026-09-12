"use client"
import { LevelStore } from "./BoardsStore";
import { SizeStore } from "./SizeStore";

/**
 * The store graph.
 *
 * Deliberately NOT instantiated at module scope. `"use client"` marks a boundary, not a
 * runtime: this module is still evaluated during SSR, so a module-level instance would be
 * one store shared by every request in the server process, with undisposed reactions. It
 * is constructed per-mount in `StoreWrapper` instead.
 */
export class RootStore {
    boardsStore: LevelStore
    sizeStore: SizeStore
    constructor() {
        this.boardsStore = new LevelStore(this)
        this.sizeStore = new SizeStore(this)
    }
}
