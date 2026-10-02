/**
 * The placement verb, as pure rules (spec P1-1).
 *
 * One verb: an **anchor cell** plus a **direction**. A pointer drag, a tap, and an arrow
 * key all produce exactly that pair, so there is no orientation *mode* anywhere in the
 * default input path -- no right-click, no toggle, no selected piece to have forgotten you
 * left in the wrong state. A held piece exists only in the opt-in Pick a piece mode
 * (`placementForHeld`, below), which the player turns on deliberately.
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

/** The two pieces. Upright is 1 over 0; flat is 0 then 2. */
export type Piece = 'upright' | 'flat'

/** A placement in full: where it starts, which way, and what it writes where. */
export type Placement = {
    anchor: Cell
    direction: Direction
    cells: readonly [Cell, Cell]
    values: readonly [number, number]
}

export const placementFrom = (anchor: Cell, direction: Direction): Placement =>
    ({ anchor, direction, ...dominoFrom(anchor, direction) })

/**
 * The two ways a held piece can cover a cell, tie-break first (Pick a piece, PL1/PL2).
 *
 * **The numbered half goes where you click**: upright, the cell as the top half, worth 1
 * (`down`), else the bottom half (`up`); flat, the cell as the right half, worth 2 (`left`),
 * else the left half (`right`). `VALUES` already gives each direction the right pips, so the
 * clicked cell is worth what a drag in that direction would make it.
 *
 * It was "the top or left half", a rule about position: the 1 under the cursor upright and
 * the blank under it flat. The user asked why the two differed and chose the number
 * (2026-10-02), so flat's order is reversed and upright's is unchanged.
 */
const HELD: Record<Piece, readonly [Direction, Direction]> = {
    upright: ['down', 'up'],
    flat: ['left', 'right'],
}

/**
 * Where a held piece goes when `cell` is clicked, or null if it cannot cover it.
 *
 * Only two positions of the piece cover the cell. When both fit, the tie-break decides
 * (the cell takes the numbered half: an upright's 1, a flat's 2); when one fits, that one;
 * when neither, null.
 * This is not the half-cell rule P1-1 removed: that one overrode a direction the player
 * had chosen, and here no direction is chosen at all.
 *
 * Pure: whether a position fits is the caller's `canPlace`. The preview and the commit
 * both call this, so what is shown is what is placed.
 */
export const placementForHeld = (
    piece: Piece,
    cell: Cell,
    canPlace: (anchor: Cell, direction: Direction) => boolean,
): Placement | null => {
    const direction = HELD[piece].find(d => canPlace(cell, d))
    return direction ? placementFrom(cell, direction) : null
}

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
