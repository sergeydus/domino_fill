/**
 * The pieces' drawing, in units of the cell (graphics spec P0-6, row 6; retuned in P1-1,
 * row 7).
 *
 * Until row 6 every detail inside a piece was a CSS-pixel constant -- a 6px outline, an 8px
 * pip, a 16px extrusion -- drawn on a cell that ranges from 38px on a phone to 106px at the
 * desktop cap, so the same drawing was a different picture at every size (§1.1). Row 6 put
 * every piece in a `viewBox` measured against the cell, scaled once by `pieceBox`, which is
 * the only place pixels enter.
 *
 * **A hundred units to a cell, so every value below reads as a percentage of it.** Row 6
 * used 53, because today's art was drawn for a 53px cell and 53 units rendered the 53px
 * sheet at a `viewBox` scale of exactly 1 -- pixel-identical, as that row required (its
 * amendment has the measurement). Row 7 moves every length, so there is no longer a drawing
 * to keep identical, and the unit is chosen for reading instead: P1-1's bounds are written
 * as fractions of the cell, and so are these.
 *
 * **The proportions are P1-1's, tuned against the 38px phone cell** (§2.1): the size the
 * design is for, not the size it degrades to. Each value is chosen inside a bound the spec
 * sets and `tests/proportions.test.tsx` measures from the rendered markup:
 *
 *   - outline 9: at most 12 (at 38px, 3.4px -- chunky, without swallowing the tile);
 *   - extrusion 14: 10 to 18 ("slightly exaggerated", where it was 30);
 *   - pip diameter 24: 18 to 30 (it was 30.2), clear of the divider and the tile edge by at
 *     least 6 -- the flat domino's two pips, on the thirds of its half, are the tight case,
 *     at 10.8;
 *   - divider span 60 of the cell, 68% of the tile it crosses: at least 55% (it was 47%
 *     on the flat domino and 51% on the upright).
 *
 * The rest are unbounded and chosen to go with them: the rounder corners of a toy (14), the
 * divider's weight (5), the margin to the cell edge (6), and the entry offset, which is
 * P1-6's to limit and is row 6's fraction unchanged.
 */

/** The drawing's units per cell. */
export const UNIT = 100

export const PIECE = {
    /** The silhouette's outline, as a stroke width. */
    outline: 9,
    /** Every corner radius: face, side and outline. */
    radius: 14,
    pipRadius: 12,
    /** How far the divider stops short of each edge of the cell it crosses. */
    dividerInset: 20,
    dividerWidth: 5,
    /**
     * How far the extruded side shows below the face -- and so how far every piece stands
     * up out of its cell, since the drawing is that much taller than the cell and lifted by
     * it to keep the face on the square.
     */
    extrusion: 14,
    /** The margin between a cell's edge and the piece's box: face, side and outline alike. */
    inset: 6,
    /** How far up and left a domino starts its entry: row 6's 26/53 of a cell, until P1-6. */
    entry: (26 / 53) * 100,
} as const

/** A point of the drawing, in units. */
export type Point = readonly [number, number]

/**
 * The rock (graphics spec P1-2, row 8): a faceted boulder, where until this row it was the
 * domino's rounded rectangle in grey (§1.4), and two rocks stacked in a column read as an
 * upright domino.
 *
 * Its extremes sit on the box every piece shares (`inset` from each edge of the cell). Its
 * outline is drawn as two chains, each running left to right between the same two ends:
 * the top, which carries the irregularity -- a shoulder, a notch, an off-centre peak -- and
 * a nearly flat base it rests on.
 *
 * **The extrusion is the face swept down.** A domino's side is its face shifted down by
 * `extrusion` and drawn behind it; for a rectangle that is the whole solid. For any other
 * shape the solid is everything the face passes through on the way down, and because
 * each chain is a function of x that is exactly the top chain, then the base shifted down,
 * joined at the two ends. That swept outline is the silhouette: the side is filled with
 * it, and the outline strokes it.
 *
 * **Facets are flat tones, not lines.** One lit plane across the crown and one shaded plane
 * down the right, over the face's own tone -- no gradients, and no inner strokes to crowd a
 * 38px cell (§2.1).
 */
const ROCK_TOP: readonly Point[] = [[6, 90], [14, 56], [28, 34], [42, 44], [56, 6], [76, 16], [86, 40], [94, 60], [94, 90]]
const ROCK_BASE: readonly Point[] = [[6, 90], [22, 94], [78, 94], [94, 90]]

const down = ([x, y]: Point): Point => [x, y + PIECE.extrusion]
const inner = (chain: readonly Point[]) => chain.slice(1, -1)

export const ROCK = {
    /** The face: the top chain, then back along the base. */
    face: [...ROCK_TOP, ...inner(ROCK_BASE).reverse()],
    /** The face swept down by the extrusion: the side's fill, and the outline's path. */
    silhouette: [
        ...ROCK_TOP,
        down(ROCK_TOP[ROCK_TOP.length - 1]),
        ...inner(ROCK_BASE).reverse().map(down),
        down(ROCK_TOP[0]),
    ],
    /** The plane across the crown, catching the light. */
    lit: [[28, 34], [42, 44], [56, 6], [76, 16], [62, 40], [46, 56]],
    /** The plane down the right, turned away from it. */
    shade: [[76, 16], [86, 40], [94, 60], [94, 90], [78, 94], [70, 60], [62, 40]],
} as const satisfies Record<string, readonly Point[]>

/** A polygon's `points` attribute. */
export const points = (polygon: readonly Point[]) => polygon.map(([x, y]) => `${x},${y}`).join(' ')

/** A length in drawing units, as a fraction of the cell. */
export const fraction = (units: number) => units / UNIT

/** The `viewBox` for a piece `across` cells wide and `down` cells tall, with its extrusion. */
export const viewBox = (across: number, down: number) =>
    `0 0 ${across * UNIT} ${down * UNIT + PIECE.extrusion}`

/**
 * The outer box of a piece at `cell` px: the one place pixels enter the drawing.
 *
 * `translate` lifts the drawing by its extrusion so the face sits on the cell and the side
 * shows below it -- what `-translate-y-4` did as a fixed 16px until row 6.
 */
export const pieceBox = (across: number, down: number, cell: number) => ({
    width: across * cell,
    height: (down + fraction(PIECE.extrusion)) * cell,
    style: { translate: `0 ${-fraction(PIECE.extrusion) * cell}px` },
})
