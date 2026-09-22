// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMediaQuery } from '@/app/hooks/useMediaQuery'
import { WIDE_LAYOUT_QUERY } from '@/app/dominoFill/composition'

/**
 * The hook that decides between one column and two (graphics spec P0-1, row 1).
 *
 * Browser tests cover what the compositions *are*; this covers the three ways the hook
 * itself can be wrong, none of which a layout assertion would notice: answering `true`
 * before it has any right to, never answering again after the window changes, and
 * leaving its listener attached.
 */

type Listener = () => void

let listeners: Listener[]
let removed: Listener[]
let currentlyMatches: boolean
let originalMatchMedia: typeof window.matchMedia

beforeEach(() => {
    listeners = []
    removed = []
    currentlyMatches = false
    originalMatchMedia = window.matchMedia
    /*
     * Stubbed in the test rather than worked around in the hook.
     *
     * jsdom's own `matchMedia` never matches anything and cannot be made to change its
     * mind, so it can only ever produce the `false` branch. The stub is what makes the
     * other branch reachable -- and the production code is not bent to suit the
     * environment, which is the rule this repository keeps.
     */
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        media: query,
        get matches() { return currentlyMatches },
        addEventListener: (_: string, fn: Listener) => { listeners.push(fn) },
        removeEventListener: (_: string, fn: Listener) => { removed.push(fn) },
    })) as unknown as typeof window.matchMedia
})

afterEach(() => { window.matchMedia = originalMatchMedia })

/** What a `change` event does: the query's answer moves, then subscribers are told. */
const resizeTo = (matches: boolean) => act(() => {
    currentlyMatches = matches
    for (const listener of listeners) listener()
})

describe('useMediaQuery', () => {
    it('reads the query on mount, not only when it next changes', () => {
        /*
         * A query that already matches when the page loads fires no `change` event. A
         * hook that subscribed and waited would leave every desktop in the phone's
         * composition until the user happened to resize the window -- which most never do.
         */
        currentlyMatches = true
        const { result } = renderHook(() => useMediaQuery(WIDE_LAYOUT_QUERY))
        expect(result.current).toBe(true)
    })

    it('says no while it does not know', () => {
        // There is no `window` during SSR and no honest answer before the first effect, so
        // the first render is the single column everywhere. Deliberately this way round: a
        // desktop that starts narrow re-measures once, while a phone that starts wide
        // would lay a 260px rail beside a 360px board.
        const { result } = renderHook(() => useMediaQuery(WIDE_LAYOUT_QUERY))
        expect(result.current).toBe(false)
    })

    it('follows the window across the breakpoint, in both directions', () => {
        const { result } = renderHook(() => useMediaQuery(WIDE_LAYOUT_QUERY))
        expect(result.current).toBe(false)

        resizeTo(true)
        expect(result.current, 'a window dragged wider must gain the rail').toBe(true)

        resizeTo(false)
        expect(result.current, 'and dragged narrower must lose it').toBe(false)
    })

    it('takes its listener with it when it goes', () => {
        // The defect D10-l recorded in `SizeStore`: a listener nobody removes, left behind
        // by every unmount, answering for a component that no longer exists.
        const { unmount } = renderHook(() => useMediaQuery(WIDE_LAYOUT_QUERY))
        expect(listeners).toHaveLength(1)

        unmount()
        expect(removed).toEqual(listeners)
    })

    it('lays out in one column where matchMedia does not exist', () => {
        /*
         * Some embedded webviews have no `matchMedia`. Without the guard the hook throws
         * during an effect and takes the whole page with it -- so the failure mode is a
         * blank screen rather than a missing rail.
         */
        // @ts-expect-error -- removing it is the condition under test
        delete window.matchMedia

        const { result } = renderHook(() => useMediaQuery(WIDE_LAYOUT_QUERY))
        expect(result.current).toBe(false)
    })
})

describe('the breakpoint itself', () => {
    it('asks about height as well as width', () => {
        /*
         * The rail is the part that has to fit: measured at 322px tall, it does not belong
         * in a 600px window that also has to hold a board. A width-only query would give
         * 1280x600 a rail and push the board below the fold.
         */
        expect(WIDE_LAYOUT_QUERY).toMatch(/min-width:\s*1024px/)
        expect(WIDE_LAYOUT_QUERY).toMatch(/min-height:\s*640px/)
    })
})
