/**
 * Every colour the game draws, in one place (graphics spec P0-5, row 5).
 *
 * Before this row the palette was 71 literals across 20 files, in four vocabularies -- hex
 * (in SVG attributes, inline styles and `bg-[#...]`), Tailwind's own palette (`bg-amber-200`,
 * `ring-blue-500`), CSS named colours (`black`, `white`) and, in the icon, byte triples --
 * and two of them had already drifted apart: the pip was `black` on the board and
 * `#1a1a1a` in the generated icon. This module is now the only source file in the visual
 * scope allowed to hold a colour, and `tests/palette.test.ts` audits the rest for all four.
 *
 * **Named for the role, never for the colour** (`tileFace`, not `cream`). A token says what
 * it paints, so two roles that happen to share a value today -- the control surface and the
 * dark checker tone, the hint and success greens -- stay two tokens, and a later row can
 * move one without dragging the other.
 *
 * **Plain TypeScript with no imports**, because it has four kinds of consumer and one of
 * them is not a browser: the SVG components import it; `scripts/icon.ts` imports it in
 * Node at build time; CSS reads it through `app/palette.css`, generated from here by
 * `npm run tokens`; and `siteMetadata.ts` hands `ground` to the browser chrome and the
 * install manifest.
 *
 * **The values did not move in this row.** Every token is the value its use site held, and
 * the ones that came from Tailwind's palette carry Tailwind's own `oklch()` definition, so
 * the rendered page is unchanged -- measured, not assumed; see the spec's P0-5 amendment.
 * Where the comment records what a token replaced (`markStarted` was `amber-200`), that is
 * provenance for the rows that will change it, not a promise it stays that colour.
 */
export const PALETTE = {
    // ---- the page ------------------------------------------------------------------------
    /**
     * The board's ground: the page, the browser chrome, the splash screen, the icon. A
     * subtly warm off-white since P1-3; it was the neutral `#e8e7e7`.
     */
    ground: '#f4f0e8',
    /** Body text on the ground; the advice strip's 15.77:1 (spec §4). */
    ink: '#171717',

    // ---- the board -----------------------------------------------------------------------
    /*
     * The board is a chain of 3:1 steps (P1-3): the tile face over both checker tones, and
     * both checker tones over every rock tone. The first step caps the checker at a
     * luminance of about 0.28, which is why the board went from light grey to a mid warm
     * tan; the second then caps the rock at about 0.037. The two tones are 1.20:1 apart
     * (`CHECKER_RATIO`), the step that leaves the rock room to be a rock.
     */
    /** Squares where row + column is even (the top-left square is one). */
    checkerLight: '#9c8a72',
    /** Squares where row + column is odd. */
    checkerDark: '#8e7c66',
    boardFrame: '#4d3f33',

    // ---- the pieces ----------------------------------------------------------------------
    tileFace: '#fff3d6',
    /** The extruded side of a tile, and the body of the icon's tile. */
    tileSide: '#8d8778',
    /**
     * The rock's four tones: its facing plane, the lit and shaded facets, and the extruded
     * side (P1-2). Every one clears 3:1 against both checker tones and the tile face, which
     * is why all four are near-black: against the darker checker since P1-3, 3:1 needs a
     * luminance under about 0.037.
     */
    rockFace: '#2c2925',
    rockLit: '#37332e',
    rockShade: '#221f1c',
    rockSide: '#171513',
    /** The silhouette's edge, on dominoes and rocks alike. */
    pieceOutline: '#000000',
    /** The pip: the score. The icon drew `#1a1a1a` until this row; it now draws this. */
    pip: '#000000',
    /** The line that makes a domino a domino rather than a tile. */
    divider: '#000000',

    // ---- meaning -------------------------------------------------------------------------
    /** A line label with nothing to report (5.62:1 on the ground, spec §4). */
    lineNeutral: '#5f5f5f',
    /**
     * Finished: a finished line (6.27:1 on the ground), and a finished puzzle -- the
     * completion card's surface (P1-4). Nothing else.
     */
    success: '#15661a',
    /** Text on a `success` surface. */
    onSuccess: '#ffffff',
    /**
     * Something is wrong: an overshot line, the advice strip when it is reporting a problem
     * (7.35:1), and the archive's error message, which had a red of its own until P1-4.
     */
    problem: '#a10000',
    /**
     * The cell a hint is pointing at. It shared `success`'s value until P1-3, whose darker
     * checker it no longer cleared 3:1 against; now a green dark enough to.
     */
    hint: '#0b3b10',

    // ---- interactive chrome --------------------------------------------------------------
    /*
     * One accent, and only on interactive chrome (§2.2, P1-4): the selected difficulty, the
     * level arrows, the primary action of a dialog or banner, a control under the pointer
     * in the completion card. Until P1-4 there were five blues -- this, Material's two for
     * the arrows, Tailwind's `blue-500` and `blue-600` for the tutorial and the board's
     * focus ring, `sky-600` for the archive's current day -- and an amber for "Go to
     * today". Text on the accent is `ink` (5.87:1); white was 3.05:1.
     */
    accent: '#419dc8',
    /**
     * The accent's edge: rings and strokes -- the selected difficulty's ring, the arrows'
     * outline, the archive's current day, the board's focus ring.
     */
    accentEdge: '#0b3c52',
    /**
     * Check, Hint, Undo, Reset, the difficulty group and the domino legend's tray. A light
     * warm neutral since P1-4, so the controls sit back on the warm ground; it was `#ababab`.
     */
    controlSurface: '#e2d9ca',

    // ---- the cell states (P1-5 owns these) -------------------------------------------------
    /**
     * The first half of a two-step move. Tailwind `blue-600` until P1-3, which held it to
     * 3:1 against the light tone; on the new checker that needs a far darker blue.
     */
    anchor: '#16295e',
    /**
     * A square the anchor could pair with: a dashed edge over a `blue-200` wash at 40%.
     * The edge was `blue-400`, 1.63 and 1.15 on the old checker; P1-5 needs 3:1 on both
     * tones of the new one, and only a blue as dark as the anchor's reaches it. It shares
     * the anchor's value, not its role: the two are told apart by shape (P1-5).
     */
    candidateEdge: '#16295e',
    candidateWash: 'oklch(88.2% 0.059 254.128)',
    /** The keyboard's square: its corner brackets, opaque since P1-5 (they were 70%). */
    cellFocus: '#000000',
    /** The wash over the squares a drag would cover, drawn at 70%. */
    dragWash: '#ffffff',

    // ---- dialogs and surfaces ------------------------------------------------------------
    /** Behind a modal, drawn at 40%. */
    scrim: '#000000',
    /** The archive's and the tutorial's card. */
    panel: '#ffffff',
    /** The tutorial's text on its card. */
    panelInk: '#000000',
    /** The archive's Close button. Tailwind `slate-800`. */
    strongSurface: 'oklch(27.9% 0.041 260.031)',
    onStrong: '#ffffff',

    // ---- the archive's day marks ---------------------------------------------------------
    markNone: '#ffffff',
    /** Tailwind `amber-200`. */
    markStarted: 'oklch(92.4% 0.12 95.746)',
    /** Tailwind `amber-400`. */
    markPartial: 'oklch(82.8% 0.189 84.429)',
    /** Tailwind `emerald-400`. */
    markComplete: 'oklch(76.5% 0.177 163.223)',

    // ---- the day banner ------------------------------------------------------------------
    /** Tailwind `amber-100`. */
    bannerSurface: 'oklch(96.2% 0.059 95.617)',
} as const

/**
 * The ratio the two checker tones stand apart, in WCAG contrast (P1-3): stated, and held
 * by `tests/contrast.test.ts` to what the tones compute to.
 */
export const CHECKER_RATIO = 1.2

export type Token = keyof typeof PALETTE

/**
 * A token's CSS custom property, and the Tailwind utility suffix it generates:
 * `tileFace` is `--tile-face` and `bg-tile-face`.
 */
export const cssName = (token: Token): string =>
    token.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/** A `#rrggbb` token as bytes, for the icon renderer, which paints pixels, not CSS. */
export const rgbBytes = (token: Token): [number, number, number] => {
    const value: string = PALETTE[token]
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(value)
    if (m === null) throw new Error(`${token} is ${value}, not #rrggbb`)
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}
