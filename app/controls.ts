import type { Token } from './palette'
import type { DayMark } from './stores/dayMark'

/**
 * Every control is one of six variants (graphics spec P2-2, row 14; redrawn in UI row 3).
 *
 * Before row 14 the game's 18 buttons had seven designs for one class of thing: `Check`,
 * `Hint`, `Undo`, `Reset` and the difficulty's options flat on the control surface;
 * `Archive`, `Sound` and the archive's month arrows and days bordered; "Got it!" and "Play
 * today" in the accent; the completion card's actions white; the archive's Close a slate
 * block; "Skip" an underlined link; the level arrows a drawing. Each button wrote its own
 * surface, radius and padding, in two radii and six paddings. Now a button names its variant
 * and nothing else about how it looks, and this table is where a variant is described.
 *
 * **UI row 3 raised them** (UI-SPEC §3.3): a raised control sits on a solid edge beneath it,
 * sinks into it while pressed, and loses it when disabled. Row 14's `secondary` and `quiet`
 * became `raised`, its `choice` became `chip`, and every control is at least 48px square at
 * phone sizes. `round`, `card` and `switch`, the spec's other three, arrive with the controls
 * that wear them (rows 6-8, §12 amended).
 *
 * **Plain data, in tokens and px**, in the palette's pattern: CSS reads it through
 * `app/controls.css`, generated from here by `npm run tokens`, and the tests read it
 * directly -- `e2e/controlVariants.spec.ts` computes what each variant should look like from
 * this table and holds every button on every surface to exactly one.
 *
 * What a variant does *not* own: the focus ring's shape, a 3px outline 2px out, which is every
 * control's alike (`app/globals.css`, P1-6).
 */

/** A border this many px wide, inside the control's box: only `day` has one now. */
type Border = { width: number, colour: Token }

/** The solid edge beneath a raised control: drawn below its box, so it adds nothing to layout. */
type Edge = { depth: number, colour: Token }

export type Variant = {
    /**
     * Behind the text at rest. `null` is none: what the control sits on shows through. A
     * record is a surface chosen by the control's `data-mark`, which is data, not state.
     */
    surface: Token | null | Record<DayMark, Token>
    border: Border | null
    edge: Edge | null
    /** The text's colour; `null` for a control with no text of its own. */
    ink: Token | null
    /**
     * The `control` role's 800 (UI-SPEC §3.2). Weight told the primary and a pressed toggle
     * apart until UI row 3, at 900; the pressed toggle's depth does it now. A day in the
     * archive is 700: its text is the `meta` role, whose weight that is.
     */
    weight: 700 | 800
    /** Corner radius, px. */
    radius: number
    /** From the outside of the border to the content, px: the box is the same with or without one. */
    padding: { x: number, y: number }
    /** The smallest box, px: 48 is the touch target at phone sizes (UI-SPEC §3.3). */
    min: { width: number, height: number }
    /** Under a fine pointer only (P1-6): the edge's colour, a 2px ring, or a scale. */
    hover: { edge?: Token, ring?: Token, scale?: number }
    /**
     * While a pointer or Space is held. `sink`: down by the edge's depth, the edge gone
     * (§3.3). `nudge`: P1-6's pixel lower and 90% as bright, for the two variants without an
     * edge, until rows 6 and 12 redraw them.
     */
    press: 'sink' | 'nudge'
    /** The focus ring's colour. */
    focus: Token
    /** At rest, disabled. It answers neither a hover nor a press, and has no edge. */
    disabled: { surface?: Token, ink?: Token, opacity?: number, filter?: string }
    /**
     * `aria-pressed="true"`: a toggle held down, on the accent. The depth is what says it
     * without colour, so it shows under reduced motion too.
     */
    pressed?: { surface: Token, ink: Token }
    /** `aria-current`: a 2px ring, on a variant whose controls can be the current one. */
    current?: { ring: Token }
    /** `aria-checked`: a 2px ring, on a variant whose controls are one choice of several. */
    checked?: { ring: Token }
}

/**
 * The box every text control shares, so a row of mixed variants lines up: 16px text at 1.25
 * and 14px above and below is 48px, the touch target (UI-SPEC §3.3).
 */
const BOX = { radius: 16, padding: { x: 16, y: 14 }, min: { width: 48, height: 48 } } as const

/** What every raised control shares: the edge, the sink, and the accent's edge on hover. */
const RAISED = {
    border: null, edge: { depth: 3, colour: 'raisedEdge' }, weight: 800, ...BOX,
    hover: { edge: 'accentEdge' }, press: 'sink', focus: 'accentEdge',
    disabled: { opacity: 0.45 },
    pressed: { surface: 'accent', ink: 'onAccent' },
} as const

export const CONTROL = {
    /**
     * `Check`, the tutorial's "Got it!", the banner's "Play today", Start, Share: the one
     * thing on its surface a player most likely wants next. The accent, with `onAccent` text,
     * on a 4px edge in the accent's own edge.
     *
     * Disabled, it gives the accent up. A primary that cannot be pressed and still wears
     * the colour that means "press" is asking for the press.
     */
    primary: {
        surface: 'accent', border: null, edge: { depth: 4, colour: 'accentEdge' }, ink: 'onAccent', weight: 800, ...BOX,
        hover: { ring: 'accentEdge' }, press: 'sink', focus: 'accentEdge',
        disabled: { surface: 'surface', ink: 'ink', opacity: 0.45 },
    },
    /**
     * Everything else that is pressed to act or toggle: `Hint`, `Undo`, the difficulty's
     * options, `Archive`, `Sound`, Pick a piece, the streak, the completion card's actions,
     * Close, Retry, the archive's month arrows, the tutorial's "Skip". Row 14's `secondary`
     * and `quiet`, one variant since UI row 3.
     */
    raised: {
        surface: 'surface', ink: 'ink', ...RAISED,
    },
    /**
     * `Reset`, the one control that destroys work: `raised`, with its text in `problem`. A
     * raised control has no border (§3.3), so the caution moved from row 14's red edge to the
     * text. It makes the button look like what it does; whether it should ask first is
     * `SPEC.md`'s open question, and this does not answer it.
     */
    caution: {
        surface: 'surface', ink: 'problem', ...RAISED,
    },
    /**
     * One of a set in which exactly one is always chosen: Pick a piece's two pieces, which are
     * `role="radio"`. Not a toggle -- neither can be switched off, only the other chosen -- so
     * not `aria-pressed` and not its accent. `raised` at a chip's radius, 8 (§3.3). Chosen is
     * a ring in the accent's edge, with a check mark the control draws inside itself: a shape
     * as well as a colour (P1-8), and never a fill, so the piece's picture stays what is read.
     * The picker's first version filled the held piece's whole button blue; the user's word
     * for it was "horrendous". Row 14's `choice`.
     */
    chip: {
        surface: 'surface', ink: 'ink', ...RAISED, radius: 8, padding: { x: 12, y: 5 },
        pressed: undefined,
        checked: { ring: 'accentEdge' },
    },
    /**
     * The level arrows: the drawing is the control, in the accent's fill and stroke
     * (`LevelSelector`), and its accessible name is the button's. No surface; a 48px box
     * round the drawing; it grows under the pointer, and a disabled one goes grey. Row 6's
     * chevrons replace it.
     */
    icon: {
        surface: null, border: null, edge: null, ink: null, weight: 800, radius: 6, padding: { x: 0, y: 0 },
        min: { width: 48, height: 48 },
        hover: { scale: 1.2 }, press: 'nudge', focus: 'accentEdge',
        disabled: { filter: 'grayscale(1)' },
    },
    /**
     * A day in the archive's calendar. Not one of the spec's variants: its surface is how far
     * that day was played, which is data, and no other control's surface is. Bordered, as it
     * was, until row 12 redraws the archive; 48px tall since UI row 3 (§6.5), its width a
     * seventh of the grid's. The day being played is `aria-current`, and ringed in the
     * accent's edge.
     */
    day: {
        surface: { none: 'markNone', started: 'markStarted', partial: 'markPartial', complete: 'markComplete' },
        border: { width: 1, colour: 'ink' }, edge: null, ink: 'ink', weight: 700, radius: 6, padding: { x: 5, y: 5 },
        min: { width: 0, height: 48 },
        hover: {}, press: 'nudge', focus: 'accentEdge',
        disabled: { opacity: 0.45 },
        current: { ring: 'accentEdge' },
    },
} as const satisfies Record<string, Variant>

export type VariantName = keyof typeof CONTROL

/** The class that makes a button a variant: `control('caution')` is `control-caution`. */
export const control = (variant: VariantName): string => `control-${variant}`
