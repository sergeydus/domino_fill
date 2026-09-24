/**
 * The desktop composition's constants (graphics spec P0-1, row 1).
 *
 * Until this row the game had one composition: a single column, the board in the middle,
 * every control stacked above and below it. On a phone that is the only sensible answer.
 * On a desktop it is the phone's answer given to a machine with four times the room —
 * measured, the board shell was 363px in a 1280px viewport, 28.4% of the width, with the
 * rest of the screen empty and the board's own cells at 41px because the stacked chrome
 * had eaten the height budget.
 *
 * Above the breakpoint the secondary controls move into a side rail, which buys the board
 * the whole height rather than what five chrome rows leave of it.
 *
 * Named `composition.ts` rather than the obvious `layout.ts` because this directory is
 * inside `app/`, where `layout` is a reserved App Router filename: Next treats any
 * `layout.ts` as the segment's layout component and the build fails asking where its
 * default export is. `tsc` has no opinion about it -- only `next build` knows -- which is
 * why the gate runs both.
 */

/**
 * When the game lays itself out in two columns.
 *
 * Width **and** height, because the rail is the thing that has to fit: it stacks the
 * difficulty selector, the four game controls and the navigation row, and in a short
 * landscape window that column is taller than the viewport. Measured on this build at
 * 1280x800, the rail is **322px** tall; 640 leaves that much again for the board beside
 * it, and a 1280x600 window -- which would otherwise qualify on width alone -- keeps the
 * single column.
 *
 * A media query rather than a measurement, deliberately: the composition must be decided
 * before the board is measured, and anything derived from the board's own size would be
 * the feedback loop `useAvailableBoardBox` exists to avoid.
 */
export const WIDE_LAYOUT_QUERY = '(min-width: 1024px) and (min-height: 640px)'

/**
 * The rail's width, in CSS px. Fixed, and that is the point.
 *
 * `useAvailableBoardBox` subtracts this from the board's width budget. A rail whose width
 * depended on its contents' layout would make the board's size depend on something that
 * could in turn depend on the board — the loop that put the board on its floor once
 * already (see the hook's own note). A constant cannot participate in a loop.
 *
 * 260 fits the widest control the rail holds — the difficulty selector's three options —
 * without stretching short ones across a gulf. Measured, not assumed, since row 4: this
 * comment claimed the fit from row 1 on, and the desktop baseline showed "Hard 8x8" running
 * 8px past the rail. The selector's buttons gave up horizontal padding rather than the rail
 * growing: the rail is subtracted from the board's width budget, and row 1's measured board
 * sizes stand on this number. Its narrowest arrangement is now 253.9px (with the bold
 * "Medium 7x7" selected), which leaves 6px, and `e2e/desktop.spec.ts` fails the day that
 * is gone.
 */
export const RAIL_WIDTH_PX = 260

/** Between the board column and the rail, in CSS px. */
export const STAGE_GAP_PX = 24

/**
 * The widest the board is allowed to get, in CSS px, however large the display.
 *
 * A board that simply grows with the window is not better at 2560px; it is a board whose
 * cells are the size of a matchbox and whose targets are a head-turn apart. The cap is
 * deliberate and named so it can be argued with, and it applies only in the wide layout —
 * below the breakpoint the phone's budget is doing the capping and there is nothing spare
 * to give away.
 *
 * 720 gives an 8x8 board 81px cells, roughly double today's desktop measurement of 41.
 */
export const WIDE_BOARD_CAP_PX = 720
