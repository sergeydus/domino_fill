"use client"
import { observer } from "mobx-react"
import { PuzzleSession } from "../stores/PuzzleSession"

/**
 * Undo and Reset (spec P1-3).
 *
 * Reset is the escape hatch: until now there was no restart anywhere in the UI (D10-i), so
 * a mis-solve meant reloading the page, and a completed board -- which sets
 * `pointerEvents: none` -- was a permanent soft-lock (D10-h).
 *
 * **Undo gets a button, not only `Ctrl/Cmd+Z`.** The spec names the shortcut and nothing
 * else, but this game is built phone-first (P0-3) and a phone has no Ctrl key: a
 * keyboard-only undo is no undo at all for most of the people playing. Removal is instant,
 * silent and destructive, which is the reason P1-3 exists, and that is just as true under
 * a finger as under a cursor.
 *
 * Real `<button>` elements, deliberately. The level arrows next door are `motion.div`s with
 * an `onClick` -- unreachable by keyboard, invisible to assistive technology, and the
 * reason P1-1's "focus moves to the Next control on completion" had to be deferred. New
 * controls should not add to that pile.
 *
 * **Check and Hint (P1-5, row 18e).** Both are buttons for the same reason Undo is: the
 * game is phone-first and a shortcut is no affordance at all under a finger. Both are
 * disabled once the puzzle is finished, where neither has anything to say -- and a control
 * that answers "this is already done" is a control that wasted a press.
 *
 * Neither places a piece. Hint *reveals* a cell and leaves the move to the player, which is
 * what the spec asks for and also what keeps the guarantee simple: advice cannot corrupt a
 * board it never writes to, cannot desynchronise an undo stack it never pushes to, and
 * cannot save anything, because nothing it does is a change worth saving.
 */

const GameControls: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => (
    /*
     * Four controls, and they have to fit 360 CSS px (P0-3).
     *
     * Measured: at `text-xl` with `px-4`, adding Check and Hint took the row past the
     * viewport and the page scrolled sideways -- which the layout suite caught immediately.
     * Smaller type and tighter padding fit all four on one line at 360, and `flex-wrap` is
     * the belt: a longer word, a larger default font or a narrower device drops the row to
     * two rather than pushing the page off the side.
     */
    <div className="flex flex-row flex-wrap justify-center gap-2 text-base">
        <button
            type="button"
            data-check
            className="control-surface cursor-pointer px-3 py-2 rounded bg-[#ababab] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => boardsStore.check()}
            disabled={boardsStore.completed}
        >
            Check
        </button>
        <button
            type="button"
            data-hint
            className="control-surface cursor-pointer px-3 py-2 rounded bg-[#ababab] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => boardsStore.hint()}
            disabled={boardsStore.completed}
        >
            Hint
        </button>
        <button
            type="button"
            data-undo
            className="control-surface cursor-pointer px-3 py-2 rounded bg-[#ababab] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => boardsStore.undo()}
            disabled={!boardsStore.canUndo}
        >
            Undo
        </button>
        <button
            type="button"
            data-reset
            className="control-surface cursor-pointer px-3 py-2 rounded bg-[#ababab]"
            onClick={() => boardsStore.reset()}
        >
            Reset
        </button>
    </div>
)

export default observer(GameControls)
