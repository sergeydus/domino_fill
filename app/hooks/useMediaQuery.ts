"use client"
import { useEffect, useState } from "react"

/**
 * Whether a media query matches, kept in sync as the window changes.
 *
 * Used by the desktop composition (graphics spec P0-1) to decide between one column and
 * two. A query rather than a measured width, because the composition has to be chosen
 * *before* the board is measured — deciding it from the board's own box is the feedback
 * loop `useAvailableBoardBox` was written to avoid.
 *
 * **Starts `false`, always.** There is no `window` during SSR and no honest answer to give
 * before the first effect runs, so the first render is the single-column composition
 * everywhere and a wide viewport switches on the next frame. That is a deliberate choice
 * of which way to be wrong: a desktop briefly showing the phone's layout re-measures once,
 * while a phone briefly showing the desktop's would lay a rail beside a 360px board.
 *
 * `matchMedia` is guarded because jsdom did not implement it until recently and some
 * embedded webviews still do not; without a guard the whole page fails to render rather
 * than laying out in one column.
 */
export const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

        const list = window.matchMedia(query)
        const sync = () => setMatches(list.matches)

        // Read once on mount as well as on change: a query that already matches fires no
        // `change` event, so a listener alone would leave every desktop in one column.
        sync()
        list.addEventListener('change', sync)
        return () => list.removeEventListener('change', sync)
    }, [query])

    return matches
}
