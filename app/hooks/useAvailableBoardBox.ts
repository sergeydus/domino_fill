"use client"
import { useEffect, useState } from "react"

export type Box = { width: number, height: number }

/**
 * The box the board may occupy, in CSS px.
 *
 * Measured as **viewport minus the chrome around the board** -- the difficulty slider, the
 * piece tray, the level controls and the column's own gaps -- and never from the board's
 * own container.
 *
 * That distinction is the whole point. The board is laid out *from* this number, so
 * measuring a box whose height depends on the board's height is a feedback loop: the board
 * hits its floor, overflows its area, the column grows, the area grows, the cell grows,
 * repeat. The chrome's height does not depend on the board's, so this measurement is
 * stable by construction.
 *
 * Chrome is found by the `data-chrome` marker rather than by ref plumbing, so adding a
 * control to the column is enough to have it budgeted for.
 *
 * Replaces `SizeStore`'s `window.onresize =` (spec D10-l), which clobbered any other
 * listener, was never removed, and ran unthrottled -- a desktop window-drag re-laid out
 * every cell on every frame.
 */
export const useAvailableBoardBox = (
    /**
     * The column holding the board and its chrome.
     *
     * The element, not a ref. A ref would be null on the first effect run -- the column
     * does not exist until the board has loaded -- and nothing would re-run the effect
     * when it appeared, so the board would keep the pre-measurement fallback size forever.
     * Caught by the 38px phone criterion, which came out at 36: the fallback's number.
     */
    el: HTMLElement | null,
    /** Page margin to keep clear on each side, in CSS px. */
    margin = 0,
): Box | null => {
    const [box, setBox] = useState<Box | null>(null)

    useEffect(() => {
        if (!el) return

        let frame = 0
        let last: Box | null = null

        /*
         * Safe-area insets, resolved to pixels.
         *
         * `env(safe-area-inset-*)` cannot be read from script, and `getPropertyValue`
         * hands back the unresolved `env(...)` text. Applying them as padding to a probe
         * and reading the computed padding is what turns them into numbers. The probe is
         * `fixed` and zero-sized, so it lays nothing out and affects no measurement.
         */
        const probe = document.createElement('div')
        probe.setAttribute('aria-hidden', 'true')
        probe.style.cssText =
            'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
            'padding:var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)'
        document.body.appendChild(probe)

        const insets = () => {
            const cs = getComputedStyle(probe)
            return {
                top: parseFloat(cs.paddingTop) || 0,
                right: parseFloat(cs.paddingRight) || 0,
                bottom: parseFloat(cs.paddingBottom) || 0,
                left: parseFloat(cs.paddingLeft) || 0,
            }
        }

        const read = (): Box => {
            let used = 0
            for (const item of el.querySelectorAll<HTMLElement>('[data-chrome]')) {
                used += item.offsetHeight
            }

            // The column's own row gaps, and only between children that are actually laid
            // out in it: the tutorial is a `fixed` child, so it takes part in no gap. A
            // plain `childElementCount` over-counts by a gap whenever it is mounted, and
            // then changes answer when it is dismissed.
            const inFlow = [...el.children].filter(child => {
                const position = getComputedStyle(child).position
                return position !== 'fixed' && position !== 'absolute'
            }).length
            const gap = parseFloat(getComputedStyle(el).rowGap) || 0
            used += gap * Math.max(0, inFlow - 1)

            // `documentElement.clientWidth` excludes the scrollbar; `innerWidth` does not,
            // and budgeting from a width the page does not have is how the board ends up
            // one scrollbar too wide.
            const safe = insets()
            return {
                width: Math.max(0, document.documentElement.clientWidth
                    - margin * 2 - safe.left - safe.right),
                height: Math.max(0, window.innerHeight
                    - used - margin * 2 - safe.top - safe.bottom),
            }
        }

        const measure = () => {
            frame = 0
            const next = read()
            // Bail when nothing moved. Without this the hook sets a fresh object on every
            // observation and re-renders forever.
            if (last && last.width === next.width && last.height === next.height) return
            last = next
            setBox(next)
        }

        // Coalesce to one measurement per frame: a window drag fires resize far faster
        // than the board can usefully be re-laid out.
        const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }

        measure()

        const observer = new ResizeObserver(schedule)
        observer.observe(el)
        // Border-box, so a change in the probe's padding -- i.e. in the safe-area insets,
        // on an orientation change -- re-measures on its own.
        observer.observe(probe, { box: 'border-box' })
        for (const item of el.querySelectorAll<HTMLElement>('[data-chrome]')) observer.observe(item)

        window.addEventListener('resize', schedule)
        // The mobile URL bar changes the visual viewport without firing `resize`; this is
        // the JS counterpart of preferring `svh` to `vh`.
        window.visualViewport?.addEventListener('resize', schedule)

        return () => {
            if (frame) cancelAnimationFrame(frame)
            probe.remove()
            observer.disconnect()
            window.removeEventListener('resize', schedule)
            window.visualViewport?.removeEventListener('resize', schedule)
        }
    }, [el, margin])

    return box
}
