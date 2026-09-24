import { useStores } from "@/app/hooks/useStore";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useState } from "react";
import ClientBoard from "./ClientBoard";
import { cn } from "../utils";
import { observer } from "mobx-react";
import { PuzzleSession } from "../stores/PuzzleSession";
import { definitionFrom } from "../stores/PuzzleDefinition";

/** Keeps the 2x2 board inside the modal instead of claiming the full board width. */
const TUTORIAL_BOARD_SIZE = 320;

const Tutorial = () => {
    const { boardsStore } = useStores();
    // The tutorial is a puzzle like any other, with its own frozen identity.
    const [tutorialBoard] = useState(() => {
        const session = new PuzzleSession(
            definitionFrom({
                puzzleId: 'tutorial-v1',
                board: [[null, null], [null, null]],
                boardHorizontalNumbers: '1,1',
                boardVerticalNumbers: '2,0',
            }),
            boardsStore.rootStore,
        );
        session.setMaxBoardSize(TUTORIAL_BOARD_SIZE);
        return session;
    });
    const [hasSeenTutorial, setHasSeenTutorial] = useLocalStorage('hasSeenTutorial', false);

    if (hasSeenTutorial) {
        return null
    }

    const dismiss = () => setHasSeenTutorial(true);
    const solved = tutorialBoard.completedByRules;

    return (
        // `fixed inset-0`, not `absolute w-full h-full`: with no positioned ancestor the
        // latter resolves against the initial containing block, which is the viewport-sized
        // box -- so it fails to cover a page that has scrolled or overflowed. `fixed` is
        // anchored to the viewport itself and cannot come apart from it.
        <div className="fixed inset-0 z-[999] backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
            <div className="bg-panel rounded-2xl text-panel-ink w-[min(100%,42rem)] p-6 sm:p-8 flex items-center justify-center flex-col gap-3">
                <h2 className="text-3xl font-bold mb-2">How to play</h2>

                {/*
                  The rule, stated correctly. This previously read "the numbers indicate how
                  many domino pieces should be placed in that row or column", which is not
                  the rule: the numbers are sums of pips, and the two orientations score
                  differently. A player following the old text was wrong on their first
                  board with no way to see why.
                */}
                <p>Cover every empty square with dominoes. Grey rocks are already filled and cannot be covered.</p>
                <p>
                    An <strong>upright</strong> domino is worth <strong>1</strong> in its top square
                    and <strong>0</strong> in its bottom one.
                </p>
                <p>
                    A <strong>flat</strong> domino is worth <strong>0</strong> in its left square
                    and <strong>2</strong> in its right one.
                </p>
                <p>
                    Each number around the edge is the <strong>total of the values</strong> in that
                    row or column — not a count of dominoes.
                </p>

                {/*
                  P0-9b: the input instructions, teaching the verb that actually shipped.
                  This previously read "Click the board to place a domino. Right-click to
                  switch between the two shapes" -- describing a mode that no longer
                  exists, and a right-click that never worked on a phone at all.
                */}
                <p className="mt-2">
                    <strong>Drag from a square toward the neighbour</strong> you want the domino to
                    cover. The direction you drag decides its shape and which way round it scores.
                </p>
                <p className="text-sm opacity-80">
                    Tapping a square places the only domino that fits; if more than one fits, tap
                    again on the square you want. Tap a domino to take it off. By keyboard: arrow
                    keys move, <kbd>Space</kbd> picks the square, then an arrow key places.
                    <kbd>Esc</kbd> cancels.
                </p>

                <p className="mt-2">Try it: fill this board so the top numbers and the side numbers both match.</p>
                <ClientBoard boardsStore={tutorialBoard} />

                <div className="mt-4 flex flex-row items-center gap-3">
                    <button
                        disabled={!solved}
                        onClick={dismiss}
                        className={cn(
                            "px-4 py-2 bg-tutorial-action text-on-tutorial-action rounded hover:bg-tutorial-action-hover cursor-pointer",
                            !solved && "opacity-50 cursor-not-allowed hover:bg-tutorial-action",
                        )}
                    >
                        Got it!
                    </button>
                    {/* Always available: the tutorial must never be able to trap a player
                        who cannot finish the 2x2, on any device. */}
                    <button
                        onClick={dismiss}
                        className="px-4 py-2 rounded underline cursor-pointer opacity-70 hover:opacity-100"
                    >
                        Skip
                    </button>
                </div>
            </div>
        </div>
    );
};

export default observer(Tutorial);
