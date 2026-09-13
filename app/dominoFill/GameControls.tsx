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
 */

const GameControls: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore }) => (
    <div className="flex flex-row gap-2 text-xl">
        <button
            type="button"
            data-undo
            className="control-surface cursor-pointer px-4 py-2 rounded bg-[#ababab] disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => boardsStore.undo()}
            disabled={!boardsStore.canUndo}
        >
            Undo
        </button>
        <button
            type="button"
            data-reset
            className="control-surface cursor-pointer px-4 py-2 rounded bg-[#ababab]"
            onClick={() => boardsStore.reset()}
        >
            Reset
        </button>
    </div>
)

export default observer(GameControls)
