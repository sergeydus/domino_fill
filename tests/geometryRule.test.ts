import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

/**
 * No literal denominated in CSS pixels may appear in the drawing (graphics spec P0-6, row 6).
 *
 * Numbers inside a piece's `viewBox` are the design and are expected -- the rule is about
 * units, not about numbers. So what it forbids is the two ways a pixel length can get into
 * a drawing that is supposed to scale as one piece:
 *
 *   - **the cell size, used inside the drawing.** `strokeWidth={size / 9}` is a pixel length
 *     however it is computed; inside a `viewBox` the drawing's units already are the cell.
 *     The pixel size may enter only through `pieceBox`, on the outer `<svg>`.
 *   - **a CSS length on the piece**: a `px` string, or a class such as the old
 *     `-translate-y-4`, which was a fixed 16px lift on a piece that is meant to scale.
 *
 * `tests/pieceGeometry.test.tsx` proves the result -- every attribute scales linearly --
 * and this proves the form, so a pixel length cannot be added in a way that happens to be
 * right at the sizes that test renders.
 */

const PIECES = [
    'app/dominoFill/Pieces/DominoPieceOne.tsx',
    'app/dominoFill/Pieces/DominoPieceTwo.tsx',
    'app/dominoFill/Pieces/Rock.tsx',
]

/** The names a cell size in px goes by in these components. */
const PIXEL_NAMES = new Set(['size', 'cellSize', 'squareSize', 'boardsStore'])

type Breach = string

/** Every breach of the rule in one component's source. */
const breaches = (file: string, source: string): Breach[] => {
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const found: Breach[] = []
    const where = (node: ts.Node) => `${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`

    const inspectSvg = (svg: ts.JsxOpeningLikeElement) => {
        const attributes = svg.attributes.properties
        const named = (name: string) => attributes.find(a => ts.isJsxAttribute(a) && a.name.getText(sf) === name)
        if (named('viewBox') === undefined) found.push(`${where(svg)} <svg> has no viewBox`)
        const isPieceBox = (a: ts.JsxAttributeLike) => ts.isJsxSpreadAttribute(a)
            && ts.isCallExpression(a.expression) && a.expression.expression.getText(sf) === 'pieceBox'
        if (!attributes.some(isPieceBox)) found.push(`${where(svg)} <svg> does not take its box from pieceBox`)
        // Any other spread can carry a width, height, style or viewBox past pieceBox -- after
        // it, by overriding; before it, by whatever it adds that pieceBox does not set (codex,
        // row 6 review: the pieces spread caller props last).
        for (const a of attributes) {
            if (ts.isJsxSpreadAttribute(a) && !isPieceBox(a)) {
                found.push(`${where(svg)} <svg> spreads {...${a.expression.getText(sf)}}, which pieceBox does not own`)
            }
        }
        for (const name of ['width', 'height', 'className', 'class', 'style']) {
            if (named(name) !== undefined) found.push(`${where(svg)} <svg> sets ${name} itself`)
        }
    }

    /** Inside the svg: nothing may mention the pixel size or carry a CSS length. */
    const inspectDrawing = (node: ts.Node) => {
        if (ts.isIdentifier(node) && PIXEL_NAMES.has(node.text)) {
            found.push(`${where(node)} the drawing reads the cell size in px (${node.text})`)
        }
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /\d\s*px\b|translate-/.test(node.text)) {
            found.push(`${where(node)} a CSS length in the drawing ("${node.text}")`)
        }
        if (ts.isJsxAttribute(node) && ['className', 'class', 'style'].includes(node.name.getText(sf))) {
            found.push(`${where(node)} ${node.name.getText(sf)} on an element of the drawing`)
        }
        ts.forEachChild(node, inspectDrawing)
    }

    let svgs = 0
    const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sf) === 'svg') {
            svgs += 1
            inspectSvg(node.openingElement)
            node.children.forEach(inspectDrawing)
            return
        }
        ts.forEachChild(node, visit)
    }
    visit(sf)
    if (svgs !== 1) found.push(`${file} draws ${svgs} <svg> elements, not one`)
    return found
}

describe('no pixel length in the drawing', () => {
    for (const file of PIECES) {
        it(`${file.split('/').pop()} draws in its viewBox, and takes pixels only through pieceBox`, () => {
            expect(breaches(file, readFileSync(file, 'utf8'))).toEqual([])
        })
    }

    it('and each way of breaking the rule is seen', () => {
        const piece = (inside: string, svg = '{...pieceBox(1, 1, size)} viewBox={viewBox(1, 1)}') =>
            breaches('x.tsx', `const P = () => <svg ${svg}>${inside}</svg>`)
        // The clean form passes, numbers and all: they are drawing units.
        expect(piece('<rect x={6} y={O + E} width={U - 2 * O} rx={8} />')).toEqual([])

        expect(piece('<rect strokeWidth={size / 9} />')).toEqual([expect.stringMatching(/reads the cell size in px \(size\)/)])
        expect(piece('<circle r={boardsStore.squareSize / 6} />')).toHaveLength(2)
        expect(piece('<rect width="12px" />')).toEqual([expect.stringMatching(/a CSS length/)])
        expect(piece('<g className="-translate-y-4" />')).toHaveLength(2)
        expect(piece('<rect style={{ strokeWidth: 3 }} />')).toEqual([expect.stringMatching(/style on an element/)])

        expect(piece('', 'width={size} height={size + 16} viewBox="0 0 53 69"'))
            .toEqual(expect.arrayContaining([expect.stringMatching(/does not take its box from pieceBox/),
                expect.stringMatching(/sets width itself/), expect.stringMatching(/sets height itself/)]))
        expect(piece('', '{...pieceBox(1, 1, size)}')).toEqual([expect.stringMatching(/has no viewBox/)])
        expect(piece('', '{...pieceBox(1, 1, size)} viewBox={viewBox(1, 1)} className="-translate-y-4"'))
            .toEqual([expect.stringMatching(/sets className itself/)])

        // Caller props spread onto the svg, after pieceBox (the form row 6 first shipped
        // with) or before it: either way pieceBox is no longer the only source of the box.
        expect(piece('', '{...pieceBox(1, 1, size)} viewBox={viewBox(1, 1)} {...rest}'))
            .toEqual([expect.stringMatching(/spreads \{\.\.\.rest\}, which pieceBox does not own/)])
        expect(piece('', '{...props} {...pieceBox(1, 1, size)} viewBox={viewBox(1, 1)}'))
            .toEqual([expect.stringMatching(/spreads \{\.\.\.props\}/)])
    })
})
