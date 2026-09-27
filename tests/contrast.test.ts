import { describe, it, expect } from 'vitest'
import { CHECKER_RATIO, PALETTE, type Token } from '@/app/palette'
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
 */

type Side = Token | { token: Token, alpha: number, over: Token }
type Pair = { a: Side, b: Side, min: number, owner: string, holds: boolean }

const paint = (side: Side): Rgb =>
    typeof side === 'string' ? toRgb(PALETTE[side]) : over(PALETTE[side.token], side.alpha, PALETTE[side.over])
const label = (side: Side) =>
    typeof side === 'string' ? side : `${side.token}@${side.alpha} over ${side.over}`

/** §4: measured into the repository before this spec; text, so 4.5:1. */
const INVARIANTS: Pair[] = [
    { a: 'lineNeutral', b: 'ground', min: 4.5, owner: 'D10-g', holds: true },
    { a: 'success', b: 'ground', min: 4.5, owner: 'D10-g', holds: true },
    { a: 'problem', b: 'ground', min: 4.5, owner: 'D10-g; the advice strip\'s problem text', holds: true },
    { a: 'ink', b: 'ground', min: 4.5, owner: 'P1-5, the advice strip', holds: true },
]

/** §6: the art rows' bars, 3:1 for graphics that carry information. */
const OWED: Pair[] = [
    ...(['checkerLight', 'checkerDark'] as const).flatMap(checker => [
        // P1-1 lists this bar, but only the checker tones could meet it, and they were
        // P1-3's (see P1-1's amendment). Held since P1-3 darkened and warmed the checker.
        { a: 'tileFace', b: checker, min: 3, owner: 'P1-3', holds: true } as Pair,
        { a: 'pieceOutline', b: checker, min: 3, owner: 'P1-1', holds: true } as Pair,
    ]),
    { a: 'pip', b: 'tileFace', min: 3, owner: 'P1-1', holds: true },
    { a: 'divider', b: 'tileFace', min: 3, owner: 'P1-1', holds: true },
    { a: 'pieceOutline', b: 'tileFace', min: 3, owner: 'P1-1', holds: true },
    // Every tone the rock shows, not only its face: each is part of the rock against the
    // board, and against a domino beside it. Held since P1-2 (row 8); P1-3 moves the
    // checker tones and must keep them held.
    ...(['rockFace', 'rockLit', 'rockShade', 'rockSide'] as const).flatMap(rock =>
        (['checkerLight', 'checkerDark', 'tileFace'] as const).map(b =>
            ({ a: rock, b, min: 3, owner: 'P1-2', holds: true }) as Pair)),
    ...(['checkerLight', 'checkerDark'] as const).flatMap(checker => [
        // P1-5's four states, each held on both tones since row 11. The anchor held on the
        // light tone only until P1-3; the candidate edge on neither until P1-5; the focus
        // was a 70% wash of black until P1-5 drew it opaque.
        { a: 'hint', b: checker, min: 3, owner: 'P1-5', holds: true } as Pair,
        { a: 'anchor', b: checker, min: 3, owner: 'P1-5', holds: true } as Pair,
        { a: 'candidateEdge', b: checker, min: 3, owner: 'P1-5', holds: true } as Pair,
        { a: 'cellFocus', b: checker, min: 3, owner: 'P1-5', holds: true } as Pair,
    ]),
]

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
        // were 5.17, 5.77, 6.76 and 14.53 on `#e8e7e7`.
        expect(INVARIANTS.map(p => ratio(p).toFixed(2))).toEqual(['5.62', '6.27', '7.35', '15.77'])
    })
})

describe('§6: each art row\'s bar, and whether it holds yet', () => {
    for (const pair of OWED) {
        it(`${label(pair.a)} on ${label(pair.b)}: ${pair.min}:1 ${pair.holds ? 'holds' : `owed by ${pair.owner}`}`, () => {
            const r = ratio(pair)
            const message = pair.holds
                ? `${r.toFixed(2)}:1 no longer clears ${pair.min}:1`
                : `${r.toFixed(2)}:1 now clears ${pair.min}:1 -- ${pair.owner} should mark it held`
            expect(r >= pair.min, message).toBe(pair.holds)
        })
    }
})

/**
 * P1-4's text on chrome: each surface a control or the completion card can have, with the
 * foreground it is given. Text, so 4.5:1. The spec quotes these ratios, so they are
 * asserted at those values as well as at the bar -- and `e2e/colourRoles.spec.ts` checks
 * that the page really draws each surface with this foreground and not another.
 */
const ON_CHROME: Pair[] = [
    { a: 'ink', b: 'accent', min: 4.5, owner: 'P1-4: the selected difficulty, the primary actions', holds: true },
    { a: 'onSuccess', b: 'success', min: 4.5, owner: 'P1-4: the completion card', holds: true },
    { a: 'ink', b: 'controlSurface', min: 4.5, owner: 'P1-4: the quiet controls', holds: true },
]

describe('P1-4: text on the chrome\'s surfaces', () => {
    for (const pair of ON_CHROME) {
        it(`${label(pair.a)} on ${label(pair.b)} clears ${pair.min}:1 (${pair.owner})`, () => {
            expect(ratio(pair)).toBeGreaterThanOrEqual(pair.min)
        })
    }

    it('at the values the spec quotes', () => {
        expect(ON_CHROME.map(p => ratio(p).toFixed(2))).toEqual(['5.87', '7.13', '12.82'])
    })

    it('and the white the accent carried until P1-4 does not, which is why it is ink now', () => {
        // The mutation codex named at row 10's review: white on the accent is 3.05:1.
        expect(ratio({ a: 'onSuccess', b: 'accent', min: 4.5, owner: '', holds: false })).toBeLessThan(4.5)
    })
})

/**
 * P1-6's colours (row 12).
 *
 * **A refused move's cross** lands on whatever the refused square holds: either checker
 * tone, a domino's face, or any of a rock's tones. No one colour clears 3:1 on all of them
 * -- the red is 2.08 on the dark tone and 1.73 on the rock's face -- so it is drawn red on a
 * white halo, and on every surface one of the two must clear 3:1, with the red clearing it
 * on the halo so the cross reads inside it.
 *
 * **A control's focus ring** is drawn outside the control, on what it sits on: every light
 * surface a control has, and the completion card's green, where the ring is white. The
 * accent's edge since P2-2 (row 14), which asks for the accent on focus; black until then.
 */
const REFUSAL_SURFACES = ['checkerLight', 'checkerDark', 'tileFace', 'rockFace', 'rockLit', 'rockShade', 'rockSide'] as const

const FOCUS_RINGS: Pair[] = [
    ...(['ground', 'controlSurface', 'panel', 'bannerSurface'] as const).map(b =>
        ({ a: 'accentEdge', b, min: 3, owner: 'P1-6, P2-2: a control on a light surface', holds: true }) as Pair),
    { a: 'onSuccess', b: 'success', min: 3, owner: 'P1-6: the completion card\'s buttons', holds: true },
]

/**
 * `Undo` on arrival, disabled: the button at 40% opacity over the ground, so its text is
 * ink at 40% and its surface the control surface at 40%, both over the ground. P1-6 asks
 * that the disabled treatment keep the contrast it has; this is that contrast, pinned.
 */
const DISABLED_UNDO: Pair = {
    a: { token: 'ink', alpha: 0.4, over: 'ground' },
    b: { token: 'controlSurface', alpha: 0.4, over: 'ground' },
    min: 0, owner: 'P1-6: disabled keeps its contrast', holds: true,
}

describe('P1-6: a refused move, a control\'s focus, and a disabled control', () => {
    for (const surface of REFUSAL_SURFACES) {
        it(`the refused cross reads on ${surface}: its halo or its red clears 3:1`, () => {
            const best = Math.max(contrast(PALETTE.refusedHalo, PALETTE[surface]), contrast(PALETTE.problem, PALETTE[surface]))
            expect(best).toBeGreaterThanOrEqual(3)
        })
    }

    it('and the red clears 3:1 on its own halo', () => {
        expect(contrast(PALETTE.problem, PALETTE.refusedHalo)).toBeGreaterThanOrEqual(3)
    })

    it('but neither colour could do it alone, which is why there are two', () => {
        const alone = (token: 'problem' | 'refusedHalo') =>
            REFUSAL_SURFACES.every(s => contrast(PALETTE[token], PALETTE[s]) >= 3)
        expect([alone('problem'), alone('refusedHalo')]).toEqual([false, false])
    })

    for (const pair of FOCUS_RINGS) {
        it(`${label(pair.a)} on ${label(pair.b)} clears ${pair.min}:1 (${pair.owner})`, () => {
            expect(ratio(pair)).toBeGreaterThanOrEqual(pair.min)
        })
    }

    it('and the light surfaces\' ring would not do on the green, which is why the card has its own', () => {
        expect(ratio({ a: 'accentEdge', b: 'success', min: 3, owner: '', holds: false })).toBeLessThan(3)
    })

    it('a disabled Undo keeps the contrast it had before P1-6', () => {
        // 2.30:1, measured from the tokens at row 12. Under 3:1, and WCAG exempts a disabled
        // control; P1-6 and P2-2 both ask only that it not move, and a row that wants it to
        // has to move this number, in the open.
        expect(ratio(DISABLED_UNDO).toFixed(2)).toBe('2.30')
    })
})

/**
 * P2-2's disabled controls (row 14): "disabled contrast is unchanged from today's
 * measurement". Read from the variants in `app/controls.ts`, so a variant whose disabled
 * look changes moves these numbers: a disabled control is its variant's disabled surface
 * (or its own) at the variant's opacity, over what it sits on.
 */
describe('P2-2: disabled, in every variant that is ever disabled', () => {
    const disabled = (variant: 'primary' | 'secondary' | 'quiet', on: Token): Pair => {
        const c: Variant = CONTROL[variant]
        const surface = c.disabled.surface ?? (typeof c.surface === 'string' ? c.surface : on)
        const alpha = c.disabled.opacity ?? 1
        return {
            a: { token: 'ink', alpha, over: on }, b: { token: surface, alpha, over: on },
            min: 0, owner: `P2-2: a disabled ${variant} control`, holds: true,
        }
    }
    const before = (surface: Token, alpha: number, on: Token): Pair => ({
        a: { token: 'ink', alpha, over: on }, b: { token: surface, alpha, over: on },
        min: 0, owner: 'before P2-2', holds: true,
    })

    it('Undo and Hint, secondary, are the pinned 2.30:1', () => {
        expect(ratio(disabled('secondary', 'ground')).toFixed(2)).toBe(ratio(DISABLED_UNDO).toFixed(2))
    })

    it('a disabled Check, now primary, is 2.30:1 too, as it was on the neutral surface', () => {
        expect(ratio(disabled('primary', 'ground')).toFixed(2)).toBe(ratio(DISABLED_UNDO).toFixed(2))
    })

    it('where a disabled primary that kept the accent would have taken it to 1.71', () => {
        expect(ratio(before('accent', 0.4, 'ground')).toFixed(2)).toBe('1.71')
    })

    it(`the tutorial's "Got it!", disabled until its board is solved: 2.24:1, up from 2.02`, () => {
        // The one disabled control whose number moves: it was the accent at 50% on the
        // panel, and a disabled primary is the neutral surface at 40%.
        expect(ratio(before('accent', 0.5, 'panel')).toFixed(2)).toBe('2.02')
        expect(ratio(disabled('primary', 'panel')).toFixed(2)).toBe('2.24')
    })

    it(`the archive's month arrows, quiet, with no surface: 2.55:1, as they were`, () => {
        // 40% of ink on the panel before and after; only their box changed.
        expect(ratio(before('panel', 0.4, 'panel')).toFixed(2)).toBe('2.55')
        expect(ratio(disabled('quiet', 'panel')).toFixed(2)).toBe('2.55')
    })
})

/**
 * `Reset`'s edge (P2-2): `problem`, drawn between the control's own surface and whatever the
 * control sits on, so it has to read against both -- 3:1, a boundary that carries meaning.
 */
describe(`P2-2: the caution variant's edge`, () => {
    it('reads against its surface and the ground', () => {
        const { edge, surface } = CONTROL.caution
        expect(contrast(PALETTE[edge.colour], PALETTE[surface]).toFixed(2)).toBe('5.97')
        expect(contrast(PALETTE[edge.colour], PALETTE.ground).toFixed(2)).toBe('7.35')
    })
})

describe('P1-3: the two checker tones', () => {
    it(`stand ${CHECKER_RATIO}:1 apart, as stated, the light tone the lighter`, () => {
        // Stated as a ratio, so a later retune has to move the statement with the tones.
        expect(luminance(PALETTE.checkerLight)).toBeGreaterThan(luminance(PALETTE.checkerDark))
        expect(contrast(PALETTE.checkerLight, PALETTE.checkerDark).toFixed(2)).toBe(CHECKER_RATIO.toFixed(2))
    })
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
