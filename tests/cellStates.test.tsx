// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { AnchorMark, CandidateMark, FocusMark, HintMark, RefusedMark, STATE } from '@/app/dominoFill/cellStates'
import { PALETTE } from '@/app/palette'
import { runInAction } from 'mobx'
import Selection from '@/app/dominoFill/Selection'
import { PuzzleSession } from '@/app/stores/PuzzleSession'
import { definitionFrom } from '@/app/stores/PuzzleDefinition'
import { RootStore } from '@/app/stores/RootStore'

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

const MARKS = { anchor: <AnchorMark />, candidate: <CandidateMark />, focus: <FocusMark />, hint: <HintMark />, refused: <RefusedMark /> }

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

    it('the focus is four corner brackets, bent round, outside the ring', () => {
        const path = markup(MARKS.focus).querySelector('[data-brackets]')!
        // Four separate strokes, each an L bent round its corner: a move, a line, a quarter
        // circle of the bend's radius, a line.
        const d = path.getAttribute('d')!
        expect(d.match(/M/g)).toHaveLength(4)
        expect(d.match(/A (\S+) (\S+) 0 0 1/g)).toEqual(Array(4).fill(`A ${STATE.focus.bend} ${STATE.focus.bend} 0 0 1`))
        expect(path.getAttribute('fill')).toBe('none')
        expect(path.getAttribute('stroke')).toBe(PALETTE.cellFocus)
        // Its halo's inner edge clears the ring's outer edge.
        expect(STATE.focus.inset + STATE.focus.stroke / 2 + STATE.focus.halo)
            .toBeLessThanOrEqual(STATE.ring.inset - STATE.ring.stroke / 2)
    })

    it('the soft corners: thin, on a white halo drawn under them', () => {
        const svg = markup(MARKS.focus)
        const [halo, brackets] = [svg.querySelector('[data-halo]')!, svg.querySelector('[data-brackets]')!]
        expect(halo.getAttribute('d')).toBe(brackets.getAttribute('d'))
        expect(halo.getAttribute('stroke')).toBe(PALETTE.cellFocusHalo)
        expect(Number(brackets.getAttribute('stroke-width'))).toBe(STATE.focus.stroke)
        expect(Number(halo.getAttribute('stroke-width'))).toBe(STATE.focus.stroke + 2 * STATE.focus.halo)
        expect(halo.compareDocumentPosition(brackets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        // Thinner than the brackets they replace, which were 8 wide and 28 long.
        expect([STATE.focus.stroke, STATE.focus.arm]).toEqual([5, 24])
    })

    it('the hint is a filled diamond at the centre', () => {
        const diamond = markup(MARKS.hint).querySelector('[data-diamond]')!
        const points = diamond.getAttribute('points')!.split(' ').map(p => p.split(',').map(Number))
        expect(points).toEqual([[50, 50 - STATE.hint.reach], [50 + STATE.hint.reach, 50], [50, 50 + STATE.hint.reach], [50 - STATE.hint.reach, 50]])
        expect(diamond.getAttribute('fill')).toBe(PALETTE.hint)
    })
})

describe('P1-6: a refused move is a cross, red on a white halo', () => {
    const svg = () => markup(MARKS.refused)

    it('two strokes corner to corner, the red over its halo, which is wider by the halo either side', () => {
        const [halo, cross] = [svg().querySelector('[data-halo]')!, svg().querySelector('[data-cross]')!]
        const { reach: r, stroke, halo: h } = STATE.refused
        const d = `M ${50 - r} ${50 - r} L ${50 + r} ${50 + r} M ${50 + r} ${50 - r} L ${50 - r} ${50 + r}`
        expect([halo.getAttribute('d'), cross.getAttribute('d')]).toEqual([d, d])
        expect(cross.getAttribute('stroke')).toBe(PALETTE.problem)
        expect(halo.getAttribute('stroke')).toBe(PALETTE.refusedHalo)
        expect(Number(cross.getAttribute('stroke-width'))).toBe(stroke)
        expect(Number(halo.getAttribute('stroke-width'))).toBe(stroke + 2 * h)
        // Drawn in that order, so the red is on top.
        expect(halo.compareDocumentPosition(cross) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('its ends stop short of the focus brackets, which can share its square', () => {
        /*
         * A refused Space or arrow is refused on the focused square, so the brackets and the
         * cross are drawn together. The cross's reach is its round caps -- a disc of half
         * the halo's width at each end -- and every point of those discs must be inside the
         * brackets' inner edge.
         */
        const clear = STATE.focus.inset + STATE.focus.stroke / 2 + STATE.focus.halo
        const { reach: r, stroke, halo } = STATE.refused
        const cap = stroke / 2 + halo
        const nearest = Math.min(...[50 - r, 50 + r].flatMap(e => [e - cap, 100 - (e + cap)]))
        expect(nearest).toBeGreaterThan(clear)
    })

    it('and the anchor ring, which a refused arrow keeps on its square, is drawn over it and stays whole', () => {
        // Its ends pass under the ring's corners: kept inside the ring, the cross was 14.9%
        // from the hint's diamond in greyscale, under P1-5's 15% (e2e/cellStates.spec.ts).
        const s = new PuzzleSession(definitionFrom({
            puzzleId: 'refused-on-anchor',
            board: Array.from({ length: 6 }, () => Array<number | null>(6).fill(null)),
            boardHorizontalNumbers: '3,3,3,3,3,3',
            boardVerticalNumbers: '3,3,3,3,3,3',
        }), new RootStore())
        runInAction(() => {
            s.setFocusedCell([0, 0])
            s.handleKey(' ')
            s.handleKey('ArrowUp')   // off the board: refused, and the anchor is kept
        })
        expect([s.refusedAt, s.pendingAnchor]).toEqual([[0, 0], [0, 0]])
        const host = document.createElement('div')
        host.innerHTML = renderToString(<Selection boardsStore={s} />)
        const order = [...host.querySelectorAll('[data-refused], [data-anchor]')].map(el =>
            el.hasAttribute('data-refused') ? 'refused' : 'anchor')
        expect(order).toEqual(['refused', 'anchor'])
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
