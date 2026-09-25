import { describe, it, expect } from 'vitest'
import { CHECKER_RATIO, PALETTE, type Token } from '@/app/palette'
import { contrast, luminance, over, toRgb, type Rgb } from './colour'

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
        { a: 'hint', b: checker, min: 3, owner: 'P1-5', holds: true } as Pair,
        // The anchor held on the light tone only until P1-3, whose darker checker it would
        // have failed on both; the darker blue P1-3 gave it clears both.
        { a: 'anchor', b: checker, min: 3, owner: 'P1-5; held on both since P1-3', holds: true } as Pair,
        { a: 'candidateEdge', b: checker, min: 3, owner: 'P1-5', holds: false } as Pair,
        { a: { token: 'cellFocus', alpha: 0.7, over: checker }, b: checker, min: 3, owner: 'P1-5', holds: true } as Pair,
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
