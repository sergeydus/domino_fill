import type { CSSProperties } from "react"
import type { LineState } from "../stores/boardRules"
import { cssVar } from "../palette"

/**
 * How a target label presents its state (spec P1-5, D10-g).
 *
 * Three defects lived in the old two-line version, which set `#4bce4b` on a matched sum and
 * `#ff0000` on an overshoot:
 *
 * 1. **Colour was the only channel** — a WCAG 1.4.1 failure, and roughly one man in twelve
 *    cannot separate that particular red from that particular green. So each state now also
 *    carries a *shape*: since UI row 4 (§4.2), satisfied is a filled pill, over a ringed one,
 *    and reached a bar under the number -- filled against outlined, and a bar neither pill
 *    has. Satisfied was struck through until row 4, like crossing a clue off a list.
 * 2. **The contrast was failing 1.4.3**, and worse than the spec recorded. Measured against
 *    the `#e8e7e7` board background: neutral `#ababab` is 1.86:1, and the green — the state
 *    colour, the thing the player is meant to read — is **1.66:1**, the least legible
 *    element on screen. The palette below is measured, not guessed: neutral 5.17:1,
 *    satisfied 5.77:1, over 6.76:1 on that ground, all past the 4.5:1 that normal text
 *    needs -- and 5.62, 6.27 and 7.35 on the warm ground graphics P1-3 moved it to.
 * 3. **Green meant "sum matched"**, not "line finished" — see `lineState`.
 *
 * The ring is an `outline`, not a border: outlines are drawn outside the box and take no
 * layout space, which matters because the gutter is 0.7 of a cell and a two-digit label
 * takes 1em of it, 0.5 of a cell (P0-3). A border would reopen the overflow that row 11
 * closed. Since row 4 it rings the pill, not the label, and `PILL` sizes the pill so the ring
 * ends inside the label's box: it used to be drawn 2px outside it.
 */

export type LabelPresentation = {
    /** The label's colour: its number's, unless the pill sets its own, and always its tie's. */
    color: string
    /** The non-colour channel: a filled pill, a ringed one, or none. */
    pill: 'filled' | 'ringed' | 'none'
    /** Reached's shape: a bar under the number. */
    bar: boolean
    /** For tests and for assistive text; never the only signal. */
    token: LineState
}

/**
 * Measured against the ground; see the note above before changing any of these. The values
 * live in the palette (graphics spec P0-5): a finished line is `success` and an overshot one
 * is `problem`, the same tokens the rest of the game uses for those meanings, and
 * `tests/contrast.test.ts` recomputes every ratio from the tokens. As references to them
 * (`var(--success)`) since UI row 1, so a label follows the theme.
 */
export const LABEL_COLORS: Record<LineState, string> = {
    neutral: cssVar('lineNeutral'),
    reached: cssVar('success'),
    satisfied: cssVar('success'),
    over: cssVar('problem'),
}

/**
 * The pill every label's number sits in, drawn or not (UI-SPEC §4.2, UI row 4), so no state
 * moves the number. Sized against the label's box, which is the gutter one way and the cell
 * the other: a row label at the 38px floor is 26px wide, and `13` is 19px of it (1em; tabular
 * figures are 0.5em each, measured in Nunito 900).
 *
 * - **Height** 1.15em, but never more than the box less the ring either side.
 * - **Width** at least the height, so a single digit sits in a circle; for two, the number and
 *   its padding.
 * - **Padding** a quarter em a side where the box has room, and only what's left of the box
 *   after two figures and the ring where it hasn't: a percentage padding is a fraction of the
 *   label's width, and `2ch` is two figures. 1.5px a side in that 26px row label.
 * - **The ring** is an outline at no offset, `RING` px outside the pill, so it ends at the
 *   label's box at the tightest and inside it everywhere else.
 */
export const RING = 2

export const PILL = {
    height: `min(1.15em, 100% - ${2 * RING}px)`,
    minWidth: '1.15em',
    paddingInline: `max(0px, min(0.25em, (100% - 2ch) / 2 - ${RING}px))`,
} as const

/** The pill's style in a state: a filled `success` pill with `onSuccess` text, a `problem` ring, or neither. */
export const pillStyle = (p: LabelPresentation): CSSProperties => ({
    position: 'relative',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: `calc(${PILL.height})`,
    minWidth: PILL.minWidth,
    paddingInline: `calc(${PILL.paddingInline})`,
    borderRadius: '9999px',
    backgroundColor: p.pill === 'filled' ? cssVar('success') : undefined,
    // On itself, not on the label: the label's colour is the tie's too, and a satisfied tie
    // painted in `onSuccess` would be white on the ground.
    color: p.pill === 'filled' ? cssVar('onSuccess') : undefined,
    outline: p.pill === 'ringed' ? `${RING}px solid ${LABEL_COLORS.over}` : 'none',
    outlineOffset: 0,
})

/** Reached's bar: 2px, in the label's colour, under the number and inside the pill. */
export const barStyle: CSSProperties = {
    position: 'absolute',
    left: '0.2em',
    right: '0.2em',
    bottom: '0.05em',
    height: '2px',
    borderRadius: '1px',
    backgroundColor: 'currentColor',
    pointerEvents: 'none',
}

/**
 * The tie between a target and its line (graphics spec P1-3).
 *
 * The labels sat beside their lines with nothing joining them: a number floating in the
 * ground a gutter away from the board. Each now carries a short tick, in its own colour,
 * from the edge of its box -- which is the frame's outer edge -- toward the number, centred
 * on the line. So the tie is geometric and tonal at once, and both halves are measurable:
 * the tick's centre is the line's centre and its end is the frame, and its colour is the
 * label's, in every state, because it paints `currentColor` and changes when the label does.
 *
 * Fractions of the cell, like the art (P0-6). The length fills the gap the gutter leaves
 * below a label's text box -- the gutter is 0.7 of a cell and the text 0.5, centred, so 0.1
 * -- and the width is the divider's weight rounded up, so it reads at 38px.
 */
export const LABEL_TIE = { length: 0.1, width: 0.06 } as const

/** The tick's style: `below` a column's label, or to the `right` of a row's. */
export const tieStyle = (side: 'below' | 'right'): CSSProperties => {
    const along = `calc(var(--cell) * ${LABEL_TIE.length})`
    const across = `calc(var(--cell) * ${LABEL_TIE.width})`
    return {
        position: 'absolute',
        backgroundColor: 'currentColor',
        pointerEvents: 'none',
        ...(side === 'below'
            ? { bottom: 0, left: '50%', width: across, height: along, translate: '-50% 0' }
            : { right: 0, top: '50%', width: along, height: across, translate: '0 -50%' }),
    }
}

export const labelPresentation = (state: LineState): LabelPresentation => ({
    color: LABEL_COLORS[state],
    pill: state === 'satisfied' ? 'filled' : state === 'over' ? 'ringed' : 'none',
    bar: state === 'reached',
    token: state,
})

/**
 * What a screen reader should hear, since a pill, a bar and colour reach none of them. A
 * reached line is "target reached" (UI row 4): matched, and not finished, which "complete"
 * would claim.
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
    if (state === 'reached') return `${named}, target reached`
    if (state === 'satisfied') return `${named}, complete`
    if (state === 'over') return `${named}, over target`
    return named
}
