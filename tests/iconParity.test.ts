import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import ts from 'typescript'
import { MARK, MARK_HEIGHT, renderIcon } from '@/scripts/icon'
import { PIECE, UNIT } from '@/app/dominoFill/Pieces/geometry'
import { rgbBytes, type Token } from '@/app/palette'

/**
 * The icon is the board's domino, measured (graphics spec P2-4, row 16).
 *
 * "Parity is asserted against P1-1's constants rather than judged by eye." So these read the
 * icon's own pixels, as the launcher would show them, and turn each measurement back into
 * units of the board's cell: the outline's weight, the corner radius, the pip's diameter, the
 * divider's span -- and the extrusion, and the silhouette's proportions, which P2-4 names
 * among the shape's differences. Each must come out as `PIECE` says, within a pixel or two
 * of anti-aliasing.
 *
 * `tests/icons.test.ts` (rows 20b and 20h) is untouched: the files match their generator,
 * the maskable mark fits the safe circle, every size is the same drawing.
 */

const SIZE = 512
/** Pixels per unit of the board's drawing, at SIZE: the renderer's own scale. */
const K = SIZE * MARK_HEIGHT / MARK.height

type Kind = 'ground' | 'face' | 'side' | 'black'
const KINDS: [Kind, Token][] = [['ground', 'ground'], ['face', 'tileFace'], ['side', 'tileSide'], ['black', 'pieceOutline']]

/** Every pixel of the icon, as whichever of the drawing's tones it is nearest. */
const classify = (): Kind[][] => {
    const png = renderIcon(SIZE)
    const chunks: Buffer[] = []
    for (let at = 8; at < png.length;) {
        const length = png.readUInt32BE(at)
        if (png.subarray(at + 4, at + 8).toString('ascii') === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + length))
        at += length + 12
    }
    const raw = inflateSync(Buffer.concat(chunks))
    const tones = KINDS.map(([kind, token]) => [kind, rgbBytes(token)] as const)
    return Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => {
        const at = y * (SIZE * 4 + 1) + 1 + x * 4
        let best: Kind = 'ground', distance = Infinity
        for (const [kind, [r, g, b]] of tones) {
            const d = (raw[at] - r) ** 2 + (raw[at + 1] - g) ** 2 + (raw[at + 2] - b) ** 2
            if (d < distance) { best = kind; distance = d }
        }
        return best
    }))
}

/** The runs of one kind along a line of pixels, as [start, length]. */
const runs = (line: Kind[], kind: Kind): [number, number][] => {
    const out: [number, number][] = []
    for (let i = 0; i < line.length; i++) {
        if (line[i] !== kind) continue
        const start = i
        while (i < line.length && line[i] === kind) i++
        out.push([start, i - start])
    }
    return out
}

/** A length in pixels, in units of the board's drawing. */
const units = (px: number) => px / K

describe('the icon draws from the board\'s own geometry', () => {
    it('which depends on nothing, because Node imports it at build time', () => {
        // `scripts/icon.ts` runs under tsx with no bundler, as the palette's rule says.
        const source = ts.createSourceFile('geometry.ts', readFileSync('app/dominoFill/Pieces/geometry.ts', 'utf8'),
            ts.ScriptTarget.Latest, true)
        expect(source.statements.filter(ts.isImportDeclaration).map(i => i.getText())).toEqual([])
    })
})

describe('the icon is the board\'s upright domino, in the board\'s proportions', () => {
    const icon = classify()
    const rows = icon
    const column = (x: number) => icon.map(row => row[x])

    // The mark's bounds: every pixel that is not ground.
    const marked = rows.flatMap((row, y) => row.map((kind, x) => kind === 'ground' ? null : [x, y])).filter(p => p !== null) as number[][]
    const left = Math.min(...marked.map(p => p[0])), right = Math.max(...marked.map(p => p[0]))
    const top = Math.min(...marked.map(p => p[1])), bottom = Math.max(...marked.map(p => p[1]))

    /** Black runs inside the outline on a row: the pip, or the divider. */
    const inner = (y: number) => runs(rows[y], 'black').slice(1, -1)
    /** The widest inner run on each row; the widest of all is the divider's. */
    const spans = rows.map((_, y) => Math.max(0, ...inner(y).map(([, n]) => n)))
    const widest = Math.max(...spans)
    /** The divider's first row: everything above it and inside the outline is the top half's. */
    const divider = spans.findIndex(n => n > widest / 2)

    it('reads a domino at all: face, side, and black, inside ground', () => {
        // A positive control: a render that painted nothing would measure nothing below.
        const kinds = new Set(icon.flat())
        expect([...kinds].sort()).toEqual(['black', 'face', 'ground', 'side'])
    })

    it('the silhouette: one cell wide, two tall, and the extrusion below, outline to outline', () => {
        expect(Math.abs(units(right - left + 1) - (UNIT - 2 * PIECE.inset + PIECE.outline))).toBeLessThanOrEqual(1)
        expect(Math.abs(units(bottom - top + 1) - (2 * UNIT - 2 * PIECE.inset + PIECE.extrusion + PIECE.outline))).toBeLessThanOrEqual(1)
    })

    it(`the outline is ${PIECE.outline} of the cell`, () => {
        // Across the middle of the mark, where the sides are straight.
        const middle = Math.round((top + bottom) / 2)
        const [first] = runs(rows[middle], 'black')
        expect(Math.abs(units(first[1]) - PIECE.outline)).toBeLessThanOrEqual(1)
    })

    it(`the pip is ${2 * PIECE.pipRadius} of the cell across`, () => {
        // The widest black run inside the outline above the divider: the pip's diameter.
        const pip = Math.max(...spans.slice(top, divider))
        expect(pip).toBeGreaterThan(0)
        expect(Math.abs(units(pip) - 2 * PIECE.pipRadius)).toBeLessThanOrEqual(1)
    })

    it(`the divider spans ${UNIT - 2 * PIECE.dividerInset} of the cell, ${PIECE.dividerWidth} thick`, () => {
        // The widest black run inside the outline anywhere is the divider; its rows are its weight.
        expect(Math.abs(units(widest) - (UNIT - 2 * PIECE.dividerInset))).toBeLessThanOrEqual(1)
        const thick = spans.filter(n => n > widest / 2).length
        expect(Math.abs(units(thick) - PIECE.dividerWidth)).toBeLessThanOrEqual(1)
    })

    it(`the extrusion shows ${PIECE.extrusion - PIECE.outline / 2} of the cell below the face`, () => {
        // Down the centre, between the face and the bottom outline: the side, less the half of
        // the stroke that lies over it.
        const [, shown] = runs(column(Math.round((left + right) / 2)), 'side').at(-1)!
        expect(Math.abs(units(shown) - (PIECE.extrusion - PIECE.outline / 2))).toBeLessThanOrEqual(1)
    })

    it(`the corners are ${PIECE.radius} of the cell round`, () => {
        /*
         * Along the diagonal in from the mark's top-left corner, the ground runs until the
         * outline's outer arc, of radius R + O/2, at (R + O/2)(1 - 1/√2) along each axis.
         */
        let steps = 0
        while (rows[top + steps][left + steps] === 'ground') steps++
        const outer = units(steps) / (1 - Math.SQRT1_2)
        expect(Math.abs(outer - PIECE.outline / 2 - PIECE.radius)).toBeLessThanOrEqual(2)
    })
})
