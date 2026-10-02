import type { Page } from '@playwright/test'

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

/**
 * A published day with earlier days in its month, for tests that open one from the archive.
 *
 * On the first of a month the archive offers only today, so a test that took "an earlier day
 * this month" from the real calendar failed or skipped every 1st: measured on 2026-10-01,
 * four failures (two tests, in both projects) and eight skips (four tests, in both).
 * Pinned instead, as the tests needing particular cells are.
 */
export const LATE_IN_A_MONTH = '2026-09-29'

/**
 * Pin the page's calendar to noon on `day` (YYYY-MM-DD), before the page loads anything.
 *
 * Noon in the *browser's* time zone, read from the page, because the day the app serves is
 * the page's local date: a fixed instant is not one date everywhere (codex, on UTC+12 to +14).
 */
export const pinDay = async (page: Page, day: string) => {
    const [y, m, d] = day.split('-').map(Number)
    const noon = await page.evaluate(([y, m, d]) => new Date(y, m - 1, d, 12).getTime(), [y, m, d])
    await page.addInitScript(onDate, noon)
}
