/**
 * What `aria-pressed` looks like (graphics spec P1-6, row 12).
 *
 * A toggle -- a control pressed *into* a state, not merely pressed -- says which state it is
 * in twice for sight: by colour, the accent's fill, and without colour, a ring and a bolder
 * weight. One treatment for every toggle, so "pressed" means one thing on screen; the
 * difficulty selector had it alone until this row, and `Sound` had only its words.
 *
 * Keyed on the attribute itself, so the picture cannot disagree with what a screen reader is
 * told.
 */
export const PRESSED = 'aria-pressed:bg-accent aria-pressed:font-bold aria-pressed:ring-2 aria-pressed:ring-accent-edge'
