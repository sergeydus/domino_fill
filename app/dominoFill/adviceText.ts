import type { Advice } from "../stores/advice"

/**
 * What Check and Hint actually say (spec P1-5, row 18e).
 *
 * Separate from the component so the wording is testable, and because the wording *is* the
 * feature: the whole point of P1-5 is that the game stops telling the player things that
 * are not true. Three distinctions are load-bearing and easy to collapse by accident:
 *
 *   - **"wrong" and "could not tell" are different answers.** A budget-exhausted search
 *     has not judged the position; reporting it as a mistake would send a player undoing
 *     correct moves. This is the reason the solver has a `budget-exhausted` verdict at all.
 *     And "could not tell" has to say what would change the answer: the solver and its
 *     budget are deterministic, so pressing the same button on the same board reaches the
 *     same limit. "Try again" would be an invitation to a guaranteed repeat.
 *   - **"nothing was proved" and "nothing is forced" are different answers.** More than one
 *     completion means there is nothing to reveal *from this search* — not that no square
 *     is forced, which a search that stopped at two completions has no standing to say.
 *   - **an unknown distance is not zero.** When the walk back could not establish how far
 *     to undo, the message says a piece is wrong and stops, rather than inventing a number.
 *
 * A pip value is named as the half it is rather than as a number: the board shows pips, and
 * "the top half of an upright domino" is something a player can act on where "1" is a quiz.
 */

/** Vertical is 1 over 0; horizontal is 0 then 2. A cell's value says which half it is. */
const HALF: Record<number, string> = {
    1: 'the top half of an upright domino',
    0: 'the bottom half of an upright domino, or the left half of a flat one',
    2: 'the right half of a flat domino',
}

export const adviceMessage = (advice: Advice): string => {
    switch (advice.kind) {
        case 'solved':
            return 'This puzzle is already finished.'
        case 'on-track':
            return 'Looking good — this position can still be finished.'
        case 'no-proven-hint':
            return 'This search found more than one way to finish, so it could not prove what any square holds.'
        case 'hint': {
            const [row, column] = advice.cell
            return `Row ${row + 1}, column ${column + 1} holds ${HALF[advice.value] ?? 'a piece'}.`
        }
        case 'wrong':
            return advice.undoSteps === null
                ? 'One of the pieces you have placed is wrong — this position cannot be finished.'
                : `This position cannot be finished. Undo ${advice.undoSteps} `
                + `${advice.undoSteps === 1 ? 'move' : 'moves'} to get back to one that can.`
        case 'undetermined':
            return 'The search reached its limit before it could tell. Undo or change a move, then ask again.'
        case 'unavailable':
            return 'Something is wrong with this puzzle, so it cannot be checked.'
    }
}

/** Whether the message is bad news, for the one bit of colour the strip carries. */
export const adviceIsProblem = (advice: Advice): boolean =>
    advice.kind === 'wrong' || advice.kind === 'unavailable'
