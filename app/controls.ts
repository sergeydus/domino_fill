import type { Token } from './palette'
import type { DayMark } from './stores/dayMark'

/**
 * Every control is one of six variants (graphics spec P2-2, row 14).
 *
 * Before this row the game's 18 buttons had seven designs for one class of thing: `Check`,
 * `Hint`, `Undo`, `Reset` and the difficulty's options flat on the control surface;
 * `Archive`, `Sound` and the archive's month arrows and days bordered; "Got it!" and "Play
 * today" in the accent; the completion card's actions white; the archive's Close a slate
 * block; "Skip" an underlined link; the level arrows a drawing. Each button wrote its own
 * surface, radius and padding, in two radii and six paddings. Now a button names its variant
 * and nothing else about how it looks, and this table is where a variant is described.
 *
 * **Plain data, in tokens and px**, in the palette's pattern: CSS reads it through
 * `app/controls.css`, generated from here by `npm run tokens`, and the tests read it
 * directly -- `e2e/controlVariants.spec.ts` computes what each variant should look like from
 * this table and holds every button on every surface to exactly one.
 *
 * What a variant does *not* own: `aria-pressed` (`controlStates.ts`), which any control can
 * be pressed into, and the shape of focus and the press -- a 3px ring 2px out, a pixel lower
 * and 90% as bright -- which are every control's alike (`app/globals.css`, P1-6).
 */

/** An edge: a border this many px wide, inside the control's box. */
type Edge = { width: number, colour: Token }

export type Variant = {
    /**
     * Behind the text at rest. `null` is none: what the control sits on shows through. A
     * record is a surface chosen by the control's `data-mark`, which is data, not state.
     */
    surface: Token | null | Record<DayMark, Token>
    edge: Edge | null
    /** The text's colour and weight; `null` for a control with no text of its own. */
    ink: Token | null
    weight: 400 | 700
    /** Corner radius, px. */
    radius: number
    /** From the outside of the edge to the content, px: the box is the same with or without one. */
    padding: { x: number, y: number }
    /** Under a fine pointer only (P1-6): a new surface, a 2px ring, or a scale. */
    hover: { surface?: Token, ring?: Token, scale?: number }
    /** While held, on top of P1-6's pixel and 90%. */
    press: { surface?: Token }
    /** The focus ring's colour. */
    focus: Token
    /** At rest, disabled. It answers neither a hover nor a press. */
    disabled: { surface?: Token, opacity?: number, filter?: string }
    /** `aria-current`: a 2px ring, on a variant whose controls can be the current one. */
    current?: { ring: Token }
    /** `aria-checked`: a 2px ring, on a variant whose controls are one choice of several. */
    checked?: { ring: Token }
}

/** The box every text control shares, so a row of mixed variants lines up. */
const BOX = { radius: 6, padding: { x: 12, y: 8 } } as const

export const CONTROL = {
    /**
     * `Check`, the tutorial's "Got it!", the banner's "Play today": the one thing on its
     * surface a player most likely wants next. The accent's surface and the strongest weight.
     *
     * Disabled, it gives the accent up. A primary that cannot be pressed and still wears
     * the colour that means "press" is asking for the press; and on the neutral surface a
     * disabled `Check` keeps exactly the contrast every disabled game control had (2.30:1,
     * `tests/contrast.test.ts`).
     */
    primary: {
        surface: 'accent', edge: null, ink: 'ink', weight: 700, ...BOX,
        hover: { ring: 'accentEdge' }, press: {}, focus: 'accentEdge',
        disabled: { surface: 'controlSurface', opacity: 0.4 },
    },
    /**
     * `Hint`, `Undo`, the difficulty's options, the completion card's actions, the archive's
     * Close. The neutral surface, and the accent on focus and while pressed.
     */
    secondary: {
        surface: 'controlSurface', edge: null, ink: 'ink', weight: 400, ...BOX,
        hover: { surface: 'panel' }, press: { surface: 'accent' }, focus: 'accentEdge',
        disabled: { opacity: 0.4 },
    },
    /**
     * `Reset`, the one control that destroys work: `secondary`, with `problem` as its edge.
     * The same surface as `Hint` and `Undo`, so it is told from them by the edge and not by
     * fill. It makes the button look like what it does; whether it should ask first is
     * `SPEC.md`'s open question, and this does not answer it.
     */
    caution: {
        surface: 'controlSurface', edge: { width: 2, colour: 'problem' }, ink: 'ink', weight: 400, ...BOX,
        hover: { surface: 'panel' }, press: { surface: 'accent' }, focus: 'accentEdge',
        disabled: { opacity: 0.4 },
    },
    /**
     * `Archive`, `Sound`, the archive's month arrows, the tutorial's "Skip": bordered, and no
     * surface until the pointer or a press gives it one.
     */
    quiet: {
        surface: null, edge: { width: 1, colour: 'ink' }, ink: 'ink', weight: 400, ...BOX,
        hover: { surface: 'controlSurface' }, press: { surface: 'accent' }, focus: 'accentEdge',
        disabled: { opacity: 0.4 },
    },
    /**
     * The level arrows: the drawing is the control, in the accent's fill and stroke
     * (`LevelSelector`), and its accessible name is the button's. No surface and no padding;
     * it grows under the pointer, and a disabled one goes grey.
     */
    icon: {
        surface: null, edge: null, ink: null, weight: 400, radius: 6, padding: { x: 0, y: 0 },
        hover: { scale: 1.2 }, press: {}, focus: 'accentEdge',
        disabled: { filter: 'grayscale(1)' },
    },
    /**
     * A day in the archive's calendar. Not one of the spec's five: its surface is how far
     * that day was played, which is data, and no other control's surface is. Bordered like
     * `quiet`, in the box it had (the archive's grid is laid out on it). The day being played
     * is `aria-current`, and ringed in the accent's edge; only a day can be current, so the
     * ring is this variant's, where `aria-pressed`, which any control can be, is not.
     * (Correction at row 14's review: the archive drew it with utilities, and a button that
     * could carry ring utilities was one the source audit had to let wear any ring.)
     */
    day: {
        surface: { none: 'markNone', started: 'markStarted', partial: 'markPartial', complete: 'markComplete' },
        edge: { width: 1, colour: 'ink' }, ink: 'ink', weight: 400, radius: 6, padding: { x: 5, y: 5 },
        hover: {}, press: {}, focus: 'accentEdge',
        disabled: { opacity: 0.4 },
        current: { ring: 'accentEdge' },
    },
    /**
     * One of a set in which exactly one is always chosen: Pick a piece's two pieces, which are
     * `role="radio"`. Not a toggle -- neither can be switched off, only the other chosen -- so
     * not `aria-pressed` and not its accent fill. Bordered like `quiet`, flatter, so a chip is
     * barely taller than its piece. Chosen is a ring in the accent's edge, with a check mark the
     * control draws inside itself: a shape as well as a colour (P1-8), and never a fill, so the
     * piece's picture stays what is read. The picker's first version filled the held piece's
     * whole button blue; the user's word for it was "horrendous".
     */
    choice: {
        surface: null, edge: { width: 1, colour: 'ink' }, ink: 'ink', weight: 400, radius: 6, padding: { x: 12, y: 5 },
        hover: { surface: 'controlSurface' }, press: {}, focus: 'accentEdge',
        disabled: { opacity: 0.4 },
        checked: { ring: 'accentEdge' },
    },
} as const satisfies Record<string, Variant>

export type VariantName = keyof typeof CONTROL

/** The class that makes a button a variant: `control('caution')` is `control-caution`. */
export const control = (variant: VariantName): string => `control-${variant}`
