import { motion } from 'motion/react'
import type { LineState } from "../stores/boardRules"
import { MOTION } from "./motion"
import { barStyle, labelPresentation, labelDescription, pillStyle, tieStyle } from "./lineLabel"

/**
 * The line targets' one renderer (UI row 4): a strip of labels from targets, states and sizes
 * it is given, with no session in it. The board renders it through `HorizontalNumbers` and
 * `VerticalNumbers`, which read those from the session and pass them through; the component
 * sheet renders it directly, with targets and states no board could hold together -- `13` in
 * every state (a cell holds at most 2 pips) -- to measure what each state draws.
 *
 * `min-w-0 min-h-0` because a flex item's default `min-*: auto` is min-content, so a label
 * wider than its box silently props the box open instead of overflowing it. The font is
 * derived from `--cell` rather than the old constant `text-6xl` (60px), which rendered a
 * 60px glyph inside a 39px box at phone size -- the `board label` role since graphics P2-1,
 * `text-board-label`, which reads that size from `--label-font` with a line height of 1.
 *
 * The padding on the strip clears the grid's own border so each label centres on its line:
 * the board's track includes the border, the label's track does not.
 */
export type LineLabelsProps = {
    targets: readonly string[]
    states: readonly LineState[]
    /** The cell, the label's length along its line. */
    cell: number
    /** The gutter, the label's depth across it. */
    gutter: number
}

type Axis = 'column' | 'row'

const LineLabels: React.FC<LineLabelsProps & { axis: Axis }> = ({ targets, states, cell, gutter, axis }) => {
    const column = axis === 'column'
    return <div
        className={`flex ${column ? 'flex-row' : 'flex-col'} min-w-0 min-h-0 text-board-label tabular-nums`}
        style={column ? { paddingLeft: 'var(--grid-border)' } : { paddingTop: 'var(--grid-border)' }}
    >
        {targets.map((target, index) => {
            const presentation = labelPresentation(states[index])
            return (
                <motion.div className="relative flex items-center justify-center min-w-0 min-h-0"
                    // In its state's colour from the start, and animated only on a change. It
                    // started neutral until UI row 4, when every label mounted neutral; a 0
                    // line now mounts reached, and that first animation, between two `var()`
                    // colours, once ended at black on the phone (measured, phone-360).
                    initial={false}
                    animate={{ color: presentation.color }}
                    // Placement feedback, so inside P1-6's limits (`motion.ts`).
                    transition={{ duration: MOTION.label.duration }}
                    key={index}
                    {...(column ? { 'data-col-label': index } : { 'data-row-label': index })}
                    data-line-state={presentation.token}
                    role="img"
                    aria-label={labelDescription(`${column ? 'Column' : 'Row'} ${index + 1}`, target, states[index])}
                    style={column ? { width: `${cell}px`, height: `${gutter}px` } : { width: `${gutter}px`, height: `${cell}px` }}
                >
                    <span data-label-pill={presentation.pill} style={pillStyle(presentation)}>
                        {target}
                        {presentation.bar && <span aria-hidden data-label-bar style={barStyle} />}
                    </span>
                    {/* The tie to the line (P1-3): see `LABEL_TIE`. */}
                    <span aria-hidden data-label-tie style={tieStyle(column ? 'below' : 'right')} />
                </motion.div>
            )
        })}
    </div>
}

/** The column labels, along the top of the board. */
export const ColumnLabels: React.FC<LineLabelsProps> = props => <LineLabels {...props} axis='column' />

/** The row labels, down the left of the board. */
export const RowLabels: React.FC<LineLabelsProps> = props => <LineLabels {...props} axis='row' />
