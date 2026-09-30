import { PALETTE } from "../palette"

/**
 * The four persistent cell states, drawn (graphics spec P1-5, row 11), and a fifth that
 * lasts until the board next acts -- a press, a key it handles, an undo, a reset, Check or
 * Hint: a refused move (P1-6, row 12; `PuzzleSession.refusedAt`).
 *
 * Anchor, candidate, hint and focus are what a player reads while thinking. Until this row
 * each was a CSS border or outline in pixels -- 4px, 4px, 3px and 4px -- and three of them
 * were the same shape: a solid line round the square, told apart by colour alone. P1-8
 * requires every state to survive without colour, and at the 38px floor.
 *
 * **Four shapes, not four colours:**
 *   - **anchor**, the square a half-made move starts from: a solid ring;
 *   - **candidate**, a square it could pair with: the same ring, dashed, over a wash;
 *   - **focus**, where the keyboard is: four corner brackets near the square's edge, bent
 *     round so they follow the board's own rounded corners, and outside the ring, so a
 *     focused anchor shows both. Thin, in the accent's edge on a white halo, since the
 *     keyboard polish ("soft corners"): they were twice as heavy, in black, and the user
 *     found them the least finished part of playing by keyboard;
 *   - **hint**, where the next piece goes: a diamond at the centre.
 *
 * Each is drawn in a `viewBox` of one cell, 100 units across, and scaled to the cell, so
 * every length is a fraction of the cell by construction (P0-6's rule, applied to the
 * states) and reads as a percentage of it.
 */

export const STATE = {
    /** The anchor's and the candidates' ring: inset from the cell edge, and its weight. */
    ring: { inset: 17, stroke: 8, radius: 12 },
    /** The candidates' dashes along that ring: drawn, then skipped. */
    dash: { on: 14, off: 10 },
    /**
     * The focus brackets: in from the edge, each arm this long, bent round a corner of this
     * radius, and the halo either side of the stroke. The soft corners (keyboard polish),
     * where they were 7 in, 8 wide and 28 long, square-cornered and haloless.
     */
    focus: { inset: 8, stroke: 5, arm: 24, bend: 6, halo: 2 },
    /** The hint's diamond: centre to each point. */
    hint: { reach: 22 },
    /**
     * A refused move's cross (P1-6): centre to each end along each axis, its weight, and the
     * halo either side of it. Its ends pass under the anchor ring's corners -- a refused
     * arrow key keeps the anchor, so the two share a square, and the ring is drawn over the
     * cross and stays whole -- and stop short of the focus brackets, which share it too.
     * Kept inside the ring, the cross could not be told from the hint's diamond: measured
     * 14.9% apart in greyscale at its largest that fits, under P1-5's 15%.
     */
    refused: { reach: 25, stroke: 9, halo: 5 },
} as const

const U = 100
const box = { width: '100%', height: '100%', viewBox: `0 0 ${U} ${U}` } as const

/** The ring every anchor and candidate draws, dashed or not. */
const Ring: React.FC<{ stroke: string, dashed: boolean }> = ({ stroke, dashed }) => {
    const { inset, stroke: width, radius } = STATE.ring
    return (
        <rect
            data-ring
            x={inset} y={inset} width={U - 2 * inset} height={U - 2 * inset} rx={radius} ry={radius}
            fill="none" stroke={stroke} strokeWidth={width}
            strokeDasharray={dashed ? `${STATE.dash.on} ${STATE.dash.off}` : undefined}
        />
    )
}

export const AnchorMark: React.FC = () => (
    <svg {...box} aria-hidden="true" data-mark="anchor"><Ring stroke={PALETTE.anchor} dashed={false} /></svg>
)

export const CandidateMark: React.FC = () => {
    const { inset, radius } = STATE.ring
    return (
        <svg {...box} aria-hidden="true" data-mark="candidate">
            <rect data-wash x={inset} y={inset} width={U - 2 * inset} height={U - 2 * inset} rx={radius} ry={radius}
                fill={PALETTE.candidateWash} fillOpacity={0.4} />
            <Ring stroke={PALETTE.candidateEdge} dashed />
        </svg>
    )
}

export const FocusMark: React.FC = () => {
    const { inset: a, stroke, arm, bend: r, halo } = STATE.focus
    const b = U - a
    // Each corner an L turning right, clockwise round the square, bent round a quarter
    // circle: along one side, round the corner, along the next.
    const turn = (x: number, y: number) => `A ${r} ${r} 0 0 1 ${x} ${y}`
    const corners = [
        `M ${a} ${a + arm} V ${a + r} ${turn(a + r, a)} H ${a + arm}`,
        `M ${b - arm} ${a} H ${b - r} ${turn(b, a + r)} V ${a + arm}`,
        `M ${b} ${b - arm} V ${b - r} ${turn(b - r, b)} H ${b - arm}`,
        `M ${a + arm} ${b} H ${a + r} ${turn(a, b - r)} V ${b - arm}`,
    ]
    const d = corners.join(' ')
    return (
        <svg {...box} aria-hidden="true" data-mark="focus">
            <path data-halo d={d} fill="none" stroke={PALETTE.cellFocusHalo}
                strokeWidth={stroke + 2 * halo} strokeLinecap="round" strokeLinejoin="round" />
            <path data-brackets d={d} fill="none" stroke={PALETTE.cellFocus}
                strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

/**
 * A refused move (graphics spec P1-6, row 12): a cross on the square it was made from.
 *
 * The static equivalent of the shake, which reduced motion suppresses. A cross because it
 * is the one shape here that says "no", and because it is not the diamond: the two are the
 * states drawn at the centre. Red on a white halo, because a refusal lands anywhere -- on
 * either checker tone, a domino's face, a rock -- and no one colour clears 3:1 on all of
 * them: the halo carries it on the checker and the rock, the red on the tile's face.
 */
export const RefusedMark: React.FC = () => {
    const c = U / 2
    const { reach: r, stroke, halo } = STATE.refused
    const d = `M ${c - r} ${c - r} L ${c + r} ${c + r} M ${c + r} ${c - r} L ${c - r} ${c + r}`
    return (
        <svg {...box} aria-hidden="true" data-mark="refused">
            <path data-halo d={d} fill="none" stroke={PALETTE.refusedHalo}
                strokeWidth={stroke + 2 * halo} strokeLinecap="round" />
            <path data-cross d={d} fill="none" stroke={PALETTE.problem}
                strokeWidth={stroke} strokeLinecap="round" />
        </svg>
    )
}

export const HintMark: React.FC = () => {
    const c = U / 2
    const r = STATE.hint.reach
    return (
        <svg {...box} aria-hidden="true" data-mark="hint">
            <polygon data-diamond points={`${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}`} fill={PALETTE.hint} />
        </svg>
    )
}
