"use client"
import { makeAutoObservable, observable, reaction } from "mobx"
import { BoardsResponse } from "../dominoFill/Boards"
import { RootStore } from "./RootStore"
import { PuzzleSession } from "./PuzzleSession"
import { PuzzleDefinition, StoredPuzzle, definitionFrom } from "./PuzzleDefinition"
import { winFeedback } from "../dominoFill/feedback"
import {
    ProgressDocument, PuzzleProgress, dayKey, emptyDocument, progressFor, prune,
    readDocument, writeDocument,
} from "./progressStorage"

type Difficulty = 'easy' | 'normal' | 'hard'
type Level = 1 | 2 | 3

/** A session's saved state before it is stamped with a day. See `persist`. */
type SessionSnapshot = Omit<PuzzleProgress, 'savedOn'>

/** Whether a saved record already says what the live session says. */
const sameProgress = (saved: PuzzleProgress, live: SessionSnapshot) =>
    saved.completed === live.completed
    && saved.definitionHash === live.definitionHash
    && saved.board.length === live.board.length
    && saved.board.every((row, i) => row.every((cell, j) => cell === live.board[i][j]))

export class LevelStore {
    rootStore: RootStore
    difficulty: Difficulty = 'easy'
    level: Level = 1
    hasBegan: boolean = false

    /** Immutable puzzle content, by difficulty. */
    easyBoards: PuzzleDefinition[] | null = null
    mediumBoards: PuzzleDefinition[] | null = null
    hardBoards: PuzzleDefinition[] | null = null

    /**
     * One live session per puzzleId. Populated eagerly in `setBoards` (an action) so that
     * `currentBoard` can be a pure lookup: constructing a store inside a computed makes
     * MobX throw once side effects in derivations are enforced, and hands back a new
     * identity on every cache miss.
     */
    sessions = new Map<string, PuzzleSession>()

    /**
     * Saved progress as last read or written (spec P1-7).
     *
     * Held so a write does not have to re-read storage, and so records for puzzles that are
     * not currently served survive a save -- they belong to a player who may come back to
     * them, and only `prune` may drop one.
     */
    document: ProgressDocument = emptyDocument()

    /** Disposer for the persistence reaction; also the flag for "already started". */
    disposePersist: (() => void) | null = null

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore
        // `win.mp3`, not `winSilent.mp3` (spec P1-4). The silent file shipped alongside a
        // real one that was never referenced, so winning made no sound at all -- which,
        // together with the board going inert, is why the game appeared to *freeze* at the
        // moment it should celebrate.
        let audio: HTMLAudioElement | null = null
        if (typeof Audio != 'undefined') {
            audio = new Audio('win.mp3')
        }
        // Definitions are frozen value objects: observe the *reference*, never the
        // contents. Deep conversion would replace each frozen definition with an
        // observable copy, silently undoing definitionFrom's immutability guarantee.
        // `sessions` is shallow for the same reason -- the sessions inside are already
        // observable, and the Map only needs to track membership.
        makeAutoObservable(this, {
            easyBoards: observable.ref,
            mediumBoards: observable.ref,
            hardBoards: observable.ref,
            sessions: observable.shallow,
            // Plain data on its way to and from JSON, and a disposer. Neither is state the
            // view derives from, and making the document observable would deep-convert every
            // saved board into a proxy for no reader's benefit.
            document: false,
            disposePersist: false,
        })

        // A focused reaction, not an autorun: it tracks exactly one derived value -- the
        // session that has just become solved but is not yet flagged -- and the effect runs
        // outside the derivation, so writing `completed` cannot feed back into tracking.
        //
        // It yields the session rather than a boolean so the effect acts on the session the
        // derivation actually saw, instead of re-reading `currentBoard` and risking acting
        // on a different one. (A boolean would behave the same today: the effect flips
        // `completed` synchronously, so the expression always settles back to false between
        // boards. This is about not depending on that timing.)
        //
        // No `fireImmediately`: `currentBoard` is necessarily null here -- boards arrive via
        // `setBoards` long after construction -- so it would only invoke the effect once with
        // null. A board that arrives already solved is picked up by the ordinary
        // null -> session transition.
        reaction(
            () => {
                const session = this.currentBoard
                return session && session.completedByRules && !session.completed
                    ? session
                    : null
            },
            (session) => {
                if (!session) return
                session.setCompleted(true)
                audio?.play()
                // Haptics are not decoration: the hardware mute switch silences the whole
                // audio channel on iOS, so for many players this is the only feel budget
                // there is (spec P1-5).
                winFeedback()
            },
        )
    }

    setBoards(boards: BoardsResponse) {
        const build = (list: StoredPuzzle[]) => list.map(definitionFrom)
        const before = this.currentDefinition?.puzzleId ?? null

        this.easyBoards = build(boards.easyBoards)
        this.mediumBoards = build(boards.mediumBoards)
        this.hardBoards = build(boards.hardBoards)

        const definitions = [...this.easyBoards, ...this.mediumBoards, ...this.hardBoards]

        /*
         * Saved progress is read *before* the sessions are built, which is the sequencing
         * P1-7 warns about: `reconcileSessions` constructs a session by cloning the
         * definition's empty board, so a session created first and hydrated afterwards has a
         * window in which the empty board is the live one. Doing it in this order means a
         * restored session is never observed empty.
         */
        const loaded = readDocument()
        this.document = prune(loaded, dayKey(new Date()))
        this.reconcileSessions(definitions)
        // Written back at once when anything aged out. Retention that only takes effect
        // after the player's next move is retention that never runs for the player who
        // stops playing -- which is precisely whose data is sitting there.
        if (Object.keys(this.document.puzzles).length !== Object.keys(loaded.puzzles).length) {
            writeDocument(this.document)
        }

        /*
         * Land on the first unsolved puzzle (D10-i's remaining half).
         *
         * Only when the puzzle under the player actually changed -- the first load, or a day
         * rollover that served different content. A refetch that returns the same day must
         * not move them, and neither must one that arrives while they are mid-board: this is
         * a starting position, not a rule about where they are allowed to be.
         */
        if (before === null || before !== this.currentDefinition?.puzzleId) {
            this.selectFirstUnsolved()
        }
        this.beginPersisting()
    }

    /**
     * Start saving, once.
     *
     * An earlier version of this comment claimed the placement was load-bearing -- that a
     * reaction created in the constructor would fire with `sessions` empty and flatten a real
     * save. Mutation-tested, and it is **not** true: a `reaction` does not run its effect on
     * creation, and `setBoards` is a MobX action, so the whole hydrate-and-reconcile runs in
     * one batch and the effect fires afterwards with the document already loaded. Moving this
     * call to the constructor, or above `readDocument`, breaks nothing.
     *
     * What actually protects the saved data is that `persist` *merges* rather than replaces,
     * which `keeps records for puzzles this day does not serve` pins. This stays here because
     * it is the clearest place to read -- saving begins when there is something to save -- not
     * because the order is doing hidden work.
     */
    beginPersisting() {
        if (this.disposePersist) return
        this.disposePersist = reaction(
            () => this.progressSnapshot,
            (snapshot) => this.persist(snapshot),
        )
    }

    /**
     * Every session's saved form, as one value.
     *
     * A single computed rather than a reaction per session: sessions come and go on a day
     * rollover, and a per-session subscription would have to be disposed in step with them.
     * Nine boards of at most 64 small cells is a few kilobytes, so rebuilding the whole
     * document on a move costs less than the bookkeeping would.
     */
    get progressSnapshot(): Record<string, SessionSnapshot> {
        const snapshot: Record<string, SessionSnapshot> = {}
        for (const [puzzleId, session] of this.sessions) {
            snapshot[puzzleId] = {
                definitionHash: session.definition.definitionHash,
                ...session.snapshot,
            }
        }
        return snapshot
    }

    /**
     * Merge the live sessions into the document and write it.
     *
     * Two decisions worth stating, because both look like extra work until the alternative is
     * spelled out.
     *
     * **Merged, not replaced.** Today's nine are not every puzzle that exists -- the data file
     * cycles -- so replacing the document would delete a half-finished board belonging to a
     * day that is not being served right now. `prune` is the only thing allowed to drop a
     * record.
     *
     * **`savedOn` is stamped only on a record that actually changed.** It means "when this
     * puzzle last moved", not "when the app was last open". Restamping everything on every
     * write would make retention meaningless: a player who opens the game daily would keep
     * every puzzle they had ever been served alive forever, which is exactly the unbounded
     * growth the window exists to stop.
     */
    persist(snapshot: Record<string, SessionSnapshot>) {
        const today = dayKey(new Date())
        const puzzles = { ...this.document.puzzles }
        for (const [puzzleId, next] of Object.entries(snapshot)) {
            const previous = puzzles[puzzleId]
            if (previous && sameProgress(previous, next)) continue
            puzzles[puzzleId] = { ...next, savedOn: today }
        }
        this.document = { version: this.document.version, puzzles }
        writeDocument(this.document)
    }

    /**
     * Point at the first puzzle of this difficulty the player has not finished.
     *
     * The last one when every level is done, rather than level 1: arriving at a finished day
     * should show where the player got to, not send them back to a board they solved.
     */
    selectFirstUnsolved() {
        const definitions = this.definitionsFor(this.difficulty)
        if (!definitions || definitions.length === 0) return
        const index = definitions.findIndex(d => !this.sessions.get(d.puzzleId)?.completed)
        this.setLevel((index === -1 ? definitions.length : index + 1) as Level)
    }

    /**
     * Reconcile live sessions against incoming definitions, by puzzleId.
     *
     * Deliberately NOT a clear-and-rebuild: a duplicate effect or a refetch would then wipe
     * a player's in-progress board. Obsolete entries are left alone; expiring them is a
     * separate, intentional act (day rollover).
     */
    reconcileSessions(definitions: PuzzleDefinition[]) {
        for (const definition of definitions) {
            const existing = this.sessions.get(definition.puzzleId)
            if (existing && existing.definition.definitionHash === definition.definitionHash) {
                continue // same puzzle, same content: keep the session and its moves
            }
            // New puzzle, or the content changed under a reused id: start a fresh session.
            const session = new PuzzleSession(definition, this.rootStore)
            // A saved board, but only if it is still a board of *this* puzzle. `progressFor`
            // owns that judgement -- hash, size and rock positions -- so there is no path
            // that restores without it.
            const saved = progressFor(this.document, definition)
            if (saved) session.restore(saved)
            this.sessions.set(definition.puzzleId, session)
        }
    }

    private definitionsFor(difficulty: Difficulty): PuzzleDefinition[] | null {
        switch (difficulty) {
            case 'easy': return this.easyBoards
            case 'normal': return this.mediumBoards
            case 'hard': return this.hardBoards
            default: return this.easyBoards
        }
    }

    setLevel(level: Level) { this.level = level }

    /** Whether there is a further level in this difficulty; drives the Next affordance. */
    get hasNextLevel() {
        return this.level < 3
    }

    /**
     * Advance to the next level, if there is one. Returns whether it moved.
     *
     * The session for the level just finished is untouched: P0-5 keeps one per `puzzleId`,
     * so coming back returns the same board with the same moves, still completed.
     */
    goToNextLevel(): boolean {
        if (!this.hasNextLevel) return false
        this.setLevel((this.level + 1) as Level)
        return true
    }

    setDifficulty(dif: Difficulty) {
        this.difficulty = dif
        // Land on the first unsolved level of the new difficulty, or the last if all are done.
        const definitions = this.definitionsFor(dif)
        if (!definitions) return
        const index = definitions.findIndex(d => !this.sessions.get(d.puzzleId)?.completed)
        this.setLevel((index === -1 ? 3 : index + 1) as Level)
    }

    get currentDefinition(): PuzzleDefinition | null {
        return this.definitionsFor(this.difficulty)?.[this.level - 1] ?? null
    }

    /** Pure lookup: no construction, no mutation. */
    get currentBoard(): PuzzleSession | null {
        const definition = this.currentDefinition
        if (!definition) return null
        return this.sessions.get(definition.puzzleId) ?? null
    }

    get currentColumnSums() { return this.currentBoard?.currentColumnSums }
    get currentRowSums() { return this.currentBoard?.currentRowSums }
}
