/**
 * The four gameplay-feedback motions, in one place (graphics spec P1-6, row 12): a piece
 * arriving, the board refusing, a line label changing state, the completion card. The
 * controls' own state transitions are CSS, in `globals.css`, where reduced motion zeroes
 * them.
 *
 * Offsets are fractions of the cell, like the drawing (row 6), so a phone and a desktop
 * move by the same *look*: until this row the entry was 26px -- 68% of a phone cell and 30%
 * of a desktop one -- and the shake 6px. Durations are seconds, which is what `motion`
 * takes.
 *
 * **The limits.** Placement feedback -- the piece arriving, the board refusing, a line
 * label changing state -- moves nothing further than `LIMITS.amplitude` of a cell and runs
 * no longer than `LIMITS.duration`. The completion card is held to the same (P2-3). What is
 * held where:
 *   - `tests/motion.test.ts`: every value here is inside the limits, and the keyframes built
 *     from them are too;
 *   - `e2e/motion.spec.ts`: what the browser actually paints, sampled every frame, stays
 *     inside them -- which is what a limit is for.
 *
 * Every duration is 150ms, not the 200 the limit allows. A duration measured from painted
 * frames is bounded by the frames either side of the motion, so the bound can exceed the
 * truth by up to two frame gaps: 150ms plus two 25ms gaps is 200 (`e2e/frames.ts`). At 180ms
 * the shake's bound came out at 200.1 on one run of two, which says nothing about the shake
 * and everything about a margin too thin to measure against.
 */

export const LIMITS = {
    /** The furthest anything may move, in cells. */
    amplitude: 0.12,
    /** The longest any of it may run, in seconds. */
    duration: 0.2,
} as const

export const MOTION = {
    /**
     * A piece arriving: it starts `offset` of a cell up and to the left of where it lands,
     * transparent, and settles. The offset is the length of that diagonal, so no point of
     * the piece is ever further than it from rest. It was a spring with a 5-degree turn
     * as well: a spring has no duration to hold, and a turn moves the ends of a domino
     * further than its middle.
     */
    entry: { offset: 0.1, duration: 0.15 },
    /** The board refusing a move: a sideways shake, dying away. */
    shake: { amplitude: 0.1, duration: 0.15 },
    /** A line label changing state: its colour only. */
    label: { duration: 0.15 },
    /** The completion card arriving: up from `offset` of a cell below, fading in. */
    card: { offset: 0.1, duration: 0.15 },
} as const

/** The shake's keyframes, in px, for a cell of `size`: out, back, and smaller each time. */
export const shakeKeyframes = (size: number): number[] => {
    const a = MOTION.shake.amplitude * size
    return [0, -a, a, -a * 2 / 3, a * 2 / 3, 0]
}

/** Where a piece starts its entry, in px, for a cell of `size`: along the diagonal. */
export const entryOffset = (size: number): number => MOTION.entry.offset * size / Math.SQRT2
