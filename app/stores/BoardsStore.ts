"use client"
import { makeAutoObservable, observable, reaction } from "mobx"
import { BoardsResponse } from "../dominoFill/Boards"
import { RootStore } from "./RootStore"
import { PuzzleSession } from "./PuzzleSession"
import { PuzzleDefinition, StoredPuzzle, definitionFrom } from "./PuzzleDefinition"

type Difficulty = 'easy' | 'normal' | 'hard'
type Level = 1 | 2 | 3

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

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore
        let audio: HTMLAudioElement | null = null
        if (typeof Audio != 'undefined') {
            audio = new Audio('winSilent.mp3')
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
            },
        )
    }

    setBoards(boards: BoardsResponse) {
        const build = (list: StoredPuzzle[]) => list.map(definitionFrom)

        this.easyBoards = build(boards.easyBoards)
        this.mediumBoards = build(boards.mediumBoards)
        this.hardBoards = build(boards.hardBoards)

        this.reconcileSessions([
            ...this.easyBoards, ...this.mediumBoards, ...this.hardBoards,
        ])
    }

    /**
     * Reconcile live sessions against incoming definitions, by puzzleId.
     *
     * Deliberately NOT a clear-and-rebuild: a duplicate effect or a refetch would then wipe
     * a player's in-progress board. Obsolete entries are left alone; expiring them is a
     * separate, intentional act (day rollover).
     */
    private reconcileSessions(definitions: PuzzleDefinition[]) {
        for (const definition of definitions) {
            const existing = this.sessions.get(definition.puzzleId)
            if (existing && existing.definition.definitionHash === definition.definitionHash) {
                continue // same puzzle, same content: keep the session and its moves
            }
            // New puzzle, or the content changed under a reused id: start a fresh session.
            this.sessions.set(definition.puzzleId, new PuzzleSession(definition, this.rootStore))
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
