import { notFound } from 'next/navigation'
import { MIN_CELL_PX } from '../stores/cellFloor'
import Sheet from './Sheet'

/**
 * `/visual` -- the component sheet, in builds made with `DOMINO_VISUAL_SHEET=1` only
 * (graphics spec P0-3, row 3). See `next.config.ts` for why this file is not a route, and
 * is not compiled, in any other build.
 *
 * `?cell=` sets the cell size in CSS px, so the same sheet can be taken at the phone floor
 * and at the size the art was drawn for. Anything that is not a whole number of pixels at
 * or above the floor is refused rather than clamped: a baseline taken at a size nobody
 * asked for would be a baseline of the wrong thing.
 */
const DEFAULT_CELL = 53
const MAX_CELL = 160

export default async function VisualSheet(
    { searchParams }: { searchParams: Promise<{ cell?: string | string[] }> },
) {
    const { cell: raw } = await searchParams
    if (Array.isArray(raw)) notFound()
    const cell = raw === undefined ? DEFAULT_CELL : Number(raw)
    if (!Number.isInteger(cell) || cell < MIN_CELL_PX || cell > MAX_CELL) notFound()
    return <Sheet cell={cell} />
}
