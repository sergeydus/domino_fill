import { useEffect, useRef } from "react"
import { dayKey } from "../stores/progressStorage"

/** How often the day is re-checked while the tab is open and visible. */
export const ROLLOVER_POLL_MS = 60_000

/**
 * Call `onRollover` when the local calendar day changes (spec P1-7).
 *
 * The defect this exists for: the board is fetched once, in a mount effect, and never again.
 * A tab left open overnight therefore keeps serving yesterday's puzzle indefinitely — and
 * "left open overnight" is the *normal* case for a daily game on a phone, where the tab is
 * backgrounded rather than closed.
 *
 * Three triggers, because no one of them is enough:
 *
 * - `visibilitychange`, which is what actually fires when someone returns to a backgrounded
 *   tab the next morning. This is the common case by a wide margin.
 * - `focus`, for a desktop window that was never hidden — switching applications does not
 *   change visibility, so a tab on a second monitor can sit visible across midnight.
 * - a poll, for the tab that is visible and focused the whole time. Background timers are
 *   throttled hard, which is exactly why it cannot be the only trigger.
 *
 * The day is compared as a *local calendar key* rather than by scheduling a timer for the
 * next midnight. A timer assumes the clock runs forward at one second per second, which is
 * false across sleep, a timezone change on a flight, and a manual clock correction. Asking
 * "what day is it now" is immune to all three.
 */
export const useDayRollover = (onRollover: () => void) => {
    /*
     * The callback is read through a ref so that a caller passing an inline function does
     * not tear down and rebuild the listeners on every render.
     *
     * Updated in an effect rather than during render: writing a ref while rendering is a
     * real hazard under concurrent React, where a render can be thrown away, and the lint
     * rule that catches it is right to. The initial value covers the gap, since this effect
     * is declared before the one that installs the listeners and so runs first.
     */
    const callback = useRef(onRollover)
    useEffect(() => { callback.current = onRollover })

    useEffect(() => {
        let seen = dayKey(new Date())

        const check = () => {
            const today = dayKey(new Date())
            if (today === seen) return
            // Updated *before* the callback: the callback can be slow (it refetches), and a
            // second trigger arriving meanwhile must not start a second rollover.
            seen = today
            callback.current()
        }

        const onVisible = () => { if (!window.document.hidden) check() }

        // On `document`, not on `window`: `visibilitychange` is dispatched at the document,
        // and listening on both would simply run the check twice.
        window.document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', check)
        const timer = window.setInterval(check, ROLLOVER_POLL_MS)

        return () => {
            window.document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', check)
            window.clearInterval(timer)
        }
    }, [])
}
