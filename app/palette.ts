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
 * Where the name records what a token replaced (`tutorialAction` was `blue-500`), that is
 * provenance for the rows that will change it, not a promise it stays that colour.
 */
export const PALETTE = {
    // ---- the page ------------------------------------------------------------------------
    /** The board's ground: the page, the browser chrome, the splash screen, the icon. */
    ground: '#e8e7e7',
    /** Body text on the ground; the advice strip's 14.53:1 (spec §4). */
    ink: '#171717',

    // ---- the board -----------------------------------------------------------------------
    /** Squares where row + column is even (the top-left square is one). */
    checkerLight: '#cbcbcb',
    /** Squares where row + column is odd. */
    checkerDark: '#ababab',
    boardFrame: '#666666',

    // ---- the pieces ----------------------------------------------------------------------
    tileFace: '#fff3d6',
    /** The extruded side of a tile, and the body of the icon's tile. */
    tileSide: '#8d8778',
    /**
     * The rock's four tones: its facing plane, the lit and shaded facets, and the extruded
     * side (P1-2). Every one clears 3:1 against both checker tones and the tile face, which
     * is why all four are dark: against the darker checker, 3:1 needs a luminance under
     * about 0.10.
     */
    rockFace: '#46423e',
    rockLit: '#5a5550',
    rockShade: '#35322f',
    rockSide: '#24221f',
    /** The silhouette's edge, on dominoes and rocks alike. */
    pieceOutline: '#000000',
    /** The pip: the score. The icon drew `#1a1a1a` until this row; it now draws this. */
    pip: '#000000',
    /** The line that makes a domino a domino rather than a tile. */
    divider: '#000000',

    // ---- meaning -------------------------------------------------------------------------
    /** A line label with nothing to report (5.17:1 on the ground, spec §4). */
    lineNeutral: '#5f5f5f',
    /** A finished line (5.77:1). Shares its value with `hint` today, not its role. */
    success: '#15661a',
    /** An overshot line, and the advice strip when it is reporting a problem (6.76:1). */
    problem: '#a10000',
    /** The cell a hint is pointing at. */
    hint: '#15661a',
    /** The archive's error message. Tailwind `red-700`; not yet `problem` (P1-4). */
    alert: 'oklch(50.5% 0.213 27.518)',

    // ---- interactive chrome --------------------------------------------------------------
    /** The one interactive accent (§2.2): the selected difficulty, the completion card. */
    accent: '#419dc8',
    /** The ring around the selected difficulty -- its non-colour channel's colour. */
    accentEdge: '#0b3c52',
    /** Text and translucent washes on an accent surface. */
    onAccent: '#ffffff',
    /** Check, Hint, Undo, Reset, the difficulty group and the domino legend's tray. */
    controlSurface: '#ababab',
    /** The board's own focus ring. Tailwind `blue-500`. */
    focusRing: 'oklch(62.3% 0.214 259.815)',
    /** The level arrows, still in Material's palette -- P1-4 makes them the accent. */
    levelArrowFill: '#4fc3f7',
    levelArrowStroke: '#0288d1',

    // ---- the cell states (P1-5 owns these) -------------------------------------------------
    /** The first half of a two-step move. Tailwind `blue-600`. */
    anchor: 'oklch(54.6% 0.245 262.881)',
    /** A square the anchor could pair with: edge `blue-400`, wash `blue-200` at 40%. */
    candidateEdge: 'oklch(70.7% 0.165 254.624)',
    candidateWash: 'oklch(88.2% 0.059 254.128)',
    /** The keyboard's square, drawn at 70%. */
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
    /** The ring on the day being viewed. Tailwind `sky-600`. */
    archiveCurrent: 'oklch(58.8% 0.158 241.966)',

    // ---- the day banner ------------------------------------------------------------------
    /** Tailwind `amber-100`. */
    bannerSurface: 'oklch(96.2% 0.059 95.617)',
    /** "Go to today". Tailwind `amber-700`. */
    bannerAction: 'oklch(55.5% 0.163 48.998)',
    onBannerAction: '#ffffff',

    // ---- the tutorial --------------------------------------------------------------------
    /** "Got it!". Tailwind `blue-500`; one of the blues P1-4 folds into the accent. */
    tutorialAction: 'oklch(62.3% 0.214 259.815)',
    /** Tailwind `blue-600`. */
    tutorialActionHover: 'oklch(54.6% 0.245 262.881)',
    onTutorialAction: '#ffffff',
} as const

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
