/**
 * Move a page's calendar to `target`, and leave its clock running (graphics spec P0-3/P0-4).
 *
 * For `page.addInitScript(onDate, Date.parse(...))`, so it runs before the app reads the
 * date. `Date` then reads as `target` plus the time elapsed since the page began, and every
 * clock the animations run on -- `performance.now()`, the document timeline,
 * `requestAnimationFrame` -- is untouched.
 *
 * Not `page.clock.setFixedTime`, which stops `Date` dead, and measured: with it the
 * completion card's fade-in never finished in 7 of 360 loads, stuck at `opacity: 0`; with
 * the clock left alone, 0 of 360. The mechanism is not established -- the animation clocks
 * all kept advancing under the pinned clock -- which is the reason to stay clear of it rather
 * than a reason to trust it. The visual baselines use this too, for the same reason.
 *
 * Self-contained on purpose: Playwright ships it into the page as source text.
 */
export const onDate = (target: number) => {
    const Real = Date
    const offset = target - Real.now()
    const shifted = () => Real.now() + offset
    globalThis.Date = new Proxy(Real, {
        construct: (to, args, newTarget) =>
            Reflect.construct(to, args.length === 0 ? [shifted()] : args, newTarget),
        // `Date()` called without `new` returns a string.
        apply: () => new Real(shifted()).toString(),
        get: (to, prop, receiver) => prop === 'now' ? shifted : Reflect.get(to, prop, receiver),
    })
}
