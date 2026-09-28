import { expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession, GRID_BORDER_PX, GUTTER_FRACTION } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import Pieces from '@/app/dominoFill/Pieces/Pieces'

/**
 * One of every piece, drawn at a chosen cell size (graphics spec rows 2, 6 and 7).
 *
 * Shared by the geometry test and the proportions test, so the two measure the same
 * drawing: an upright domino at 0,0, a flat one at 0,2, and a rock at 3,3 on a 4x4 board.
 */

const N = 4

/**
 * A session whose cell is exactly `cell` px, holding one of everything that is drawn.
 *
 * The cell is not set directly -- nothing in the app sets it directly either. It is the
 * largest that fits the box, so the box is built to fit exactly `cell`, with half a pixel
 * of slack against `GUTTER_FRACTION` not being exact in binary. And then checked, so a
 * change to the sizing arithmetic fails here loudly rather than measuring the wrong cell.
 */
export const sessionAt = (cell: number) => {
    const board: (number | null)[][] = Array.from({ length: N }, () => Array(N).fill(null))
    board[3][3] = -1
    const s = new PuzzleSession(definitionFrom({
        puzzleId: `art-${cell}`,
        board,
        boardHorizontalNumbers: Array(N).fill(0).join(','),
        boardVerticalNumbers: Array(N).fill(0).join(','),
    }), new RootStore())
    const px = cell * (N + GUTTER_FRACTION) + GRID_BORDER_PX + 0.5
    s.setAvailableBox({ width: px, height: px })
    expect(s.squareSize, 'the session did not land on the cell under test').toBe(cell)

    expect(s.placeToward([0, 0], 'down'), 'upright domino').toBe(true)
    expect(s.placeToward([0, 2], 'right'), 'flat domino').toBe(true)
    return s
}

/**
 * The real piece layer, rendered to a string and parsed into a detached host.
 *
 * The whole layer rather than three components each handed a size, because `Pieces` is
 * what places every piece at the session's cell size. And a server render, because it is
 * the only one in which the entry animation's starting offset is observable.
 */
export const renderPieces = (cell: number) => {
    const host = document.createElement('div')
    host.innerHTML = renderToString(<Pieces boardsStore={sessionAt(cell)} />)
    return host
}
