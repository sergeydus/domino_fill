"use client"
import { LevelStore } from "./BoardsStore";
import { SizeStore } from "./SizeStore";
import { CorpusSource } from "./corpusSource";

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
    /**
     * Where puzzles come from (row 18d).
     *
     * On the graph rather than imported directly by the components that need it, so a test
     * can hand the whole app a corpus of its own without a module mock. Its caches are
     * per-instance for the same reason.
     */
    corpus: CorpusSource

    constructor(corpus: CorpusSource = new CorpusSource()) {
        this.corpus = corpus
        this.boardsStore = new LevelStore(this)
        this.sizeStore = new SizeStore(this)
    }
}
