"use client"
import { useState } from 'react'
import { useStores } from '../hooks/useStore'
import { PuzzleSession, GRID_BORDER_PX, GUTTER_FRACTION } from '../stores/PuzzleSession'
import { definitionFrom } from '../stores/PuzzleDefinition'
import type { RootStore } from '../stores/RootStore'
import type { Cell } from '../stores/placement'
import ClientBoard from '../dominoFill/ClientBoard'
import CompletionCard from '../dominoFill/CompletionCard'
import GameControls from '../dominoFill/GameControls'
import DifficultySlider from '../dominoFill/DifficultySlider'
import LevelSelector from '../dominoFill/LevelSelector'
import { ArchiveButton, SoundButton } from '../dominoFill/PageButtons'

/**
 * Declared here and nowhere else in the repository (graphics spec P0-3, row 3).
 *
 * e2e/bundle.spec.ts searches the production build for these bytes and requires zero. It is
 * *rendered* -- not merely declared -- so that a build that does compile this module keeps
 * it, and the same search over the sheet's own build finds it: without that positive
 * control, "zero" could as easily mean a minifier dropped an unused string as that the
 * module was never compiled.
 */
export const SHEET_SENTINEL = 'domino-visual-sheet-5b8e21d4c7'

/** The board size every board specimen uses: the smallest that can show each state. */
const N = 2

type Fixture = {
    rocks?: Cell[]
    /** Column targets, then row targets, comma-separated as the corpus stores them. */
    columns: string
    rows: string
    /** Brings the session into the state the specimen exists to show. */
    arrange?: (session: PuzzleSession) => void
}

/**
 * A real session at exactly `cell` px.
 *
 * The cell is not set directly -- nothing in the app sets it directly either. The box is
 * built to fit exactly `cell`, with half a pixel of slack against `GUTTER_FRACTION` not
 * being exact in binary, the same way tests/pieceGeometry.test.tsx does it.
 */
const sessionAt = (root: RootStore, id: string, cell: number, fixture: Fixture) => {
    const board: (number | null)[][] = Array.from({ length: N }, () => Array(N).fill(null))
    for (const [i, j] of fixture.rocks ?? []) board[i][j] = -1
    const session = new PuzzleSession(definitionFrom({
        puzzleId: `visual-sheet-${id}`,
        board,
        boardHorizontalNumbers: fixture.columns,
        boardVerticalNumbers: fixture.rows,
    }), root)
    const px = cell * (N + GUTTER_FRACTION) + GRID_BORDER_PX + 0.5
    session.setAvailableBox({ width: px, height: px })
    fixture.arrange?.(session)
    return session
}

/**
 * One fixture per board specimen.
 *
 * Targets are chosen so that **only** the two target specimens show a line in a non-neutral
 * state: everywhere else every line is short of its target or incomplete. That is what lets
 * the sheet say "satisfied appears exactly once" of the whole page rather than of one box.
 * Pieces, both cell tones and neutral labels cannot be isolated the same way -- a satisfied
 * line needs something on it, and every board has squares of both tones -- so for those the
 * count is scoped to the specimen that exists to show them.
 */
const FIXTURES = {
    // Both checker tones and the neutral target, on nothing: (0,0) is the dark tone.
    empty: { columns: '1,1', rows: '1,1' },
    'domino-upright': {
        columns: '2,2', rows: '2,2',
        arrange: s => { s.placeToward([0, 0], 'down') },
    },
    'domino-flat': {
        columns: '2,2', rows: '3,3',
        arrange: s => { s.placeToward([0, 0], 'right') },
    },
    rock: { rocks: [[1, 1]], columns: '1,1', rows: '1,1' },
    // A column of two rocks is complete and sums to 0 -- satisfied with nothing placed.
    'target-satisfied': { rocks: [[0, 0], [1, 0]], columns: '0,2', rows: '2,2' },
    // An upright scores 1 in its column; a target of 0 makes that column over.
    'target-over': {
        columns: '0,2', rows: '2,2',
        arrange: s => { s.placeToward([0, 0], 'down') },
    },
    /*
     * A tap on a square with two legal directions leaves it pending, with both neighbours
     * as candidates -- the real verb, not a poked field. The tap also moves the keyboard
     * focus there, which is cleared so that focus is shown by its own specimen only.
     */
    anchor: {
        columns: '1,1', rows: '1,1',
        arrange: s => {
            s.pointerDown([0, 0])
            s.pointerUp([0, 0])
            s.setFocusedCell(null)
        },
    },
    // Two uprights is the only solution to these targets, so Hint has a square to name.
    hint: {
        columns: '1,1', rows: '2,0',
        arrange: s => { s.hint() },
    },
    focus: {
        columns: '1,1', rows: '1,1',
        arrange: s => { s.setFocusedCell([1, 1]) },
    },
} satisfies Record<string, Fixture>

type BoardSpecimen = keyof typeof FIXTURES

const BOARD_SPECIMENS = Object.keys(FIXTURES) as BoardSpecimen[]

/** One labelled box on the sheet. The label is for a person reading a baseline. */
const Specimen = ({ name, children }: { name: string, children: React.ReactNode }) => (
    <section data-specimen={name} aria-label={name} className='flex flex-col items-start gap-2'>
        <h2 className='text-xs font-mono opacity-60'>{name}</h2>
        {children}
    </section>
)

/**
 * The component sheet: every piece, cell, label, selection state and control, rendered by
 * the production components over fixtures (graphics spec P0-3, row 3).
 *
 * Nothing here depends on the date or on anything a player has stored about a day: the
 * boards are fixtures, not the day's puzzle, and they are never registered with the level
 * store, so nothing about them is saved. The one control that reads storage is Sound,
 * whose state is the player's mute preference -- a fresh browser shows "Sound on".
 */
const Sheet = ({ cell }: { cell: number }) => {
    const root = useStores()
    const [sessions] = useState(() => Object.fromEntries(BOARD_SPECIMENS.map(name =>
        [name, sessionAt(root, name, cell, FIXTURES[name])],
    )) as Record<BoardSpecimen, PuzzleSession>)

    // Controls act on a session of their own, so pressing one cannot change a specimen.
    const [controlSession] = useState(() =>
        sessionAt(root, 'controls', cell, { columns: '1,1', rows: '1,1' }))

    return (
        <main
            data-sheet={SHEET_SENTINEL}
            data-cell-size={cell}
            className='flex flex-wrap items-start gap-8 p-6 bg-background font-sans'
        >
            {BOARD_SPECIMENS.map(name => (
                <Specimen key={name} name={name}>
                    <ClientBoard boardsStore={sessions[name]} />
                </Specimen>
            ))}
            <Specimen name='completion-card'>
                <CompletionCard session={controlSession} levels={root.boardsStore} />
            </Specimen>
            <Specimen name='controls-game'>
                <GameControls boardsStore={controlSession} />
            </Specimen>
            <Specimen name='controls-difficulty'>
                <DifficultySlider boardsStore={root.boardsStore} />
            </Specimen>
            <Specimen name='controls-level'>
                <LevelSelector boardsStore={root.boardsStore} />
            </Specimen>
            <Specimen name='control-archive'>
                <ArchiveButton levels={root.boardsStore} />
            </Specimen>
            <Specimen name='control-sound'>
                <SoundButton sound={root.sound} />
            </Specimen>
        </main>
    )
}

export default Sheet
