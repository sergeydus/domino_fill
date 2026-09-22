// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runInAction } from 'mobx'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom, type StoredPuzzle } from '@/app/stores/PuzzleDefinition'
import { SOUND_FILES, preloadSounds, resetSoundsForTest } from '@/app/dominoFill/feedback'

/**
 * Which sound a win makes (spec P1-4).
 *
 * The repository shipped `win.mp3` and `winSilent.mp3` side by side and referenced only the
 * silent one, so winning made no sound whatever — which, with the board going inert and
 * nothing appearing on screen, is the whole of why the game seemed to *freeze* at the
 * moment it should celebrate.
 *
 * Worth a test of its own because it is invisible: every other assertion in the suite passes
 * identically whichever file is named, so swapping back to the silent one is a regression
 * nothing else can see. (Found by mutation — the swap passed all 314 other tests.)
 */

type AudioCall = { src: string, played: number }

let constructed: AudioCall[]
let originalAudio: typeof globalThis.Audio

const puzzle = (overrides: Partial<StoredPuzzle> = {}): StoredPuzzle => ({
    puzzleId: 'sound-test',
    board: [[null, -1], [null, -1]],
    boardHorizontalNumbers: '1,0',
    boardVerticalNumbers: '1,0',
    ...overrides,
} as StoredPuzzle)

beforeEach(() => {
    // The pool is module state and outlives a test file's `beforeEach` otherwise, so one
    // test's elements would be reused by the next and nothing would be constructed at all.
    resetSoundsForTest()
    // The mute preference is persisted (P2-4), so a test that sets it would otherwise
    // hand the next one a muted store and a silent win.
    localStorage.clear()
    constructed = []
    originalAudio = globalThis.Audio
    // A recording stand-in, so the file the store asks for is observable. jsdom's own
    // Audio cannot play anyway; see tests/setup.ts.
    globalThis.Audio = vi.fn().mockImplementation((src: string) => {
        const call: AudioCall = { src, played: 0 }
        constructed.push(call)
        return { play: () => { call.played++ }, src }
    }) as unknown as typeof globalThis.Audio
})

afterEach(() => { globalThis.Audio = originalAudio })

describe('the win sound', () => {
    it('is win.mp3, not the silent file that shipped beside it', () => {
        /*
         * Asserted against the pool's own table rather than against what a constructor
         * happened to build (spec P2-4, row 20d). The element used to be created in
         * `LevelStore`'s constructor and first played minutes later -- the exact shape iOS
         * refuses -- so it is created by the pool on demand now, and `preloadSounds` is
         * what asks for it up front.
         */
        preloadSounds()

        expect(constructed.map(c => c.src)).toContain('/win.mp3')
        expect(constructed.map(c => c.src)).not.toContain('winSilent.mp3')
    })

    it('is addressed absolutely, so it resolves from any route', () => {
        // `new Audio('win.mp3')` resolves against the document's URL and 404s anywhere but
        // the root. The repository shipped a second route until row 20a.
        for (const file of Object.values(SOUND_FILES)) expect(file).toMatch(/^\//)
    })

    it('is silent when the player has muted the game', () => {
        /*
         * The win is the one sound played from a store reaction rather than from an input
         * handler, so it has its own path to the mute preference and its own way to miss
         * it. Found by mutation: hardcoding `winFeedback(false)` passed everything else.
         */
        const root = new RootStore()
        root.sound.setMuted(true)

        const definition = definitionFrom(puzzle())
        const session = new PuzzleSession(definition, root)
        runInAction(() => {
            root.boardsStore.sessions.set(definition.puzzleId, session)
            root.boardsStore.easyBoards = [definition]
            root.boardsStore.setDifficulty('easy')
            root.boardsStore.setLevel(1)
        })

        runInAction(() => { session.placeToward([0, 0], 'down') })

        expect(session.completed, 'the board was still solved').toBe(true)
        expect(constructed.reduce((n, c) => n + c.played, 0), 'no sound was played').toBe(0)
    })

    it('plays when a board is actually solved', () => {
        // Through the real completion path: the reaction watches `completedByRules`, so the
        // board is solved by placing a domino rather than by setting a flag.
        const root = new RootStore()
        const definition = definitionFrom(puzzle())
        const session = new PuzzleSession(definition, root)

        runInAction(() => {
            root.boardsStore.sessions.set(definition.puzzleId, session)
            root.boardsStore.easyBoards = [definition]
            root.boardsStore.setDifficulty('easy')
            root.boardsStore.setLevel(1)
        })

        const before = constructed.reduce((n, c) => n + c.played, 0)
        runInAction(() => { session.placeToward([0, 0], 'down') })

        expect(session.completedByRules, 'the fixture is solvable').toBe(true)
        expect(session.completed, 'the reaction flagged it').toBe(true)
        expect(constructed.reduce((n, c) => n + c.played, 0)).toBe(before + 1)
    })
})
