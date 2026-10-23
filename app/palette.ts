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
 * **Two themes since UI row 1.** `PALETTE` is the light one, and what every Node consumer
 * reads; `PALETTE_DARK`, below, has the same keys. The browser picks between them in CSS, so
 * components read a token through `cssVar`, never as a value.
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
     * The board's ground: the page, the browser chrome, the splash screen, the icon. UI-SPEC
     * §3.1's warm cream since UI row 3; `#f4f0e8` from P1-3, the neutral `#e8e7e7` before.
     */
    ground: '#fbf3e8',
    /**
     * Text, on the ground and on `surface`: a warm brown-black since UI row 3, where it was
     * `#171717`. 11.92:1 on the ground, 13.11:1 on the surface (UI-SPEC §3.1).
     */
    ink: '#3a2e28',
    /**
     * Secondary text: a note under a heading, a clock not yet running (UI row 3). It replaced
     * opacity on those, so it keeps 4.5:1 wherever it's drawn: 5.97 on the ground, 6.57 on the
     * surface.
     */
    inkMuted: '#6b5a4e',
    /**
     * Cards, sheets and raised controls (UI row 3). It replaced `panel` (the cards' white) and
     * `controlSurface` (the controls' warm grey), which were two surfaces for one role.
     */
    surface: '#ffffff',
    /**
     * The solid edge beneath a raised control (UI-SPEC §3.3). Decorative: a control is known by
     * its label, and the edge only says it can be pressed.
     */
    raisedEdge: '#eadcc9',

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
     * Finished: a finished line, and a finished puzzle -- the completion card's "Solved!"
     * (P2-3). Nothing else. UI-SPEC §3.1's green since UI row 3; it was `#15661a`.
     */
    success: '#1e7a4f',
    /**
     * Something is wrong: an overshot line, the advice strip when it is reporting a problem,
     * and the archive's error message. And `Reset`'s text, the caution variant: not
     * something wrong, but something that can't be taken back (P2-2's edge until UI row 3,
     * whose raised controls have none). It drew the refused cross too until UI row 1, which
     * gave the board its own `refusedCross`. UI-SPEC §3.1's red since row 3; it was `#a10000`.
     */
    problem: '#b83a14',
    /**
     * The cell a hint is pointing at. It shared `success`'s value until P1-3, whose darker
     * checker it no longer cleared 3:1 against; now a green dark enough to.
     */
    hint: '#0b3b10',

    // ---- interactive chrome --------------------------------------------------------------
    /*
     * One accent, and only on interactive chrome (§2.2, P1-4): the primary controls, any
     * control pressed into a state or held down, and the level arrows (P2-2). Until P1-4
     * there were five blues -- this, Material's two for
     * the arrows, Tailwind's `blue-500` and `blue-600` for the tutorial and the board's
     * focus ring, `sky-600` for the archive's current day -- and an amber for "Go to
     * today". UI-SPEC §3.1's teal since UI row 3, with `onAccent` text on it; it was the pale
     * blue `#419dc8`, with `ink` on it.
     */
    accent: '#0f766e',
    /** Text on the accent (UI row 3): 5.47:1. */
    onAccent: '#ffffff',
    /**
     * The accent's edge: the primary's raised edge (UI row 3), and rings and strokes -- the
     * focus ring every control draws, the primary's hover, the arrows' outline, the archive's
     * current day, the board's focus ring. It was `#0b3c52` until row 3.
     */
    accentEdge: '#0a5a54',

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
    /**
     * The keyboard's square: its corner brackets, opaque since P1-5 (they were 70%). The
     * accent's edge's hue since the keyboard polish, as the board's own focus ring is, where
     * they were black: the same "the keyboard is here", at two scales. Darkened to 85%: the
     * accent's edge itself, `#0b3c52`, is 2.93:1 on the dark checker tone, under the 3:1
     * these have held since P1-5. This is 3.32:1 there and 4.00:1 on the light tone.
     */
    cellFocus: '#093346',
    /**
     * The halo round the focus brackets (keyboard polish). As with the refused cross's, it
     * keeps a thin stroke in sight on the dark rock and on a domino's edge, where the colour
     * alone is too close.
     */
    cellFocusHalo: '#ffffff',
    /**
     * The halo round a refused move's cross (P1-6). The halo is what clears 3:1 on both
     * checker tones and every rock tone; the red, on the tile's face, where the halo does not.
     */
    refusedHalo: '#ffffff',
    /**
     * The refused move's cross itself (P1-6): `problem`'s red, and `problem` until UI row 1,
     * which split the two because the cross is drawn on the board and `problem` on the chrome,
     * and the two sides change theme at different rows.
     */
    refusedCross: '#a10000',
    /** The wash over the squares a drag would cover, drawn at 70%. */
    dragWash: '#ffffff',

    // ---- dialogs and surfaces ------------------------------------------------------------
    /** Behind a modal, drawn at 40%. */
    scrim: '#000000',

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
 * The tokens drawn on the board: its squares, the pieces, and the cell states. Equal in both
 * themes until UI row 4 gives the board its dark values (UI-SPEC §3.1's rollout), and held
 * equal by `tests/palette.test.ts`, so the dark theme changes the chrome round the board and
 * nothing on it.
 */
export const BOARD_TOKENS = [
    'checkerLight', 'checkerDark', 'boardFrame',
    'tileFace', 'tileSide', 'rockFace', 'rockLit', 'rockShade', 'rockSide',
    'pieceOutline', 'pip', 'divider',
    'hint', 'anchor', 'candidateEdge', 'candidateWash', 'cellFocus', 'cellFocusHalo',
    'refusedHalo', 'refusedCross', 'dragWash',
] as const satisfies readonly Token[]

/**
 * The dark theme (UI row 1), with exactly `PALETTE`'s keys: a token missing or extra is a
 * type error, and `tests/palette.test.ts` says so again at run time.
 *
 * **The board is interim, on purpose.** Its tokens are the light ones, read from `PALETTE`
 * rather than copied, until row 4. The chrome's are UI-SPEC §3.1's final values since row 3,
 * which gave the accent its bright teal with `onAccent` dark text; row 1's interim dark teal
 * carried `ink`. Each pair is computed in `tests/contrast.test.ts`.
 */
export const PALETTE_DARK: Readonly<Record<Token, string>> = {
    // ---- the page: ink 15.87 and inkMuted 8.29:1 on the ground; on the surface 13.91, 7.26
    ground: '#16110e',
    ink: '#f3ebe1',
    inkMuted: '#b9aa9b',
    surface: '#251e19',
    raisedEdge: '#0d0a08',

    // ---- the board, unchanged until row 4
    checkerLight: PALETTE.checkerLight,
    checkerDark: PALETTE.checkerDark,
    boardFrame: PALETTE.boardFrame,
    tileFace: PALETTE.tileFace,
    tileSide: PALETTE.tileSide,
    rockFace: PALETTE.rockFace,
    rockLit: PALETTE.rockLit,
    rockShade: PALETTE.rockShade,
    rockSide: PALETTE.rockSide,
    pieceOutline: PALETTE.pieceOutline,
    pip: PALETTE.pip,
    divider: PALETTE.divider,

    // ---- meaning: 10.43, 10.29 and 8.38:1 on the ground
    lineNeutral: '#cdbfb1',
    success: '#5bd69a',
    problem: '#ff8f6b',
    hint: PALETTE.hint,

    // ---- interactive chrome: onAccent on the accent is 7.86:1
    accent: '#3cc3b4',
    onAccent: '#0b1f1d',
    accentEdge: '#2a8f84',

    // ---- the cell states, unchanged until row 5
    anchor: PALETTE.anchor,
    candidateEdge: PALETTE.candidateEdge,
    candidateWash: PALETTE.candidateWash,
    cellFocus: PALETTE.cellFocus,
    cellFocusHalo: PALETTE.cellFocusHalo,
    refusedHalo: PALETTE.refusedHalo,
    refusedCross: PALETTE.refusedCross,
    dragWash: PALETTE.dragWash,

    // ---- dialogs
    scrim: '#000000',

    // ---- the archive's day marks: ink on each clears 6.6:1
    markNone: '#2a221c',
    markStarted: '#4a3d16',
    markPartial: '#6a4d0c',
    markComplete: '#0f5a44',

    // ---- the day banner
    bannerSurface: '#3a3016',
}

/** Each theme's values, by name, for the stylesheet renderer and the contrast tests. */
export const THEMES = { light: PALETTE, dark: PALETTE_DARK } as const

export type Theme = keyof typeof THEMES

/**
 * A token's CSS custom property, and the Tailwind utility suffix it generates:
 * `tileFace` is `--tile-face` and `bg-tile-face`.
 */
export const cssName = (token: Token): string =>
    token.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)

/**
 * A token as the browser should paint it: `var(--tile-face)`, which follows the theme
 * (UI row 1). Every drawing in the app reads its colour this way, as a `style` property
 * rather than an SVG presentation attribute, so nothing depends on how a browser resolves
 * `var()` inside one. Only the build-time consumers -- the icon, the manifest, the browser
 * chrome's colour -- read `PALETTE` itself.
 */
export const cssVar = (token: Token): string => `var(--${cssName(token)})`

/** A `#rrggbb` token as bytes, for the icon renderer, which paints pixels, not CSS. */
export const rgbBytes = (token: Token): [number, number, number] => {
    const value: string = PALETTE[token]
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(value)
    if (m === null) throw new Error(`${token} is ${value}, not #rrggbb`)
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}
