"use client"
import { LevelStore } from "./BoardsStore";
import { SizeStore } from "./SizeStore";
import { CorpusSource } from "./corpusSource";
import { SoundStore } from "./SoundStore";
import { ControlStore } from "./ControlStore";
import { ChallengeCoordinator, type CoordinatorOptions } from '../challenge/coordinator';

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
    /** The persisted mute preference (spec P2-4, row 20d). */
    sound: SoundStore
    /** The control mode, remembered, and the piece held in Pick a piece mode. */
    controls: ControlStore
    readonly challenge: ChallengeCoordinator | null

    constructor(corpus: CorpusSource = new CorpusSource(), options: { challenge?: boolean, coordinator?: Partial<CoordinatorOptions> } = {}) {
        this.corpus = corpus
        this.sound = new SoundStore()
        this.controls = new ControlStore(this)
        this.boardsStore = new LevelStore(this)
        this.sizeStore = new SizeStore(this)
        this.challenge = options.challenge ? new ChallengeCoordinator({
            loadDay: date => this.corpus.loadDay(date),
            hydrated: id => { this.boardsStore.lastSaved[id] = this.boardsStore.progressSnapshot[id] },
            initialized: () => this.boardsStore.selectFirstUnsolved(),
            ...options.coordinator,
        }) : null
    }

    start() { return this.challenge?.start() }
    dispose() { this.challenge?.dispose() }
}
