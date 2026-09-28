import type { Cell } from "../stores/placement"

/**
 * What one square of the board is called (spec P1-8, row 19).
 *
 * The board carried `role="grid"` with no `role="row"` and no `role="gridcell"` anywhere
 * beneath it, which is not a partial implementation but a broken contract: measured in
 * Chrome, the accessibility tree for the whole 6x6 board was
 *
 *     grid "Domino board": img, img, img, img, img, img, img, img
 *
 * -- eight unnamed pictures for the pieces already on it, and *not one of the thirty-six
 * squares*. A player using a screen reader could focus the board and then learn nothing
 * about it at all. Naming the cells is what turns the grid role from a claim into a fact.
 *
 * The words are the ones `adviceText.ts` already uses for the same values, deliberately.
 * A hint says "the top half of an upright domino" and the square it points at must not
 * answer "1"; hearing two names for one thing is how a player concludes the game is
 * describing two things.
 */

/**
 * What each cell value is called, and the single home for those words.
 *
 * `adviceText.ts` imports this and puts "the" in front of it, which is the whole point:
 * the first version of this file retyped the phrases, and a test comparing the two caught
 * them already disagreeing by an article. One noun phrase per value, one place to change.
 *
 * Vertical is 1 over 0; horizontal is 0 then 2, so `0` is genuinely ambiguous between two
 * halves and the label says so rather than picking one.
 */
export const HALF: Record<number, string> = {
    1: 'top half of an upright domino',
    0: 'bottom half of an upright domino, or the left half of a flat one',
    2: 'right half of a flat domino',
}

/** Empty, a rock, or one half of a placed domino. */
const CONTENT: Record<number, string> = { [-1]: 'rock', ...HALF }

export type CellState = {
    /** The anchor waiting for a direction: the keyboard's half-made move. */
    isAnchor?: boolean
    /** Offered as the second half of that move. */
    isCandidate?: boolean
    /** Where a hint is pointing. */
    isHinted?: boolean
}

/**
 * Position first, then contents, then state.
 *
 * Position leads because it is the part a player is tracking as they arrow around, and a
 * screen reader that is interrupted mid-phrase has then already said the useful part.
 * Rows and columns count from one, like the hint messages and like the player.
 */
export const cellDescription = (
    cell: Cell,
    value: number | null,
    state: CellState = {},
): string => {
    const [row, column] = cell
    const parts = [`Row ${row + 1}, column ${column + 1}`]
    parts.push(value === null ? 'empty' : CONTENT[value] ?? 'a piece')
    if (state.isAnchor) parts.push('selected, choose a direction')
    if (state.isCandidate) parts.push('can be paired with the selected square')
    if (state.isHinted) parts.push('hinted')
    return parts.join(', ')
}
