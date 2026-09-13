import { describe, it, expect, beforeEach } from 'vitest'
import { RootStore } from '@/app/stores/RootStore'
import {
    PuzzleSession, GRID_BORDER_PX, GUTTER_FRACTION, LABEL_FONT_FRACTION, MIN_CELL_PX,
} from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'

/**
 * P0-3: the board shell is budgeted against the box it actually has.
 *
 * The old formula charged two full-cell gutters, divided the width only, and left the
 * grid's 8px border out of the budget. That is three separate ways for the shell to come
 * out wider than the space it was sized to fit -- and the third one was measured: a 6x6
 * shell rendered at 776px inside a 768px budget.
 *
 * Alignment and clipping need a real browser and are covered in e2e/layout.spec.ts. What
 * belongs here is the arithmetic: what fits, on which axis, and where the floor applies.
 */

let root: RootStore

const board = (n: number) => Array.from({ length: n }, () => Array(n).fill(null))

const make = (n: number, box?: { width: number, height: number }) => {
    const s = new PuzzleSession(definitionFrom({
        puzzleId: `geo-${n}`,
        board: board(n),
        boardHorizontalNumbers: Array(n).fill(0).join(','),
        boardVerticalNumbers: Array(n).fill(0).join(','),
    }), root)
    if (box) s.setAvailableBox(box)
    return s
}

/** The shell the formula promises: one gutter, n cells, and the border. */
const expectedShell = (s: PuzzleSession, n: number) =>
    s.gutterSize + n * s.squareSize + GRID_BORDER_PX

beforeEach(() => { root = new RootStore() })

describe('the shell fits the box it was given', () => {
    // Deliberately includes sizes that are not round numbers of cells.
    const boxes = [
        { width: 360, height: 640 },
        { width: 390, height: 844 },
        { width: 800, height: 400 },
        { width: 1280, height: 800 },
        { width: 640, height: 400 },
        { width: 333, height: 777 },
    ]

    for (const box of boxes) {
        for (const n of [2, 6, 7, 8]) {
            it(`${n}x${n} at ${box.width}x${box.height}`, () => {
                const s = make(n, box)

                expect(s.shellWidth).toBe(expectedShell(s, n))
                expect(s.shellHeight).toBe(s.shellWidth)
                // Width is never overridden: horizontal overflow is forbidden outright.
                expect(s.shellWidth, 'shell width').toBeLessThanOrEqual(box.width)
                expect(s.squareSize).toBeGreaterThan(0)

                // Height may be overridden by the floor, and only by the floor.
                if (!s.isHeightConstrained) {
                    expect(s.shellHeight, 'shell height').toBeLessThanOrEqual(box.height)
                } else {
                    expect(s.squareSize).toBe(MIN_CELL_PX)
                }
            })
        }
    }
})

describe('both axes are budgeted, not just the width', () => {
    it('a short landscape screen constrains the cell, not just a narrow one', () => {
        const wide = make(8, { width: 800, height: 800 })
        const short = make(8, { width: 800, height: 400 })

        expect(short.squareSize).toBeLessThan(wide.squareSize)
    })

    it('takes the smaller of the two budgets', () => {
        const s = make(8, { width: 1280, height: 500 })
        const byHeight = make(8, { width: 500, height: 500 })

        expect(s.squareSize).toBe(byHeight.squareSize)
    })
})

describe('the floor applies to height only', () => {
    it('never lets the floor push the shell wider than the box', () => {
        // 200px cannot fit an 8x8 board at 38px cells; the width budget still wins, so
        // the board gets tiny rather than overflowing sideways.
        const s = make(8, { width: 200, height: 2000 })

        expect(s.squareSize).toBeLessThan(MIN_CELL_PX)
        expect(s.shellWidth).toBeLessThanOrEqual(200)
    })

    it('stops shrinking vertically at the floor, and says so', () => {
        const s = make(8, { width: 1280, height: 150 })

        expect(s.squareSize).toBe(MIN_CELL_PX)
        expect(s.isHeightConstrained).toBe(true)
        // The page is expected to scroll here; that is the trade being made.
        expect(s.shellHeight).toBeGreaterThan(150)
    })

    it('is not flagged when the box genuinely fits', () => {
        const s = make(8, { width: 1280, height: 800 })
        expect(s.isHeightConstrained).toBe(false)
    })
})

describe('the acceptance criterion for a phone', () => {
    it('gives an 8x8 board at least 38px cells at 360 wide', () => {
        // (n + gutter)*cell + border <= viewport - margin, with a 8px margin each side:
        // 8.7*cell <= 344 - 8 -> cell <= 38.6. The criterion and the formula agree only
        // because the gutter is 0.7; at a full cell this is 37.3px and cannot pass.
        const s = make(8, { width: 360 - 16, height: 640 })

        expect(s.squareSize).toBeGreaterThanOrEqual(38)
        expect(s.shellWidth).toBeLessThanOrEqual(360 - 16)
    })

    it('would fail at a full-cell gutter, which is why 0.7 is load-bearing', () => {
        const s = make(8, { width: 360 - 16, height: 640 })
        const atFullGutter = Math.floor((344 - GRID_BORDER_PX) / (8 + 1))

        expect(atFullGutter).toBeLessThan(38)
        expect(s.squareSize).toBeGreaterThan(atFullGutter)
    })
})

describe('derived label geometry', () => {
    it('sizes the gutter at 0.7 of a cell, as an integer', () => {
        const s = make(8, { width: 1280, height: 800 })

        expect(s.gutterSize).toBe(Math.floor(s.squareSize * GUTTER_FRACTION))
        expect(Number.isInteger(s.gutterSize)).toBe(true)
    })

    it('derives the font from the cell rather than a constant', () => {
        const big = make(8, { width: 1280, height: 1280 })
        const small = make(8, { width: 360, height: 640 })

        expect(big.labelFontSize).toBe(Math.round(big.squareSize * LABEL_FONT_FRACTION))
        expect(small.labelFontSize).toBeLessThan(big.labelFontSize)
        // The defect: a constant 60px glyph inside a 39px box.
        expect(small.labelFontSize).toBeLessThan(small.squareSize)
    })

    it('leaves room for a glyph, not just for an em box', () => {
        // A font's content area -- ascent plus descent -- runs to about 1.3x its em box,
        // and `line-height: 1` shrinks the line box without shrinking the glyphs. Measured
        // at 360x640 before this was fixed: a 21px label needed 27px inside a 26px gutter.
        const s = make(8, { width: 360 - 16, height: 640 })

        expect(s.labelFontSize * 1.3).toBeLessThanOrEqual(s.gutterSize)
    })

    it('keeps the font fraction below what the gutter can hold', () => {
        // The constraint the number above has to satisfy, stated once rather than
        // rediscovered per viewport.
        expect(LABEL_FONT_FRACTION * 1.3).toBeLessThanOrEqual(GUTTER_FRACTION)
    })

    // Whether the widest label the game actually produces fits is a question about glyph
    // metrics, which only a browser can answer: e2e/layout.spec.ts drives every label to
    // "13" and checks scrollWidth/scrollHeight against the box. The arithmetic here cannot
    // stand in for that -- the version of it that tried used a 0.61-cell model and agreed
    // with a layout that was overflowing.
})

describe('the measured box, and the fallback before it arrives', () => {
    it('falls back to the viewport-derived size until the page is measured', () => {
        const s = make(8)
        expect(s.availableBox).toBeNull()
        expect(s.availableWidth).toBe(root.sizeStore.boardSize)
    })

    it('prefers the measurement once it arrives', () => {
        const s = make(8)
        const before = s.squareSize
        s.setAvailableBox({ width: 400, height: 400 })

        expect(s.squareSize).not.toBe(before)
        expect(s.availableWidth).toBe(400)
    })

    it('applies the session own ceiling on top of the measurement', () => {
        const s = make(2, { width: 1280, height: 800 })
        s.setMaxBoardSize(320)

        expect(s.availableWidth).toBe(320)
        expect(s.availableHeight).toBe(320)
        expect(s.shellWidth).toBeLessThanOrEqual(320)
    })
})
