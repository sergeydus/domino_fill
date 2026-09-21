import { describe, it, expect } from 'vitest'
import { cellDescription } from '@/app/dominoFill/cellLabel'
import { adviceMessage } from '@/app/dominoFill/adviceText'

/**
 * What a square is called (spec P1-8, row 19).
 *
 * The browser test proves the names reach the accessibility tree; this pins what they say,
 * which a browser cannot check as cheaply. The one property worth more than the others is
 * the last: the hint and the square it points at have to use the same words for the same
 * thing, and nothing but a test keeps two files agreeing about that.
 */

describe('naming a square', () => {
    it('counts rows and columns from one, the way the player does', () => {
        expect(cellDescription([0, 0], null)).toMatch(/^Row 1, column 1,/)
        expect(cellDescription([5, 3], null)).toMatch(/^Row 6, column 4,/)
    })

    it('leads with the position, which is what an interrupted phrase should still carry', () => {
        // A screen reader cut off mid-label has then already said the useful part.
        expect(cellDescription([2, 2], 1).indexOf('Row 3, column 3')).toBe(0)
    })

    it('distinguishes empty, a rock and a piece', () => {
        const empty = cellDescription([0, 0], null)
        const rock = cellDescription([0, 0], -1)
        const piece = cellDescription([0, 0], 1)
        expect(new Set([empty, rock, piece]).size).toBe(3)
        expect(empty).toMatch(/empty/)
        expect(rock).toMatch(/rock/)
    })

    it('never reads a pip value out as a bare number', () => {
        /*
         * "1" is a quiz. The same rule the advice strip follows.
         *
         * Asserted on the *contents* clause only: the first version of this checked the
         * whole string for a digit, which the coordinates in "Row 1, column 1" satisfy
         * trivially -- it passed against every possible implementation and proved nothing.
         */
        for (const value of [0, 1, 2]) {
            const contents = cellDescription([0, 0], value).replace(/^Row \d+, column \d+, /, '')
            expect(contents).not.toMatch(/\d/)
            expect(contents).toMatch(/domino/)
        }
    })

    it('adds the state of a half-made move, and says what to do next', () => {
        const anchor = cellDescription([1, 1], null, { isAnchor: true })
        expect(anchor).toMatch(/selected/)
        // Not just "selected": the player has to know an arrow key comes next.
        expect(anchor).toMatch(/direction/)
        expect(cellDescription([1, 1], null, { isCandidate: true })).toMatch(/paired/)
        expect(cellDescription([1, 1], null, { isHinted: true })).toMatch(/hinted/)
    })

    it('leaves a plain square plain', () => {
        const plain = cellDescription([1, 1], null)
        for (const word of ['selected', 'paired', 'hinted']) expect(plain).not.toMatch(word)
    })

    it('names a piece the same way the hint does', () => {
        /*
         * The one cross-file property here. A hint says "the top half of an upright
         * domino" and then points at a square; if the square answers with different
         * words, a player hears two descriptions and reasonably concludes they are two
         * different things. Checked against the real message rather than a copy of it.
         */
        for (const value of [0, 1, 2]) {
            const hint = adviceMessage({ kind: 'hint', cell: [2, 3], value })
            const said = hint.replace(/^Row 3, column 4 holds the /, '').replace(/\.$/, '')
            const named = cellDescription([2, 3], value).replace(/^Row 3, column 4, /, '')
            // Exact, not `toContain`: an article's worth of drift is what this caught.
            expect(named).toBe(said)
        }
    })
})
