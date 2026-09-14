import type { LineState } from "../stores/boardRules"

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

/** Measured against `#e8e7e7`; see the note above before changing any of these. */
export const LABEL_COLORS: Record<LineState, string> = {
    neutral: '#5f5f5f',
    satisfied: '#15661a',
    over: '#a10000',
}

export const labelPresentation = (state: LineState): LabelPresentation => ({
    color: LABEL_COLORS[state],
    textDecoration: state === 'satisfied' ? 'line-through' : 'none',
    outline: state === 'over' ? `2px solid ${LABEL_COLORS.over}` : 'none',
    token: state,
})

/** What a screen reader should hear, since strikethrough and colour reach neither. */
export const labelDescription = (target: string, state: LineState): string => {
    if (state === 'satisfied') return `${target}, complete`
    if (state === 'over') return `${target}, over target`
    return target
}
