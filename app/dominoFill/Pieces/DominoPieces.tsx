"use client"
import DominoPieceOne from "./DominoPieceOne"
import DominoPieceTwo from "./DominoPieceTwo";
import { observer } from 'mobx-react';
import { PuzzleSession } from '@/app/stores/PuzzleSession';
import { control } from '@/app/controls';
import { PRESSED } from '../controlStates';

/**
 * Cell size for the pieces in the tray, in CSS px.
 *
 * A constant, deliberately: the tray is chrome, and `useAvailableBoardBox` budgets the
 * board against the height the chrome leaves. Sizing these from the board's own cell makes
 * that budget depend on its own result.
 */
const TRAY_CELL_PX = 44;

const UPRIGHT = 'An upright domino scores 1 in its top square and 0 below'
const FLAT = 'A flat domino scores 0 in its left square and 2 on the right'

/**
 * The piece tray: a **legend** in the default mode, and the **picker** in Pick a piece mode.
 *
 * **In the default mode it selects nothing (spec P1-1).** It used to select which piece the
 * next click would place, which is the orientation mode the drag verb deletes: you drag
 * toward the neighbour you want, so there is no selection to make and no wrong mode to be
 * stuck in. What is left is the scoring key -- this shape is worth 1, that one 2.
 *
 * **`role="img"`, not `<button>`, there (spec P1-8, row 19).** A button that selects nothing
 * would be a worse control than no control. `aria-label` on a role-less `div` is not
 * exposed -- measured in Chrome, the entries reached the accessibility tree as bare unnamed
 * `img` nodes -- so the role is what makes the explanations audible.
 *
 * **In Pick a piece mode the same two pieces are the picker** (NEXT-STEPS.md, PL1), which
 * the player turned on deliberately. Now they do select something, so they are real toggle
 * buttons, pressed for the piece held. The picker takes the legend's place rather than a
 * row of its own, so the board keeps the height it had: the quiet variant's padding less
 * its edge is the legend's `p-2` on the vertical axis.
 */
const DominoPieces: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore: currentBoard }) => {
    if (currentBoard.pickMode) {
        const controls = currentBoard.rootStore.controls
        return (
            <div
                className="flex flex-row bg-control-surface rounded-4xl gap-4 pt-6 px-4 items-center"
                data-legend
                data-piece-picker
                role="group"
                aria-label="Held piece"
            >
                <button
                    type="button"
                    data-held-piece="upright"
                    aria-pressed={currentBoard.heldPiece === 'upright'}
                    aria-label={`Hold upright. ${UPRIGHT}`}
                    className={`${control('quiet')} ${PRESSED}`}
                    onClick={() => controls.setHeld('upright')}
                >
                    <DominoPieceOne boardsStore={currentBoard} cellSize={TRAY_CELL_PX} />
                </button>
                <button
                    type="button"
                    data-held-piece="flat"
                    aria-pressed={currentBoard.heldPiece === 'flat'}
                    aria-label={`Hold flat. ${FLAT}`}
                    className={`${control('quiet')} ${PRESSED}`}
                    onClick={() => controls.setHeld('flat')}
                >
                    <DominoPieceTwo boardsStore={currentBoard} cellSize={TRAY_CELL_PX} />
                </button>
            </div>
        );
    }

    return (
        <div
            className="flex flex-row bg-control-surface rounded-4xl gap-4 pt-6 px-4 items-center"
            data-legend
            role="group"
            aria-label="Scoring key"
        >
            <div
                className='p-2'
                data-legend-piece="1"
                role="img"
                aria-label={UPRIGHT}
            >
                <DominoPieceOne boardsStore={currentBoard} cellSize={TRAY_CELL_PX} />
            </div>
            <div
                className='p-2'
                data-legend-piece="2"
                role="img"
                aria-label={FLAT}
            >
                <DominoPieceTwo boardsStore={currentBoard} cellSize={TRAY_CELL_PX} />
            </div>
        </div >
    );
}

export default observer(DominoPieces)
