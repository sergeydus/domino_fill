// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { useLayoutEffect } from 'react'
import { render, cleanup } from '@testing-library/react'
import { FocusAcrossComposition, controlKey } from '@/app/dominoFill/FocusAcrossComposition'

/**
 * The boundary that keeps the keyboard's place when the page is rearranged (P0-1, row 1).
 *
 * e2e/desktop.spec.ts covers the thing itself: cross the real breakpoint in a real browser
 * and the real Reset button still has focus. What it cannot reach is the *scope* of the
 * rule -- a rebuild that is not a rearrangement, and a control that survives one -- because
 * in today's composition every control that carries a key moves, and nothing that stays
 * carries one. Those are the two ways this can be wrong without any browser noticing, so
 * they are tested against the boundary directly.
 */

/**
 * A control, and a second parent to rebuild it under.
 *
 * React identifies an element by its position, so rendering the same button under a
 * different parent unmounts it and builds a new one -- which is exactly what the
 * breakpoint does to the rail, and why the focused node stops existing.
 */
const Harness = ({ composition, parent }: { composition: string; parent: 'a' | 'b' }) => {
    const button = <button type='button' data-reset>Reset</button>
    return (
        <FocusAcrossComposition composition={composition}>
            <div>
                <div data-parent='a'>{parent === 'a' && button}</div>
                <div data-parent='b'>{parent === 'b' && button}</div>
                <div data-survivor tabIndex={-1} />
            </div>
        </FocusAcrossComposition>
    )
}

const focused = () => document.activeElement?.getAttribute('data-reset') !== null
    ? 'reset'
    : document.activeElement?.tagName ?? null

afterEach(cleanup)

describe('focus across a composition change', () => {
    it('puts the keyboard on the control that was rebuilt', () => {
        const { rerender } = render(<Harness composition='column' parent='a' />)
        document.querySelector<HTMLElement>('[data-reset]')!.focus()
        expect(focused()).toBe('reset')

        rerender(<Harness composition='rail' parent='b' />)

        // A *different* node now: the first one was destroyed with its parent's contents.
        expect(document.querySelector('[data-parent="b"] [data-reset]')).not.toBeNull()
        expect(focused()).toBe('reset')
    })

    it('leaves a rebuild that is not a rearrangement alone', () => {
        /*
         * The scope of the rule, and the reason the arrangement is named rather than
         * inferred. `getSnapshotBeforeUpdate` runs on *every* update, and this board
         * re-renders on every move -- so a boundary that restored focus whenever it could
         * would be calling `focus()` continuously, dragging the page back to a control
         * each time the player did anything. Rearranging is the only thing it answers to.
         */
        const { rerender } = render(<Harness composition='column' parent='a' />)
        document.querySelector<HTMLElement>('[data-reset]')!.focus()

        rerender(<Harness composition='column' parent='b' />)

        expect(focused()).toBe('BODY')
    })

    it('leaves focus that survived the rearrangement where it is', () => {
        /*
         * The other half: someone reading the board, with focus on a square, does not have
         * it taken away and handed to a button because the window was resized. In the page
         * itself this is every board cell -- none of them carries a key, and none of them
         * moves.
         */
        const { rerender } = render(<Harness composition='column' parent='a' />)
        document.querySelector<HTMLElement>('[data-survivor]')!.focus()

        rerender(<Harness composition='rail' parent='b' />)

        expect(document.activeElement?.hasAttribute('data-survivor')).toBe(true)
    })
})

describe('the key that finds a control again', () => {
    it('keeps a value that tells two controls apart', () => {
        const node = document.createElement('button')
        node.setAttribute('data-difficulty', 'hard')
        // Three buttons differ only by this value: dropping it finds "easy" every time.
        expect(controlKey(node)).toBe('[data-difficulty="hard"]')
    })

    it('is null for anything that is not one', () => {
        expect(controlKey(document.createElement('div'))).toBeNull()
        expect(controlKey(null)).toBeNull()
    })
})

describe('focus that something else claimed', () => {
    /*
     * A dialog opening, or a control taking focus for itself, can happen on the very commit
     * that rearranges the page -- and React runs the commit from the leaves upwards, so
     * that claim is already in place by the time this boundary gets its turn. Restoring
     * over the top of it would be overruling a deliberate decision with a remembered one.
     */
    const Claimant = ({ composition }: { composition: string }) => {
        useLayoutEffect(() => {
            document.querySelector<HTMLElement>('[data-survivor]')?.focus()
        }, [composition])
        return null
    }

    const Contested = ({ composition, parent }: { composition: string; parent: 'a' | 'b' }) => (
        <FocusAcrossComposition composition={composition}>
            <div>
                <div data-parent='a'>{parent === 'a' && <button type='button' data-reset />}</div>
                <div data-parent='b'>{parent === 'b' && <button type='button' data-reset />}</div>
                <div data-survivor tabIndex={-1} />
                <Claimant composition={composition} />
            </div>
        </FocusAcrossComposition>
    )

    it('is not taken back by the restoration', () => {
        const { rerender } = render(<Contested composition='column' parent='a' />)
        document.querySelector<HTMLElement>('[data-reset]')!.focus()
        expect(focused()).toBe('reset')

        rerender(<Contested composition='rail' parent='b' />)

        expect(document.activeElement?.hasAttribute('data-survivor'),
            'the restoration overruled a deliberate focus').toBe(true)
    })
})
