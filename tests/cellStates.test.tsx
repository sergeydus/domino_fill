// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { AnchorMark, CandidateMark, FocusMark, HintMark, STATE } from '@/app/dominoFill/cellStates'
import { PALETTE } from '@/app/palette'

/**
 * The four cell states' drawings, as markup (graphics spec P1-5, row 11).
 *
 * `e2e/cellStates.spec.ts` measures what matters on screen: each state's greyscale footprint
 * at 38 and 53px, and each length as a fraction of the cell. This pins the structure those
 * measurements come from -- which channel each state carries besides its colour, and that
 * every drawing is in cell units with no pixel length anywhere in it.
 */

const markup = (el: React.ReactElement) => {
    const host = document.createElement('div')
    host.innerHTML = renderToString(el)
    return host.querySelector('svg')!
}

const MARKS = { anchor: <AnchorMark />, candidate: <CandidateMark />, focus: <FocusMark />, hint: <HintMark /> }

describe('P1-5: each state carries a channel besides colour', () => {
    it('the anchor is a solid ring', () => {
        const ring = markup(MARKS.anchor).querySelector('[data-ring]')!
        expect(ring.getAttribute('stroke-dasharray')).toBeNull()
        expect(ring.getAttribute('fill')).toBe('none')
        expect(ring.getAttribute('stroke')).toBe(PALETTE.anchor)
    })

    it('a candidate is the same ring, dashed, over a wash', () => {
        const svg = markup(MARKS.candidate)
        const ring = svg.querySelector('[data-ring]')!
        const anchor = markup(MARKS.anchor).querySelector('[data-ring]')!
        for (const a of ['x', 'y', 'width', 'height', 'rx', 'stroke-width']) {
            expect(ring.getAttribute(a), a).toBe(anchor.getAttribute(a))
        }
        expect(ring.getAttribute('stroke-dasharray')).toBe(`${STATE.dash.on} ${STATE.dash.off}`)
        expect(svg.querySelector('[data-wash]')!.getAttribute('fill')).toBe(PALETTE.candidateWash)
    })

    it('the focus is four corner brackets, outside the ring', () => {
        const path = markup(MARKS.focus).querySelector('[data-brackets]')!
        // Four separate strokes, each an L: a move, then two lines.
        expect(path.getAttribute('d')!.match(/M/g)).toHaveLength(4)
        expect(path.getAttribute('fill')).toBe('none')
        // Its stroke's inner edge clears the ring's outer edge.
        expect(STATE.focus.inset + STATE.focus.stroke / 2).toBeLessThanOrEqual(STATE.ring.inset - STATE.ring.stroke / 2)
    })

    it('the hint is a filled diamond at the centre', () => {
        const diamond = markup(MARKS.hint).querySelector('[data-diamond]')!
        const points = diamond.getAttribute('points')!.split(' ').map(p => p.split(',').map(Number))
        expect(points).toEqual([[50, 50 - STATE.hint.reach], [50 + STATE.hint.reach, 50], [50, 50 + STATE.hint.reach], [50 - STATE.hint.reach, 50]])
        expect(diamond.getAttribute('fill')).toBe(PALETTE.hint)
    })
})

describe('P1-5: every drawing is in cell units', () => {
    it('each is a 100-unit viewBox sized to its square, and hidden from assistive technology', () => {
        for (const [name, el] of Object.entries(MARKS)) {
            const svg = markup(el)
            expect(svg.getAttribute('viewBox'), name).toBe('0 0 100 100')
            expect([svg.getAttribute('width'), svg.getAttribute('height')], name).toEqual(['100%', '100%'])
            expect(svg.getAttribute('aria-hidden'), name).toBe('true')
        }
    })

    it('and no pixel length is written anywhere in them or in the squares that hold them', () => {
        // The four were CSS borders and outlines in pixels (4px, 4px, 3px, 4px) until P1-5.
        for (const file of ['app/dominoFill/cellStates.tsx', 'app/dominoFill/Selection.tsx']) {
            const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
            expect(code, file).not.toMatch(/\d\s*px|\b(border|outline)-\d|inset-\[/)
        }
    })
})
