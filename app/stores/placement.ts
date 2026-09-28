/**
 * The placement verb, as pure rules (spec P1-1).
 *
 * One verb: an **anchor cell** plus a **direction**. A pointer drag, a tap, and an arrow
 * key all produce exactly that pair, so there is no orientation *mode* anywhere in the
 * input path -- no right-click, no toggle, no selected piece to have forgotten you left in
 * the wrong state.
 *
 * The direction alone fixes the orientation *and* the pip values, because a domino's two
 * halves are not interchangeable: upright is 1 on top and 0 below, flat is 0 on the left
 * and 2 on the right. Dragging up is therefore not the same placement as dragging down --
 * the anchor gets a different value -- which is precisely what the old half-cell rule
 * obscured.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'
export type Cell = readonly [number, number]

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

const STEP: Record<Direction, readonly [number, number]> = {
    up: [-1, 0],
    down: [1, 0],
    left: [0, -1],
    right: [0, 1],
}

/**
 * The value the anchor takes, and the value its neighbour takes.
 *
 * Upright: 1 above, 0 below. Flat: 0 on the left, 2 on the right.
 */
const VALUES: Record<Direction, readonly [number, number]> = {
    down: [1, 0],   // anchor is the top half
    up: [0, 1],     // the neighbour above is the top half
    right: [0, 2],  // the neighbour to the right carries the 2
    left: [2, 0],   // the anchor carries the 2
}

export const neighbourOf = (cell: Cell, direction: Direction): Cell => {
    const [di, dj] = STEP[direction]
    return [cell[0] + di, cell[1] + dj]
}

/** The direction from one cell to another, or null if they are not orthogonally adjacent. */
export const directionBetween = (from: Cell, to: Cell): Direction | null => {
    const di = to[0] - from[0]
    const dj = to[1] - from[1]
    for (const direction of DIRECTIONS) {
        const [si, sj] = STEP[direction]
        if (si === di && sj === dj) return direction
    }
    return null
}

export const sameCell = (a: Cell | null, b: Cell | null) =>
    !!a && !!b && a[0] === b[0] && a[1] === b[1]

/** The two cells a domino would occupy, with the value each one takes. */
export const dominoFrom = (anchor: Cell, direction: Direction): {
    cells: readonly [Cell, Cell]
    values: readonly [number, number]
} => ({
    cells: [anchor, neighbourOf(anchor, direction)],
    values: VALUES[direction],
})

/**
 * The pair as a top-left-first ordered pair, for display.
 *
 * The highlight is drawn from one corner, so it wants the cells in reading order rather
 * than in anchor-first order.
 */
export const orderedPair = (a: Cell, b: Cell): [[number, number], [number, number]] =>
    (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]))
        ? [[a[0], a[1]], [b[0], b[1]]]
        : [[b[0], b[1]], [a[0], a[1]]]
