import { PALETTE } from "../palette"

/**
 * The four persistent cell states, drawn (graphics spec P1-5, row 11).
 *
 * Anchor, candidate, hint and focus are what a player reads while thinking. Until this row
 * each was a CSS border or outline in pixels -- 4px, 4px, 3px and 4px -- and three of them
 * were the same shape: a solid line round the square, told apart by colour alone. P1-8
 * requires every state to survive without colour, and at the 38px floor.
 *
 * **Four shapes, not four colours:**
 *   - **anchor**, the square a half-made move starts from: a solid ring;
 *   - **candidate**, a square it could pair with: the same ring, dashed, over a wash;
 *   - **focus**, where the keyboard is: four corner brackets near the square's edge, rounded
 *     so they follow the board's own rounded corners, and outside the ring, so a focused
 *     anchor shows both;
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
    /** The focus brackets: at the edge, each arm this long. */
    focus: { inset: 7, stroke: 8, arm: 28 },
    /** The hint's diamond: centre to each point. */
    hint: { reach: 22 },
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
    const { inset: a, stroke, arm } = STATE.focus
    const b = U - a
    // Each corner an L: along the top or bottom edge, then down or up the side.
    const corners = [
        `M ${a} ${a + arm} V ${a} H ${a + arm}`,
        `M ${b - arm} ${a} H ${b} V ${a + arm}`,
        `M ${b} ${b - arm} V ${b} H ${b - arm}`,
        `M ${a + arm} ${b} H ${a} V ${b - arm}`,
    ]
    return (
        <svg {...box} aria-hidden="true" data-mark="focus">
            <path data-brackets d={corners.join(' ')} fill="none" stroke={PALETTE.cellFocus}
                strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
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
