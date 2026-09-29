"use client"
import DominoPieceOne from "./DominoPieceOne"
import DominoPieceTwo from "./DominoPieceTwo";
import { observer } from 'mobx-react';
import { PuzzleSession } from '@/app/stores/PuzzleSession';
import { control } from '@/app/controls';
import { PALETTE } from '@/app/palette';
import type { Piece } from '@/app/stores/placement';

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

/** Cell size for the pieces drawn in the picker's chips: a piece two cells long fits a 48px row. */
const CHIP_CELL_PX = 18

const PIECES = {
    upright: { name: 'Upright', explanation: UPRIGHT, Drawing: DominoPieceOne },
    flat: { name: 'Flat', explanation: FLAT, Drawing: DominoPieceTwo },
} as const

/**
 * The chosen chip's check mark: the accent's disc and edge, and an ink tick, inside the chip.
 *
 * On the chosen chip only, so each chip centres exactly what it shows. A first build drew it
 * invisible on the other chip too, to keep both laid out alike, and that chip's piece and
 * name then sat left of its centre by the empty slot.
 */
const CheckMark: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" data-check-mark>
        <circle cx="9" cy="9" r="8" fill={PALETTE.accent} stroke={PALETTE.accentEdge} strokeWidth="1.5" />
        <path d="M5.2 9.4 L7.8 11.9 L12.6 6.6" fill="none" stroke={PALETTE.ink} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
)

/**
 * One of the picker's two pieces: a radio, checked for the piece held.
 *
 * A radio group rather than two toggles, because exactly one piece is always held: neither
 * can be switched off, only the other chosen. So the keyboard is the radio group's -- one tab
 * stop, on the piece held, and an arrow key choosing the other -- and the look is the `choice`
 * variant's, a ring and a check mark, where a toggle's would be the accent's fill.
 */
const HeldPieceChoice: React.FC<{ session: PuzzleSession, piece: Piece }> = observer(({ session, piece }) => {
    const controls = session.rootStore.controls
    const { name, explanation, Drawing } = PIECES[piece]
    const held = session.heldPiece === piece
    const other: Piece = piece === 'upright' ? 'flat' : 'upright'

    const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        const arrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
        if (!arrow || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
        e.preventDefault()
        controls.setHeld(other)
        e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-held-piece="${other}"]`)?.focus()
    }

    return (
        <button
            type="button"
            role="radio"
            aria-checked={held}
            tabIndex={held ? 0 : -1}
            data-held-piece={piece}
            aria-label={`${name}. ${explanation}`}
            className={`${control('choice')} flex items-center justify-center gap-2 w-36`}
            onClick={() => controls.setHeld(piece)}
            onKeyDown={onKeyDown}
        >
            <span className="flex items-center justify-center size-9">
                <Drawing boardsStore={session} cellSize={CHIP_CELL_PX} />
            </span>
            <span>{name}</span>
            {held && <CheckMark />}
        </button>
    )
})

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
 * **In Pick a piece mode the tray is the picker** (NEXT-STEPS.md, PL1), which the player
 * turned on deliberately: two equal chips in one row, each the piece drawn small beside its
 * name, centred under the board, with no surface of its own around them. The first picker
 * was this legend's two pieces made into toggle buttons, in the legend's capsule; boxes of two
 * sizes, the held one filled solid blue, and no names -- the user called it "horrendous". The
 * chips' row is 62px where the legend is 134px, so the board is larger in this mode: measured
 * on today's 6x6, 296px against 236px at 360x700, and 596px against 530px at 1280x800.
 */
const DominoPieces: React.FC<{ boardsStore: PuzzleSession }> = ({ boardsStore: currentBoard }) => {
    if (currentBoard.pickMode) {
        /*
         * Centred under the board's frame, not under the board with its labels: the row
         * labels stand to the frame's left in a gutter of their own, so the whole board is
         * centred on the page and its frame is not. The same gutter on this row's left
         * moves the chips' centre onto the frame's (the user: "make sure ui is
         * centralized"). It fits at 360px: two 144px chips, 12px apart, and the gutter.
         */
        return (
            <div
                className="flex flex-row gap-3 items-center justify-center py-2"
                style={{ paddingLeft: currentBoard.gutterSize }}
                data-legend
                data-piece-picker
                role="radiogroup"
                aria-label="Held piece"
            >
                <HeldPieceChoice session={currentBoard} piece="upright" />
                <HeldPieceChoice session={currentBoard} piece="flat" />
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
