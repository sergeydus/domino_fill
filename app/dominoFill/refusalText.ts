import type { Refusal } from "../stores/PuzzleSession"

/**
 * What a refused move says (keyboard polish, section 3 of its contract in NEXT-STEPS).
 *
 * The cross says *that* a move was refused and *where*; these say *why*, in the row under the
 * board and to a screen reader, which the cross never reached (U6). One sentence per path that
 * refuses, and every sentence is about the move just made -- the reason is stored when the
 * refusal happens (`PuzzleSession.refusal`), never worked out later from a board that may since
 * have changed.
 *
 * Separate from the component, as `adviceText.ts` is, so the wording is testable on its own.
 */
export const refusalMessage = (refusal: Refusal): string => {
    switch (refusal.kind) {
        case 'rock':
            return 'That square is a rock.'
        case 'space-on-piece':
            return 'Delete removes a piece; Space selects an empty square.'
        case 'no-room':
            return refusal.piece === null
                ? 'No room for a piece there.'
                : `No room for the ${refusal.piece} piece there.`
        case 'drag-from-piece':
            return "Placed pieces can't be dragged; tap one to remove it."
        case 'not-adjacent':
            return 'Drag to a square next to it.'
        case 'blocked':
            return 'That way is blocked.'
        case 'edge':
            return "That's the edge of the board."
        case 'other':
            return "That can't be done there."
    }
}
