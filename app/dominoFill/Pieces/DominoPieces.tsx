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
 *
 * **`role="img"`, not `<button>` (spec P1-8, row 19).** P1-8 asks for real buttons here,
 * written when this tray was a mode selector; a button that selects nothing would be a
 * worse control than no control. The real defect it was pointing at is still here and is
 * now fixed: `aria-label` on a role-less `div` is not exposed, and measured in Chrome
 * these two entries reached the accessibility tree as bare unnamed `img` nodes -- the
 * explanations were being written and then dropped. A role that supports naming is what
 * makes them audible. See the amendment under P1-8 in SPEC.md.
 */
const DominoPieces: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore: currentBoard }) => {
    return (
        <div
            className="flex flex-row bg-[#ababab] rounded-4xl gap-4 text-2xl pt-6 px-4 items-center"
            data-legend
            role="group"
            aria-label="Scoring key"
        >
            <div
                className='p-2'
                data-legend-piece="1"
                role="img"
                aria-label="An upright domino scores 1 in its top square and 0 below"
            >
                <DominoPieceOne boardsStore={currentBoard} cellSize={TRAY_CELL_PX} />
            </div>
            <div
                className='p-2'
                data-legend-piece="2"
                role="img"
                aria-label="A flat domino scores 0 in its left square and 2 on the right"
            >
                <DominoPieceTwo boardsStore={currentBoard} cellSize={TRAY_CELL_PX} />
            </div>
        </div >
    );
}

export default observer(DominoPieces)
