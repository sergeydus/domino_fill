import { observer } from "mobx-react"
import { PuzzleSession } from "../stores/PuzzleSession"
import { AnchorMark, CandidateMark, FocusMark, RefusedMark } from "./cellStates"

/**
 * The two pieces of state the new verb needs to show (spec P1-1): where the keyboard is,
 * and -- when a tap could not decide -- which neighbours it is offering.
 *
 * Drawn as an overlay rather than as props on every cell, so that moving the focus or
 * offering candidates re-renders two small boxes instead of all 36-64 squares.
 *
 * `pointer-events: none` throughout: this is feedback, never a hit target. The cells
 * underneath stay the things the browser hit-tests (P1-2).
 */
const Selection: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => {
    const size = boardsStore.squareSize
    const focused = boardsStore.focusedCell
    const candidates = boardsStore.candidateCells
    const anchor = boardsStore.pendingAnchor
    const refused = boardsStore.refusedAt

    const at = (i: number, j: number) => ({
        top: `${i * size}px`,
        left: `${j * size}px`,
        height: `${size}px`,
        width: `${size}px`,
    })

    /*
     * Each state is its own drawing (`cellStates.tsx`, graphics P1-5), in a box the size of
     * the cell. Above the pieces (z-30, the pieces are z-20), so the keyboard's brackets
     * stay visible over a placed domino.
     */
    return <>
        {/*
          * A refused move, until the next one (P1-6): the shake's static equivalent. First,
          * so the anchor's ring -- which a refused arrow keeps on the same square -- is
          * drawn over the cross's ends and stays whole.
          */}
        {refused && (
            <div
                data-refused={`${refused[0]},${refused[1]}`}
                className="z-30 pointer-events-none absolute"
                style={at(refused[0], refused[1])}
            ><RefusedMark /></div>
        )}
        {anchor && (
            <div
                data-anchor={`${anchor[0]},${anchor[1]}`}
                className="z-30 pointer-events-none absolute"
                style={at(anchor[0], anchor[1])}
            ><AnchorMark /></div>
        )}
        {candidates.map(([i, j]) => (
            <div
                key={`candidate_${i},${j}`}
                data-candidate={`${i},${j}`}
                className="z-30 pointer-events-none absolute"
                style={at(i, j)}
            ><CandidateMark /></div>
        ))}
        {/*
          * Where the keyboard is, always; its brackets only while focus is visible (P1-6,
          * row 12): after a press the square is still where the keyboard would carry on
          * from, but nobody is using a keyboard to be shown it. See `focusVisible`.
          */}
        {focused && (
            <div
                data-focus={`${focused[0]},${focused[1]}`}
                data-focus-visible={boardsStore.focusVisible || undefined}
                className="z-30 pointer-events-none absolute"
                style={at(focused[0], focused[1])}
            >{boardsStore.focusVisible && <FocusMark />}</div>
        )}
    </>
}

export default observer(Selection)
