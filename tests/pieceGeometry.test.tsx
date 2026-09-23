// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import { renderToString } from 'react-dom/server'
import { RootStore } from '@/app/stores/RootStore'
import { PuzzleSession, GRID_BORDER_PX, GUTTER_FRACTION } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import Pieces from '@/app/dominoFill/Pieces/Pieces'
import { readArt } from '@/e2e/artGeometry'

/**
 * The art as it stands, pinned (graphics spec P0-2, row 2).
 *
 * Before this, nothing in either suite could fail when the drawing changed: 433 browser
 * tests, and not one would notice if a pip vanished or the outline doubled. §1.1 of the
 * spec measured the six pixel constants inside the pieces and tabulated what fraction of
 * the cell each one is at the two ends of the range; this reproduces that table from the
 * rendered markup, so the table is something the suite *says* rather than something a
 * document claims.
 *
 * **Today's art, deliberately, defects included.** The divider really is 16% of a 38px
 * cell; the pip really does swell to 42% of it. Those numbers are the problem the art rows
 * exist to fix, and pinning them is what makes each later change a visible, reviewed diff
 * instead of a drift. P0-6 rewrites these assertions from pixels to ratios; P1-1 then moves
 * the ratios. Neither can happen silently past this file.
 *
 * **Why the whole layer, rendered to a string.** `Pieces` is the component that places
 * every piece on the board at the session's cell size, so it is the real composition rather
 * than three components each handed a size. And the server render is the only one in which
 * the entry animation's starting offset is observable: it is `motion`'s `initial` state,
 * written into the markup and replaced as soon as effects run.
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
const sessionAt = (cell: number) => {
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
 * Every instance of every constant, read out of a server render of the layer.
 *
 * The five at rest come from `readArt`, the same reader e2e/art.spec.ts runs in the real
 * page. The entry offset is read here, from `motion`'s initial transform: it exists only
 * in this render, and rocks do not enter -- they are part of the puzzle, there before the
 * player is -- so it is the two dominoes' x and y.
 */
const measure = (cell: number) => {
    const host = document.createElement('div')
    host.innerHTML = renderToString(<Pieces boardsStore={sessionAt(cell)} />)

    const entry = ['one', 'two'].flatMap(kind => {
        const transform = host.querySelector<HTMLElement>(`[data-piece="${kind}"]`)!.style.transform
        const x = /translateX\((-?[\d.]+)px\)/.exec(transform)
        const y = /translateY\((-?[\d.]+)px\)/.exec(transform)
        expect(x && y, `no entry offset in "${transform}"`).toBeTruthy()
        return [-Number(x![1]), -Number(y![1])]
    })

    return { ...readArt(host), entry }
}

type Constant = keyof ReturnType<typeof measure>

/**
 * §1.1's table, as data.
 *
 * `px` is what each constant is at a given cell; `fraction` is the table's column for the
 * two cell sizes the spec measured at. `count` is how many instances the layer draws: three
 * outlines, three rects per piece, one pip on the upright and two on the flat, one divider
 * per domino, one side per piece, and an x and a y offset for each domino that enters.
 */
const TABLE: Record<Constant, {
    label: string
    count: number
    px: (cell: number) => number
    fraction: Record<38 | 53, number>
}> = {
    outline: { label: 'outline stroke', count: 3, px: () => 6, fraction: { 38: 0.158, 53: 0.113 } },
    radius: { label: 'corner radius', count: 9, px: () => 8, fraction: { 38: 0.211, 53: 0.151 } },
    pip: { label: 'pip diameter', count: 3, px: () => 16, fraction: { 38: 0.421, 53: 0.302 } },
    divider: {
        label: 'divider span', count: 2, px: cell => cell - 32, fraction: { 38: 0.158, 53: 0.396 },
    },
    extrusion: { label: 'extrusion depth', count: 3, px: () => 16, fraction: { 38: 0.421, 53: 0.302 } },
    entry: { label: 'entry offset', count: 4, px: () => 26, fraction: { 38: 0.684, 53: 0.491 } },
}

const CONSTANTS = Object.keys(TABLE) as Constant[]

describe('the six constants of §1.1, at the two cell sizes it measured', () => {
    for (const cell of [38, 53] as const) {
        describe(`at ${cell}px`, () => {
            let measured: ReturnType<typeof measure>
            beforeAll(() => { measured = measure(cell) })

            for (const name of CONSTANTS) {
                const { label, count, px, fraction } = TABLE[name]

                it(`${label} is ${px(cell)}px on every piece, ${fraction[cell]} of the cell`, () => {
                    expect(measured[name], `${label}: one per instance`).toHaveLength(count)
                    for (const value of measured[name]) {
                        expect(value, label).toBe(px(cell))
                        // The table's own rounding, so a change to either side shows up as
                        // a difference between this file and the spec.
                        expect(Math.round((value / cell) * 1000) / 1000, `${label} / cell`)
                            .toBe(fraction[cell])
                    }
                })
            }
        })
    }
})

describe('the range the art has to cover, since row 1', () => {
    /*
     * §1.1 was measured before the desktop composition existed, when the widest shipped
     * cell was 53px. Row 1 gave the desktop its own board, and the widest is now 106px
     * (6x6 at the 720px cap). Measured, not derived: e2e/art.spec.ts reads it off the real
     * board, and the spec is amended to match.
     *
     * The constants did not change, so every swing in §1.1 got *wider* -- from about 1.4x
     * to 2.8x, and from 2.5x to 4.4x for the divider. Pinned here as the case the art rows
     * have to answer, not as a standard: an absolute constant drawn across a 2.8x range is
     * the defect, and this is how big it now is.
     */
    let floor: ReturnType<typeof measure>
    let ceiling: ReturnType<typeof measure>
    beforeAll(() => {
        floor = measure(38)
        ceiling = measure(106)
    })

    /** How many times larger, as a fraction of the cell, a constant is at 38px than at 106. */
    const swing = (name: Constant) =>
        Math.round(((floor[name][0] / 38) / (ceiling[name][0] / 106)) * 100) / 100

    it('every fixed constant swings 2.79x between the phone and the desktop cap', () => {
        for (const name of ['outline', 'radius', 'pip', 'extrusion', 'entry'] as const) {
            expect(ceiling[name].every(v => v === TABLE[name].px(106)), TABLE[name].label).toBe(true)
            expect(swing(name), TABLE[name].label).toBe(2.79)
        }
    })

    it('and the divider swings 4.42x the other way', () => {
        // The one constant that is not fixed: `size - 32` is a stub of 6px at the phone
        // floor and 74px -- 70% of the cell -- at the cap.
        expect(ceiling.divider).toEqual([TABLE.divider.px(106), TABLE.divider.px(106)])
        const grows = (ceiling.divider[0] / 106) / (floor.divider[0] / 38)
        expect(Math.round(grows * 100) / 100).toBe(4.42)
    })
})
