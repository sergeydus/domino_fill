import type { LineState } from "../stores/boardRules"
import { PALETTE } from "../palette"

/**
 * How a target label presents its state (spec P1-5, D10-g).
 *
 * Three defects lived in the old two-line version, which set `#4bce4b` on a matched sum and
 * `#ff0000` on an overshoot:
 *
 * 1. **Colour was the only channel** — a WCAG 1.4.1 failure, and roughly one man in twelve
 *    cannot separate that particular red from that particular green. So each state now also
 *    carries a *shape*: satisfied is struck through, like crossing a clue off a list; over
 *    is ringed. Either is legible in greyscale.
 * 2. **The contrast was failing 1.4.3**, and worse than the spec recorded. Measured against
 *    the `#e8e7e7` board background: neutral `#ababab` is 1.86:1, and the green — the state
 *    colour, the thing the player is meant to read — is **1.66:1**, the least legible
 *    element on screen. The palette below is measured, not guessed: neutral 5.17:1,
 *    satisfied 5.77:1, over 6.76:1, all past the 4.5:1 that normal text needs.
 * 3. **Green meant "sum matched"**, not "line finished" — see `lineState`.
 *
 * The ring is an `outline`, not a border: outlines are drawn outside the box and take no
 * layout space, which matters because the gutter is 0.7 of a cell and a two-digit label
 * already occupies about 0.61 of it (P0-3). A border would reopen the overflow that row 11
 * closed.
 */

export type LabelPresentation = {
    color: string
    /** The non-colour channel: struck through, ringed, or neither. */
    textDecoration: 'line-through' | 'none'
    outline: string
    /** For tests and for assistive text; never the only signal. */
    token: 'satisfied' | 'over' | 'neutral'
}

/**
 * Measured against the ground; see the note above before changing any of these. The values
 * live in the palette (graphics spec P0-5): a finished line is `success` and an overshot one
 * is `problem`, the same tokens the rest of the game uses for those meanings, and
 * `tests/contrast.test.ts` recomputes every ratio from the tokens.
 */
export const LABEL_COLORS: Record<LineState, string> = {
    neutral: PALETTE.lineNeutral,
    satisfied: PALETTE.success,
    over: PALETTE.problem,
}

export const labelPresentation = (state: LineState): LabelPresentation => ({
    color: LABEL_COLORS[state],
    textDecoration: state === 'satisfied' ? 'line-through' : 'none',
    outline: state === 'over' ? `2px solid ${LABEL_COLORS.over}` : 'none',
    token: state,
})

/**
 * What a screen reader should hear, since strikethrough and colour reach neither.
 *
 * The line is named as well as its target (spec P1-8, row 19). Heard on its own, "7,
 * complete" does not say *which* line is complete, and these labels sit outside the grid
 * so no row or column context comes with them.
 *
 * Note that this string only reaches anyone because the element carrying it now has a role
 * that supports naming. Measured in Chrome before that change: the whole label strip
 * reached the accessibility tree as one anonymous text run, `3 2 2 2 3 2 3 3 2 2 4 0`, and
 * every one of these descriptions was computed and then discarded -- `aria-label` on a
 * role-less `div` is ignored.
 */
export const labelDescription = (line: string, target: string, state: LineState): string => {
    const named = `${line}, target ${target}`
    if (state === 'satisfied') return `${named}, complete`
    if (state === 'over') return `${named}, over target`
    return named
}
