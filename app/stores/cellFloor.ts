/*
 * Deliberately *not* a client module (graphics spec P0-3, row 3).
 *
 * `PuzzleSession.ts` is `"use client"`, and a server component that imports a value from a
 * client module receives a client reference, not the value. Measured: the component sheet's
 * route compared `?cell=37` against it, found nothing below the floor, and served a sheet
 * at a size the app never renders.
 */

/**
 * Cell floor, in CSS px, below which the board stops shrinking to fit the viewport
 * *height* and the page scrolls vertically instead.
 *
 * This is the same 38px the acceptance criteria pin, and it is deliberately one-sided:
 * the width budget is never overridden, because overflowing horizontally is forbidden
 * outright, while a page that scrolls vertically is merely a page that scrolls. Without
 * the floor, a 400px-tall landscape phone produces ~11px cells once the chrome above and
 * below the board is counted -- arithmetically correct and completely unplayable.
 */
export const MIN_CELL_PX = 38
