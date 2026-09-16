"use client"
import { makeAutoObservable, observable, reaction } from "mobx"
import { BoardsResponse } from "../dominoFill/Boards"
import { RootStore } from "./RootStore"
import { PuzzleSession } from "./PuzzleSession"
import { PuzzleDefinition, StoredPuzzle, definitionFrom } from "./PuzzleDefinition"
import { winFeedback } from "../dominoFill/feedback"
import {
    PuzzleProgress, isExpired, migrateLegacy, progressFor, pruneStorage, readAllProgress,
    writeProgress,
} from "./progressStorage"

type Difficulty = 'easy' | 'normal' | 'hard'
type Level = 1 | 2 | 3

/** A session's saved state before it is stamped with a time. See `persist`. */
type SessionSnapshot = Omit<PuzzleProgress, 'savedAt'>

/**
 * Only the records still inside the retention window.
 *
 * Retention is a rule about which saves count, not only about which files exist. Deletion can
 * fail -- storage refuses `removeItem` in the same conditions it refuses `setItem` -- and a
 * record can arrive from the v1 migration after the deletion pass has already run. Either way
 * the answer has to be the same, so the filter is applied to what is about to be used rather
 * than trusted to have happened.
 */
const live = (records: Record<string, PuzzleProgress>, now: number) =>
    Object.fromEntries(
        Object.entries(records).filter(([, record]) => !isExpired(record.savedAt, now)))

/** Whether two saved forms of a puzzle say the same thing. */
const sameProgress = (a: SessionSnapshot, b: SessionSnapshot) =>
    a.completed === b.completed
    && a.definitionHash === b.definitionHash
    && a.board.length === b.board.length
    && a.board.every((row, i) => row.every((cell, j) => cell === b.board[i][j]))

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
     * Saved progress as read at load (spec P1-7).
     *
     * Only ever used to restore sessions. Writes go straight to the puzzle's own key, so this
     * is never written back as a whole and cannot go stale in a way that costs anything.
     */
    saved: Record<string, PuzzleProgress> = {}

    /** Disposer for the persistence reaction; also the flag for "already started". */
    disposePersist: (() => void) | null = null

    /**
     * This store's own last view of each session, which is how it knows what *it* changed.
     *
     * Not the same question as "does storage disagree with me". Another tab may have written
     * a puzzle since; that is its business, and writing this store's stale copy over it is
     * precisely the bug. Only a puzzle that moved *here* is a puzzle this store may save.
     */
    lastSaved: Record<string, SessionSnapshot> = {}

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
            // view derives from, and making the records observable would deep-convert every
            // saved board into a proxy for no reader's benefit.
            saved: false,
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
        /*
         * A v1 document, if this browser still has one, becomes v2 records before anything
         * reads them. Retention then runs at load rather than waiting for the next move --
         * otherwise it never runs at all for the player who has stopped playing, which is
         * exactly whose data is sitting there.
         *
         * The migration hands back what the old document held, and it fills the gaps in what v2
         * actually contains. That matters when storage is refusing writes: the records could
         * not be saved in the new format, but the boards are still the player's and should
         * still be on screen.
         *
         * The two cannot disagree, and mutation-testing says so: `migrateLegacy` skips any
         * puzzle that already has a v2 record, so a key present in both was written by this
         * very call and holds the same thing. Reversing the spread changes nothing. It is
         * written v2-last because that is the invariant a reader should take away -- a v2
         * record is always the authority -- not because the order is doing work.
         *
         * `live` is what actually enforces retention. `pruneStorage` deletes, which is a
         * best-effort physical act: it can be refused, and it runs *before* the migrated
         * records are merged in, so without this filter an abandoned board from months ago
         * came straight back onto the screen having just been deleted.
         */
        const now = Date.now()
        const fromLegacy = migrateLegacy(now)
        pruneStorage(now)
        this.saved = live({ ...fromLegacy, ...readAllProgress() }, now)
        this.reconcileSessions(definitions)

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
        // The baseline for "what changed here": everything as hydrated. Without it the first
        // save would write all nine puzzles, eight of them empty boards nobody has touched.
        this.lastSaved = this.progressSnapshot
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
     * snapshot on a move costs less than the bookkeeping would.
     */
    get progressSnapshot(): Record<string, SessionSnapshot> {
        const snapshot: Record<string, SessionSnapshot> = {}
        // Driven by what is *served*, not by what happens to be in the Map. A session that
        // outlived its puzzle must not write itself back -- that is how a pruned record
        // returns from the dead with a fresh timestamp.
        for (const definition of this.servedDefinitions) {
            const session = this.sessions.get(definition.puzzleId)
            if (!session) continue
            snapshot[definition.puzzleId] = {
                definitionHash: session.definition.definitionHash,
                ...session.snapshot,
            }
        }
        return snapshot
    }

    /**
     * Save the sessions that have changed here.
     *
     * Two decisions worth stating, because both look like extra work until the alternative is
     * spelled out.
     *
     * **Only what changed, and only what is served.** Today's nine are not every puzzle that
     * exists -- the data file cycles -- and a record for a day that is not being served right
     * now still belongs to a player who may come back to it. Retention is the only thing
     * allowed to drop one.
     *
     * **One key per puzzle, so a write touches nothing else.** Two tabs are ordinary -- a
     * phone restoring a session, a desktop with the game pinned -- and with a single shared
     * document each would read it, change its own puzzle, and write the whole thing back,
     * losing whatever the other had saved in between. Writing only the puzzle's own key
     * removes that entirely rather than narrowing it: there is no read-modify-write across
     * puzzles left to interleave.
     *
     * **`savedAt` is stamped only on a record that actually changed.** It means "when this
     * puzzle last moved", not "when the app was last open". Restamping everything on every
     * write would make retention meaningless: a player who opens the game daily would keep
     * every puzzle they had ever been served alive forever, which is exactly the unbounded
     * growth the window exists to stop.
     */
    persist(snapshot: Record<string, SessionSnapshot>) {
        const savedAt = Date.now()
        for (const [puzzleId, next] of Object.entries(snapshot)) {
            const mine = this.lastSaved[puzzleId]
            // Unchanged here since this store last looked, so whatever storage holds for it
            // belongs to someone else and is left exactly as it is.
            if (mine && sameProgress(mine, next)) continue
            writeProgress(puzzleId, { ...next, savedAt })
        }
        this.lastSaved = snapshot
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
     * a player's in-progress board. Puzzles still being served keep their session and its
     * moves; only the ones this response has stopped serving are retired, which is the
     * "separate, intentional act" this comment used to defer to and which P1-7 now provides.
     */
    /** Every definition served right now, across all three difficulties. */
    get servedDefinitions(): PuzzleDefinition[] {
        return [...this.easyBoards ?? [], ...this.mediumBoards ?? [], ...this.hardBoards ?? []]
    }

    reconcileSessions(definitions: PuzzleDefinition[]) {
        /*
         * Sessions for puzzles that are no longer served are dropped.
         *
         * Two things go wrong without this, and both only show up over days rather than in a
         * single sitting. The Map grows by nine sessions every rollover in a tab that is never
         * closed -- unbounded once P1-6 mints a unique id per day. And because the snapshot
         * used to walk every session, a record that retention had just deleted came *back* on
         * the player's next move, stamped with today, so it could never age out at all.
         *
         * Nothing is lost by dropping them: the position is in storage, and a session is only
         * a live view of it. Whether the player can still reach that puzzle is a separate
         * question, and an open one -- see the rollover note in SPEC, deferred to row 18's
         * archive.
         */
        const served = new Set(definitions.map(d => d.puzzleId))
        for (const puzzleId of [...this.sessions.keys()]) {
            if (!served.has(puzzleId)) this.sessions.delete(puzzleId)
        }

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
            const saved = progressFor(this.saved[definition.puzzleId], definition)
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
