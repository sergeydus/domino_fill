"use client"
import DominoPieceOne from "./DominoPieceOne"
import DominoPieceTwo from "./DominoPieceTwo";
import { observer } from 'mobx-react';
import { PuzzleSession } from '@/app/stores/PuzzleSession';

/**
 * Cell size for the pieces in the tray, in CSS px.
 *
 * A constant, deliberately: the tray is chrome, and `useAvailableBoardBox` budgets the
 * board against the height the chrome leaves. Sizing these from the board's own cell makes
 * that budget depend on its own result.
 */
const TRAY_CELL_PX = 44;

/**
 * The piece tray, which is a **legend** and not a mode selector (spec P1-1).
 *
 * It used to select which piece the next click would place, which is the orientation mode
 * the drag verb deletes: you drag toward the neighbour you want, so there is no selection
 * to make and no wrong mode to be stuck in. What is left is the scoring key -- this shape
 * is worth 1, that one 2 -- which is the part players actually need and could not get
 * anywhere else.
 */
const DominoPieces: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore: currentBoard }) => {
    return (
        <div className="flex flex-row bg-[#ababab] rounded-4xl gap-4 text-2xl pt-6 px-4 items-center control-surface" data-legend>
            <div className='p-2' data-legend-piece="1" aria-label="An upright domino scores 1 in its top square and 0 below">
                <DominoPieceOne boardsStore={currentBoard} cellSize={TRAY_CELL_PX} />
            </div>
            <div className='p-2' data-legend-piece="2" aria-label="A flat domino scores 0 in its left square and 2 on the right">
                <DominoPieceTwo boardsStore={currentBoard} cellSize={TRAY_CELL_PX} />
            </div>
        </div >
    );
}

export default observer(DominoPieces)
