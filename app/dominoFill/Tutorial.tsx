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
        // latter resolves against the initial containing block and covers only the first
        // viewport, while the page is currently two viewports tall.
        <div className="fixed inset-0 z-[999] backdrop-blur-sm flex items-center justify-center p-4 overflow-auto">
            <div className="bg-white rounded-2xl text-black w-[min(100%,42rem)] p-6 sm:p-8 flex items-center justify-center flex-col gap-3">
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

                {/* Input instructions describe the current mouse-only model; P0-9b rewrites
                    them alongside P1-1's unified pointer/touch/keyboard verb. */}
                <p className="text-sm opacity-80">Click the board to place a domino. Right-click to switch between the two shapes.</p>

                <p className="mt-2">Try it: fill this board so the top numbers and the side numbers both match.</p>
                <ClientBoard boardsStore={tutorialBoard} />

                <div className="mt-4 flex flex-row items-center gap-3">
                    <button
                        disabled={!solved}
                        onClick={dismiss}
                        className={cn(
                            "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer",
                            !solved && "opacity-50 cursor-not-allowed hover:bg-blue-500",
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
