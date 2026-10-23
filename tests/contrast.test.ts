import { describe, it, expect } from 'vitest'
import { BOARD_TOKENS, CHECKER_RATIO, THEMES, type Theme, type Token } from '@/app/palette'
import { contrast, luminance, over, toRgb, type Rgb } from './colour'
import { CONTROL, type Variant } from '@/app/controls'

/**
 * Every contrast pair the graphics spec names, computed from the tokens (P0-5, row 5).
 *
 * `tests/lineFeedback.test.ts` computed the line labels' ratios against a background it
 * typed out itself. That guarantee held only as long as nobody changed the ground, and the
 * spec changes it (P1-3). So every pair in §4 and §6 is computed here from the palette, and
 * a palette change is re-checked against every bar the moment it is made.
 *
 * **§6's pairs do not all hold yet, and are not meant to.** They are the acceptance bars of
 * rows 7 to 11, which have not happened: a tile face against the light checker tone is 1.47:1
 * today, and P1-1 exists to fix that. So each pair records whether it holds *now*, and the
 * test requires exactly that. A pair that starts holding fails this test until its row marks
 * it held -- the row has to claim it -- and a held pair that stops holding fails as a
 * regression. Neither can happen quietly.
 *
 * **Two themes since UI row 1,** so every table runs in each (`THEMES`), and each theme pins
 * its own values. The board's tokens were equal in both until UI row 4, which gave the board
 * its own dark values and replaced P1-3's chain with UI-SPEC §3.1's silhouette rule. What is
 * history -- what a pair was before a row changed it -- is light's only, as that is the only
 * theme there was.
 */

type Side = Token | { token: Token, alpha: number, over: Token }
type Pair = { a: Side, b: Side, min: number, owner: string, holds: boolean }

/** The values a theme pins, in the order each table lists its pairs. */
type Pins = {
    invariants: string[], onChrome: string[], focus: string[],
    disabledOnGround: string, disabledOnSurface: string,
    silhouette: string[], inside: string[], cellStates: string[],
}

const PINS: Record<Theme, Pins> = {
    // Computed from the tokens at UI row 3, which gave the chrome UI-SPEC §3.1's final values,
    // and at UI row 4, which gave the board and the pieces theirs. The light chrome was P1-4's
    // through row 2: the invariants were 5.62, 6.27, 7.35 and 15.77, and a disabled control
    // 2.30:1. The neutral label was 5.80 until row 4 moved it to §3.1's warm `boardLabel`.
    light: {
        invariants: ['7.21', '4.83', '5.22', '11.92'],
        onChrome: ['13.11', '5.97', '6.57', '5.47', '5.31', '5.75', '11.78', '13.11', '10.52', '7.64', '6.78', '5.31'],
        focus: ['7.33', '8.07', '7.25'],
        disabledOnGround: '2.61', disabledOnSurface: '2.56',
        // The rim, on both wells and the tray; the rock's rim, and on the tile face.
        silhouette: ['4.12', '3.77', '3.25', '4.35', '3.98', '3.43', '5.11'],
        inside: ['12.52', '4.84'],
        // The hint, the anchor, the candidate's edge and the focus, each on both wells.
        cellStates: ['4.45', '4.07', '11.28', '10.32', '11.28', '10.32', '10.84', '9.92'],
    },
    // Row 1 gave dark its ground, ink, success and problem; row 3 the rest of the chrome; row 4
    // the board and the pieces.
    dark: {
        invariants: ['10.43', '10.29', '8.38', '15.87'],
        onChrome: ['13.91', '8.29', '7.26', '7.86', '9.02', '7.35', '11.02', '13.23', '9.02', '6.64', '6.93', '9.45'],
        focus: ['4.78', '4.19', '3.32'],
        disabledOnGround: '3.80', disabledOnSurface: '3.90',
        // No rim: the face and the side, each on both wells and the tray; then the rock's rim.
        silhouette: ['10.30', '11.21', '12.53', '4.43', '4.83', '5.39', '3.19', '3.47', '3.88', '3.23'],
        inside: ['12.63', '3.74'],
        cellStates: ['5.91', '6.43', '6.01', '6.54', '6.01', '6.54', '7.65', '8.33'],
    },
}

/** Each well tone, and the tray: everything a piece's silhouette can touch (UI-SPEC §3.1). */
const EDGE_GROUNDS = ['wellLight', 'wellDark', 'boardTray'] as const

for (const theme of Object.keys(THEMES) as Theme[]) describe(`the ${theme} theme`, () => {
    const P = THEMES[theme]
    const pins = PINS[theme]

    const paint = (side: Side): Rgb =>
        typeof side === 'string' ? toRgb(P[side]) : over(P[side.token], side.alpha, P[side.over])
    const label = (side: Side) =>
        typeof side === 'string' ? side : `${side.token}@${side.alpha} over ${side.over}`

    /** §4: measured into the repository before this spec; text, so 4.5:1. */
    const INVARIANTS: Pair[] = [
        { a: 'lineNeutral', b: 'ground', min: 4.5, owner: 'D10-g', holds: true },
        { a: 'success', b: 'ground', min: 4.5, owner: 'D10-g', holds: true },
        { a: 'problem', b: 'ground', min: 4.5, owner: 'D10-g; the advice strip\'s problem text', holds: true },
        { a: 'ink', b: 'ground', min: 4.5, owner: 'P1-5, the advice strip', holds: true },
    ]

    /**
     * The tones each piece's silhouette exposes (UI-SPEC §3.1, UI row 4): a rim where one is
     * drawn, and otherwise what the rim would enclose. The light domino's rim is `tileEdge`; the
     * dark one's is `transparent`, so it exposes its face and its side. The rock's rim is its
     * face tone in both themes. `e2e/art.spec.ts` checks the rendered page exposes these.
     */
    const domino: Token[] = P.tileEdge === 'transparent' ? ['tileFace', 'tileSide'] : ['tileEdge']

    /**
     * UI-SPEC §3.1's silhouette rule, which replaced P1-3's chain in UI row 4: every tone a
     * piece's silhouette exposes clears 3:1 against everything it can touch -- both wells and
     * the tray, since pieces sit inside their cells' margins and never touch each other. The
     * rock's rim also clears the tile face, as a margin. P1-3's chain held the tile face 3:1
     * over both checker tones and every rock tone over those and the face, which forced the
     * mid-brown checker and the near-black rock.
     */
    const SILHOUETTE: Pair[] = [
        ...domino.flatMap(tone => EDGE_GROUNDS.map(b =>
            ({ a: tone, b, min: 3, owner: 'UI row 4: the domino\'s edge', holds: true }) as Pair)),
        ...([...EDGE_GROUNDS, 'tileFace'] as const).map(b =>
            ({ a: 'rockFace', b, min: 3, owner: 'UI row 4: the rock\'s rim', holds: true }) as Pair),
    ]

    /** Inside the silhouette, on the face: the pip and the divider (P1-1's bars). */
    const INSIDE: Pair[] = [
        { a: 'pip', b: 'tileFace', min: 3, owner: 'P1-1', holds: true },
        { a: 'divider', b: 'tileFace', min: 3, owner: 'P1-1', holds: true },
    ]

    /**
     * P1-5's four states, each held on both well tones, in both themes (UI row 4 moved them onto
     * the new wells). Light keeps every value it had on P1-3's checker; dark took lighter ones,
     * where its dark marks would have vanished on the dark wells -- the anchor's `#16295e` is
     * 1.08:1 on one. The hint is the accent's value (§3.1).
     */
    const CELL_STATES: Pair[] = (['hint', 'anchor', 'candidateEdge', 'cellFocus'] as const).flatMap(state =>
        (['wellLight', 'wellDark'] as const).map(b => ({ a: state, b, min: 3, owner: 'P1-5', holds: true }) as Pair))

    const ratio = (p: Pair) => contrast(paint(p.a), paint(p.b))

    describe('§4: the invariants hold, computed from the tokens', () => {
        for (const pair of INVARIANTS) {
            it(`${label(pair.a)} on ${label(pair.b)} clears ${pair.min}:1 (${pair.owner})`, () => {
                expect(ratio(pair)).toBeGreaterThanOrEqual(pair.min)
            })
        }

        it('at the values §4 records', () => {
            // Rounded to the two places §4 quotes them to. A palette row that moves one of
            // these has to move §4 with it.
            // P1-3 moved the ground to a warm off-white and every one of them with it; they
            // were 5.17, 5.77, 6.76 and 14.53 on `#e8e7e7`. UI row 3 moved the ground, `ink`,
            // `success` and `problem` to UI-SPEC §3.1's; they were 5.62, 6.27, 7.35 and 15.77.
            expect(INVARIANTS.map(p => ratio(p).toFixed(2))).toEqual(pins.invariants)
        })
    })

    describe('the silhouette rule: each exposed tone clears 3:1 on what it can touch (UI row 4)', () => {
        for (const pair of SILHOUETTE) {
            it(`${label(pair.a)} on ${label(pair.b)} clears ${pair.min}:1 (${pair.owner})`, () => {
                expect(ratio(pair)).toBeGreaterThanOrEqual(pair.min)
            })
        }

        it('at the values the tokens give', () => {
            expect(SILHOUETTE.map(p => ratio(p).toFixed(2))).toEqual(pins.silhouette)
        })

        // Why each rim is there: the tone it encloses fails at the edge.
        if (theme === 'light') it('and the light domino needs its rim: its face and its side fail at the edge', () => {
            expect(contrast(P.tileFace, P.wellLight)).toBeLessThan(3)
            expect(contrast(P.tileSide, P.wellLight)).toBeLessThan(3)
        })
        if (theme === 'dark') it('and the dark rock needs its rim: its side fails at the edge', () => {
            expect(contrast(P.rockSide, P.wellLight)).toBeLessThan(3)
        })

        for (const pair of INSIDE) {
            it(`inside it, ${label(pair.a)} on ${label(pair.b)} clears ${pair.min}:1 (${pair.owner})`, () => {
                expect(ratio(pair)).toBeGreaterThanOrEqual(pair.min)
            })
        }

        it('inside it, at the values the tokens give', () => {
            expect(INSIDE.map(p => ratio(p).toFixed(2))).toEqual(pins.inside)
        })
    })

    describe('P1-5: the cell states clear 3:1 on both wells', () => {
        for (const pair of CELL_STATES) {
            it(`${label(pair.a)} on ${label(pair.b)} clears ${pair.min}:1 (${pair.owner})`, () => {
                expect(ratio(pair)).toBeGreaterThanOrEqual(pair.min)
            })
        }

        it('at the values the tokens give', () => {
            expect(CELL_STATES.map(p => ratio(p).toFixed(2))).toEqual(pins.cellStates)
        })
    })

    /**
     * Text on the chrome, UI-SPEC §3.1's pairs (UI row 3; P1-4's until then): every surface
     * text is drawn on, with each foreground it's given there. Text, so 4.5:1, and pinned at
     * the values the tokens give -- `e2e/colourRoles.spec.ts` checks that the page really draws
     * each text in its expected token and not merely in one that clears the bar.
     */
    const ON_CHROME: Pair[] = [
        { a: 'ink', b: 'surface', min: 4.5, owner: 'UI row 3: cards, sheets, raised controls', holds: true },
        { a: 'inkMuted', b: 'ground', min: 4.5, owner: 'UI row 3: muted text on the page', holds: true },
        { a: 'inkMuted', b: 'surface', min: 4.5, owner: 'UI row 3: muted text on a card', holds: true },
        { a: 'onAccent', b: 'accent', min: 4.5, owner: 'UI row 3: the primary, a pressed toggle', holds: true },
        // The completion card's outcome (P2-3), which until then was white on a green card.
        { a: 'success', b: 'surface', min: 4.5, owner: 'P2-3: the completion card\'s "Solved!"', holds: true },
        { a: 'problem', b: 'surface', min: 4.5, owner: 'UI row 3: Reset, the caution; the archive\'s warning', holds: true },
        // Interim surfaces, under the final ink: the day banner's (row 6) and the archive's
        // marks (row 12) keep their values until their rows, and must still carry its text.
        { a: 'ink', b: 'bannerSurface', min: 4.5, owner: 'the day banner, until row 6', holds: true },
        ...(['markNone', 'markStarted', 'markPartial', 'markComplete'] as const).map(b =>
            ({ a: 'ink', b, min: 4.5, owner: 'an archive day, until row 12', holds: true }) as Pair),
        // The satisfied line's pill (UI row 4): its number on the green.
        { a: 'onSuccess', b: 'success', min: 4.5, owner: 'UI row 4: a satisfied line\'s pill', holds: true },
    ]

    describe('UI-SPEC §3.1: text on the chrome\'s surfaces', () => {
        for (const pair of ON_CHROME) {
            it(`${label(pair.a)} on ${label(pair.b)} clears ${pair.min}:1 (${pair.owner})`, () => {
                expect(ratio(pair)).toBeGreaterThanOrEqual(pair.min)
            })
        }

        it('at the values the tokens give', () => {
            expect(ON_CHROME.map(p => ratio(p).toFixed(2))).toEqual(pins.onChrome)
        })

        if (theme === 'light') it('and `ink` on the final accent does not, which is why the primary has `onAccent`', () => {
            expect(ratio({ a: 'ink', b: 'accent', min: 4.5, owner: '', holds: false })).toBeLessThan(4.5)
        })
    })

    /**
     * P1-6's colours (row 12).
     *
     * **A refused move's cross** lands on whatever the refused square holds: either well, a
     * domino's face, or any of a rock's tones. No one colour clears 3:1 on all of them -- in
     * light the red is 1.56 on the rock's face, in dark 1.79 on the tile face -- so it is drawn on
     * a halo, and on every surface one of the two must clear 3:1, with the cross clearing it on
     * the halo so it reads inside it. The red is `refusedCross`, the board's own, since UI row 1;
     * it was the chrome's `problem`. In dark both are UI row 4's: the dark `problem` on the dark
     * ground, the closest pair the halo on the rock's side, 3.13.
     *
     * **A control's focus ring** is drawn outside the control, on what it sits on: every surface a
     * control has, all of them light since P2-3 (row 15) took the completion card off its green,
     * where the ring had been white. The accent's edge since P2-2 (row 14), which asks for the
     * accent on focus; black until then.
     */
    const REFUSAL_SURFACES = ['wellLight', 'wellDark', 'tileFace', 'rockFace', 'rockLit', 'rockShade', 'rockSide'] as const

    const FOCUS_RINGS: Pair[] = [
        ...(['ground', 'surface', 'bannerSurface'] as const).map(b =>
            ({ a: 'accentEdge', b, min: 3, owner: 'P1-6, UI row 3: a control on its surface', holds: true }) as Pair),
    ]

    describe('P1-6: a refused move, a control\'s focus, and a disabled control', () => {
        for (const surface of REFUSAL_SURFACES) {
            it(`the refused cross reads on ${surface}: its halo or its red clears 3:1`, () => {
                const best = Math.max(contrast(P.refusedHalo, P[surface]), contrast(P.refusedCross, P[surface]))
                expect(best).toBeGreaterThanOrEqual(3)
            })
        }

        it('and the red clears 3:1 on its own halo', () => {
            expect(contrast(P.refusedCross, P.refusedHalo)).toBeGreaterThanOrEqual(3)
        })

        it('but neither colour could do it alone, which is why there are two', () => {
            const alone = (token: 'refusedCross' | 'refusedHalo') =>
                REFUSAL_SURFACES.every(s => contrast(P[token], P[s]) >= 3)
            expect([alone('refusedCross'), alone('refusedHalo')]).toEqual([false, false])
        })

        /*
         * The keyboard polish's soft corners, held as the cross is: the keyboard reaches every
         * square, so the brackets land on the same surfaces a refusal does. Their colour clears
         * 3:1 on both wells on its own (the cell states above); the halo is what edges a thin
         * stroke everywhere else, and it only can if it contrasts with the brackets themselves.
         */
        for (const surface of REFUSAL_SURFACES) {
            it(`the focus brackets read on ${surface}: their halo or their colour clears 3:1`, () => {
                const best = Math.max(contrast(P.cellFocusHalo, P[surface]), contrast(P.cellFocus, P[surface]))
                expect(best).toBeGreaterThanOrEqual(3)
            })
        }

        it('and the brackets clear 3:1 on their own halo', () => {
            expect(contrast(P.cellFocus, P.cellFocusHalo)).toBeGreaterThanOrEqual(3)
        })

        for (const pair of FOCUS_RINGS) {
            it(`${label(pair.a)} on ${label(pair.b)} clears ${pair.min}:1 (${pair.owner})`, () => {
                expect(ratio(pair)).toBeGreaterThanOrEqual(pair.min)
            })
        }

        it('at the values the tokens give', () => {
            expect(FOCUS_RINGS.map(p => ratio(p).toFixed(2))).toEqual(pins.focus)
        })
    })

    /**
     * Disabled controls (P1-6, P2-2; UI row 3). WCAG exempts them, and nothing here is a bar:
     * these are the values, pinned, so a row that moves them does it in the open. Read from the
     * variants in `app/controls.ts`: a disabled control is its variant's disabled surface and
     * ink at the variant's opacity, over what it sits on. Row 3 moved them all: 45% where it was
     * 40%, the edge gone, and one surface for every raised control and a disabled primary.
     */
    describe('disabled, in every variant that is ever disabled', () => {
        const disabled = (variant: 'primary' | 'raised', on: Token): Pair => {
            const c: Variant = CONTROL[variant]
            const surface = c.disabled.surface ?? (typeof c.surface === 'string' ? c.surface : on)
            const ink = c.disabled.ink ?? c.ink ?? 'ink'
            const alpha = c.disabled.opacity ?? 1
            return {
                a: { token: ink, alpha, over: on }, b: { token: surface, alpha, over: on },
                min: 0, owner: `a disabled ${variant} control`, holds: true,
            }
        }

        it(`Undo, Hint and Check on the page: ${pins.disabledOnGround}:1`, () => {
            expect(ratio(disabled('raised', 'ground')).toFixed(2)).toBe(pins.disabledOnGround)
            // A disabled primary gives the accent up for the raised look, so it is the same.
            expect(ratio(disabled('primary', 'ground')).toFixed(2)).toBe(pins.disabledOnGround)
        })

        it(`the tutorial's "Got it!" and the archive's arrows, on a card: ${pins.disabledOnSurface}:1`, () => {
            expect(ratio(disabled('primary', 'surface')).toFixed(2)).toBe(pins.disabledOnSurface)
            expect(ratio(disabled('raised', 'surface')).toFixed(2)).toBe(pins.disabledOnSurface)
        })
    })

})

describe('the pairs that cross themes', () => {
    it('the board is painted in each theme\'s own values since UI row 4, but for the drag wash', () => {
        // Until row 4 nothing on the board changed with the theme, and its pairs above came out
        // the same twice. Checked here as well as in palette.test.ts, so a board token left at
        // its light value fails beside the pairs it should have moved.
        expect(BOARD_TOKENS.filter(t => THEMES.dark[t] === THEMES.light[t])).toEqual(['dragWash'])
    })
})

describe('the two well tones (P1-3\'s checker, UI row 4\'s wells)', () => {
    for (const theme of Object.keys(THEMES) as Theme[]) {
        it(`stand ${CHECKER_RATIO}:1 apart in the ${theme} theme, as stated, the light tone the lighter`, () => {
            // Stated as a ratio, so a later retune has to move the statement with the tones.
            const P = THEMES[theme]
            expect(luminance(P.wellLight)).toBeGreaterThan(luminance(P.wellDark))
            expect(contrast(P.wellLight, P.wellDark).toFixed(2)).toBe(CHECKER_RATIO.toFixed(2))
        })
    }
})

describe('the colour maths, checked against values it did not produce', () => {
    it('reads hex', () => {
        expect(toRgb('#ff0000')).toEqual([1, 0, 0])
        expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    })

    it('reads oklch: white, and the reference red', () => {
        // oklch(62.8% 0.2577 29.23) is sRGB red, per CSS Color 4's own worked example.
        const close = (a: Rgb, b: Rgb) => a.forEach((c, i) => expect(c).toBeCloseTo(b[i], 2))
        close(toRgb('oklch(100% 0 0)'), [1, 1, 1])
        close(toRgb('oklch(62.8% 0.2577 29.23)'), [1, 0, 0])
    })

    it('composites a translucent colour over what is under it', () => {
        expect(over('#000000', 0.5, '#ffffff')).toEqual([0.5, 0.5, 0.5])
        expect(over('#000000', 0, '#ffffff')).toEqual([1, 1, 1])
    })
})
