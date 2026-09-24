/**
 * The pieces' drawing, in units of the cell (graphics spec P0-6, row 6).
 *
 * Until this row every detail inside a piece was a CSS-pixel constant -- a 6px outline, an
 * 8px pip, a 16px extrusion -- drawn on a cell that ranges from 38px on a phone to 106px at
 * the desktop cap. The same drawing was therefore a different picture at every size: the
 * pip was 42% of the cell on a phone and 15% on a large desktop (§1.1).
 *
 * Now every piece is an SVG whose `viewBox` is measured against the cell, and the only
 * pixel values anywhere in a piece are the outer `width` and `height`, which scale the
 * whole drawing at once. The drawing's unit is **one fifty-third of a cell** (`UNIT`), not
 * one cell, and that is a measured choice rather than a taste:
 *
 *   - Today's art was drawn for a 53px cell (§1.1), so in these units every length is the
 *     number it always was -- the outline is 6, the pip 8 -- and a 53px piece is drawn with
 *     a `viewBox` scale of exactly 1. Baseline 2 is then the same rasterisation it always
 *     was, which the spec requires.
 *   - Measured with one-cell units instead (`0 0 1 2.30`, lengths like 6/53): Chromium
 *     scaled every coordinate by 53 at the 53px cell, and the anti-aliased edges came out
 *     up to 9 levels different in 462 pixels of the 53px sheet -- one of which pixelmatch
 *     counts. The shapes were the same; the floating-point path to them was not.
 *
 * A length's fraction of the cell is its value over `UNIT`; `fraction` below says so, and
 * P1-1 retunes these values against the 38px rendering.
 */

/** The drawing's units per cell: the cell size, in px, the art was drawn at. */
export const UNIT = 53

export const PIECE = {
    /** The silhouette's outline, as a stroke width. */
    outline: 6,
    /** Every corner radius: face, side and outline. */
    radius: 8,
    pipRadius: 8,
    /** How far the divider stops short of each edge of the tile. */
    dividerInset: 16,
    dividerWidth: 3,
    /**
     * How far the extruded side shows below the face -- and so how far every piece stands
     * up out of its cell, since the drawing is that much taller than the cell and lifted by
     * it to keep the face on the square.
     */
    extrusion: 16,
    /** The margin between a cell's edge and the outline's box. */
    inset: 4,
    /** How far up and left a domino starts its entry, before it drops into place. */
    entry: 26,
} as const

/** A length in drawing units, as a fraction of the cell. */
export const fraction = (units: number) => units / UNIT

/** The `viewBox` for a piece `across` cells wide and `down` cells tall, with its extrusion. */
export const viewBox = (across: number, down: number) =>
    `0 0 ${across * UNIT} ${down * UNIT + PIECE.extrusion}`

/**
 * The outer box of a piece at `cell` px: the one place pixels enter the drawing.
 *
 * `translate` lifts the drawing by its extrusion so the face sits on the cell and the side
 * shows below it -- what `-translate-y-4` did as a fixed 16px until this row.
 */
export const pieceBox = (across: number, down: number, cell: number) => ({
    width: across * cell,
    height: (down + fraction(PIECE.extrusion)) * cell,
    style: { translate: `0 ${-fraction(PIECE.extrusion) * cell}px` },
})
