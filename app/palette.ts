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
     * A tray of wells (UI-SPEC §4.1, UI row 4). Until row 4 the board was P1-3's chain of 3:1
     * steps -- the tile face over both checker tones, both tones over every rock tone -- which
     * forced a mid-brown checker (`#9c8a72`, `#8e7c66`) in a near-black frame (`#4d3f33`).
     * The silhouette rule replaced it: each tone a piece exposes at its edge clears 3:1 against
     * both wells and the tray, and a tone that can't sits inside a rim (§3.1). So the wells
     * can be light, and only 1.09:1 apart (`CHECKER_RATIO`): the gaps between them carry the
     * grid now.
     */
    /** The tray the wells sit in, and the gaps between them. Its edge is `trayEdge`. */
    boardTray: '#e2ccae',
    /** Wells where row + column is even (the top-left well is one). `checkerLight` until row 4. */
    wellLight: '#f3e6d2',
    /** Wells where row + column is odd. `checkerDark` until row 4. */
    wellDark: '#eddcc2',
    /**
     * The solid edge beneath the tray, and its inset shadow at 35% (UI row 4's clarification
     * of §4.1). Decorative, as a raised control's edge is.
     */
    trayEdge: '#c9b08c',

    // ---- the pieces ----------------------------------------------------------------------
    /** The domino's face: 1.18:1 on the light well, so it sits inside the rim. */
    tileFace: '#fff9ef',
    /** The domino's raised side, 4 units deep: inside the rim in light, where it fails at the edge. */
    tileSide: '#c9ae88',
    /**
     * The light domino's rim, 2 units round the whole silhouette: 4.12 and 3.77:1 on the wells,
     * 3.25 on the tray. It replaced `pieceOutline`, the 9-unit black outline every piece drew
     * until row 4. Dark has none: its face and side clear the edge on their own (§3.1).
     */
    tileEdge: '#8a6844',
    /**
     * The rock (§4.4). Its face and its rim are `rockFace`, the spec's `rock`: as the rim, 4.35
     * and 3.98:1 on the wells, 3.43 on the tray and 5.11 on the tile face. The side and the
     * shaded facet take `rockSide`'s value, and the lit facet is decorative; all three sit
     * inside the rim. Until row 4 all four were near-black (`#2c2925`, `#37332e`, `#221f1c`,
     * `#171513`), the only tones that cleared P1-3's mid-brown checker.
     */
    rockFace: '#77685e',
    rockLit: '#8e8075',
    rockShade: '#5a4d45',
    rockSide: '#5a4d45',
    /** The pip: the score. 12.52:1 on the face. Black until row 4. */
    pip: '#3a2e28',
    /** The groove that makes a domino a domino rather than a tile: 4.84:1 on the face. */
    divider: '#8a6844',

    // ---- meaning -------------------------------------------------------------------------
    /**
     * A line label with nothing to report: UI-SPEC's `boardLabel`, the same role. 7.21:1 on the
     * ground since UI row 4, where it was the neutral grey `#5f5f5f`.
     */
    lineNeutral: '#5e4e44',
    /**
     * Finished, or on its way: a satisfied line's pill, a reached line's number and bar
     * (UI row 4), and a finished puzzle -- the completion card's "Solved!" (P2-3). Nothing
     * else. UI-SPEC §3.1's green since UI row 3; it was `#15661a`.
     */
    success: '#1e7a4f',
    /** Text on `success`: the satisfied pill's number (UI row 4). 5.31:1. */
    onSuccess: '#ffffff',
    /**
     * Something is wrong: an overshot line, the advice strip when it is reporting a problem,
     * and the archive's error message. And `Reset`'s text, the caution variant: not
     * something wrong, but something that can't be taken back (P2-2's edge until UI row 3,
     * whose raised controls have none). It drew the refused cross too until UI row 1, which
     * gave the board its own `refusedCross`. UI-SPEC §3.1's red since row 3; it was `#a10000`.
     */
    problem: '#b83a14',
    /**
     * The cell a hint is pointing at. The accent's value since UI row 4, as UI-SPEC §3.1's table
     * gives it: 4.45 and 4.07:1 on the wells. A token of its own all the same, for its role:
     * `e2e/colourRoles.spec.ts` declares the two as aliases, and `e2e/themeTokens.spec.ts`
     * proves the diamond reads this one. It shared `success`'s value until P1-3, and was the
     * dark green `#0b3b10` from then until row 4.
     */
    hint: '#0f766e',

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
     * 3:1 against the light tone; on that row's mid-brown checker it needed a far darker blue.
     * On UI row 4's wells it is 11.28 and 10.32:1, and kept.
     */
    anchor: '#16295e',
    /**
     * A square the anchor could pair with: a dashed edge over a `blue-200` wash at 40%.
     * The edge was `blue-400`, 1.63 and 1.15 on the old checker; P1-5 needs 3:1 on both
     * tones of the new one, and only a blue as dark as the anchor's reaches it. It shares
     * the anchor's value, not its role: the two are told apart by shape (P1-5).
     */
    candidateEdge: '#16295e',
    /**
     * The candidate's wash, at 40%: what tells a candidate from the anchor without colour, its
     * ring being the anchor's, dashed. A mid blue since UI row 4. Tailwind's pale `blue-200`,
     * `oklch(88.2% 0.059 254.128)`, moved no pixel of the new cream wells by the 32 levels of
     * lightness `e2e/cellStates.spec.ts` counts (it moved P1-3's mid-brown checker by plenty),
     * and the two states came out 6.6% apart in greyscale, under P1-5's 15%: at any opacity,
     * since the blue itself was within 15 levels of the wells. This is 35-37% apart. The dark
     * theme keeps the pale blue, which on the dark wells is.
     */
    candidateWash: 'oklch(60% 0.11 254)',
    /**
     * The keyboard's square: its corner brackets, opaque since P1-5 (they were 70%). The
     * accent's edge's hue since the keyboard polish, as the board's own focus ring is, where
     * they were black: the same "the keyboard is here", at two scales. Darkened to 85%: the
     * accent's edge itself, `#0b3c52`, was 2.93:1 on P1-3's dark checker tone, under the 3:1
     * these have held since P1-5. On UI row 4's wells this is 10.84 and 9.92:1.
     */
    cellFocus: '#093346',
    /**
     * The halo round the focus brackets (keyboard polish). As with the refused cross's, it
     * keeps a thin stroke in sight where the colour alone is too close: on the rock's tones.
     */
    cellFocusHalo: '#ffffff',
    /**
     * The halo round a refused move's cross (P1-6). On every refusal surface -- both wells,
     * the tile face, each rock tone -- the halo or the red clears 3:1, and neither alone does.
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
 * The ratio the two well tones stand apart, in WCAG contrast, in both themes: stated, and held
 * by `tests/contrast.test.ts` to what the tones compute to. 1.09 since UI row 4 (§4.1); P1-3's
 * checker was 1.2, the step that left its near-black rock room to be a rock.
 */
export const CHECKER_RATIO = 1.09

export type Token = keyof typeof PALETTE

/**
 * The tokens drawn on the board: the tray and its wells, the pieces, and the cell states.
 * Equal in both themes until UI row 4 gave the board its dark values (UI-SPEC §3.1's
 * rollout); since then only the drag wash is shared, which `tests/palette.test.ts` holds.
 */
export const BOARD_TOKENS = [
    'boardTray', 'wellLight', 'wellDark', 'trayEdge',
    'tileFace', 'tileSide', 'tileEdge', 'rockFace', 'rockLit', 'rockShade', 'rockSide',
    'pip', 'divider',
    'hint', 'anchor', 'candidateEdge', 'candidateWash', 'cellFocus', 'cellFocusHalo',
    'refusedHalo', 'refusedCross', 'dragWash',
] as const satisfies readonly Token[]

/**
 * The dark theme (UI row 1), with exactly `PALETTE`'s keys: a token missing or extra is a
 * type error, and `tests/palette.test.ts` says so again at run time.
 *
 * Every value is UI-SPEC §3.1's final one since UI row 4, which gave the board and the
 * pieces theirs; row 3 gave the chrome its own. Each pair is computed in
 * `tests/contrast.test.ts`.
 */
export const PALETTE_DARK: Readonly<Record<Token, string>> = {
    // ---- the page: ink 15.87 and inkMuted 8.29:1 on the ground; on the surface 13.91, 7.26
    ground: '#16110e',
    ink: '#f3ebe1',
    inkMuted: '#b9aa9b',
    surface: '#251e19',
    raisedEdge: '#0d0a08',

    // ---- the board (UI row 4): the wells 1.09:1 apart
    boardTray: '#2a221c',
    wellLight: '#3a3029',
    wellDark: '#342a23',
    trayEdge: '#0d0a08',

    // ---- the pieces: the face 10.30 and 11.21:1 on the wells, 12.53 on the tray, and the
    // side 4.43, 4.83 and 5.39, so the dark domino needs no rim and `tileEdge` draws none.
    // `transparent` is the palette's one value that is not a colour, allowed here only.
    tileFace: '#efe5d5',
    tileSide: '#a8957a',
    tileEdge: 'transparent',
    // The rock's rim, `rockFace`: 3.19 and 3.47:1 on the wells, 3.88 on the tray, 3.23 on the
    // face -- a narrow band (§3.1). Its side fails at the edge, 2.15, so it sits inside the rim.
    rockFace: '#8b7c70',
    rockLit: '#a1907f',
    rockShade: '#6e6156',
    rockSide: '#6e6156',
    pip: '#2a211c',
    divider: '#857158',

    // ---- meaning: 10.43, 10.29 and 8.38:1 on the ground
    lineNeutral: '#cdbfb1',
    success: '#5bd69a',
    onSuccess: '#0b1f14',
    problem: '#ff8f6b',
    // The accent's value, as in light: 5.91 and 6.43:1 on the wells.
    hint: '#3cc3b4',

    // ---- interactive chrome: onAccent on the accent is 7.86:1
    accent: '#3cc3b4',
    onAccent: '#0b1f1d',
    accentEdge: '#2a8f84',

    // ---- the cell states, kept legible on the dark wells by UI row 4; row 5 restyles them.
    // The light values were dark marks on light wells, and on these would vanish: the anchor's
    // `#16295e` is 1.08 and 1.01:1 on them.
    anchor: '#8fb0ff',
    candidateEdge: '#8fb0ff',
    candidateWash: 'oklch(88.2% 0.059 254.128)',
    cellFocus: '#8ed1ee',
    cellFocusHalo: '#16110e',
    // As in light, the halo or the cross clears 3:1 on every refusal surface, and neither
    // alone does: the closest is the cross on the rock's side, 3.13.
    refusedHalo: '#16110e',
    refusedCross: '#ff8f6b',
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
