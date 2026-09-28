import { expect, type Page } from '@playwright/test'

/**
 * What the browser painted, frame by frame (graphics spec P1-6, row 12).
 *
 * A motion limit is a claim about the screen, so it is measured there: every animation
 * frame, the element's box, opacity, colour and transform are read back from layout and the
 * computed style -- whatever drives the animation, `motion` or CSS or anything later.
 */
export type Sample = { t: number, x: number, y: number, opacity: number, color: string, tx: number, ty: number }

/**
 * Sample `selector` every frame for `ms` milliseconds.
 *
 * If it is on the page, from now; if not, from the moment it is inserted, caught by a
 * `MutationObserver` -- whose callback runs at the microtask checkpoint after the insertion,
 * so the first sample is the state it was inserted in, before any frame could move it.
 */
export const track = (page: Page, name: string, selector: string, ms = 800) =>
    page.evaluate(({ name, selector, ms }) => {
        const w = window as unknown as { __frames: Record<string, Sample[]>, __done: Record<string, boolean> }
        w.__frames ??= {}
        w.__done ??= {}
        const out: Sample[] = []
        w.__frames[name] = out
        w.__done[name] = false
        const read = (el: Element, t: number) => {
            const r = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            const m = cs.transform === 'none' ? null : new DOMMatrix(cs.transform)
            out.push({ t, x: r.x, y: r.y, opacity: Number(cs.opacity), color: cs.color, tx: m?.e ?? 0, ty: m?.f ?? 0 })
        }
        const follow = (el: Element) => {
            const t0 = performance.now()
            read(el, t0)
            const tick = (now: number) => {
                if (!el.isConnected) { w.__done[name] = true; return }
                read(el, now)
                if (now - t0 < ms) requestAnimationFrame(tick)
                else w.__done[name] = true
            }
            requestAnimationFrame(tick)
        }
        const present = document.querySelector(selector)
        if (present) { follow(present); return }
        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector)
            if (!el) return
            observer.disconnect()
            follow(el)
        })
        observer.observe(document.body, { childList: true, subtree: true })
    }, { name, selector, ms })

/** The samples, once the tracker has run its course. */
export const frames = async (page: Page, name: string): Promise<Sample[]> => {
    await expect.poll(() => page.evaluate(n =>
        (window as unknown as { __done: Record<string, boolean> }).__done[n], name), { timeout: 5_000 }).toBe(true)
    return page.evaluate(n => (window as unknown as { __frames: Record<string, Sample[]> }).__frames[n], name)
}

/**
 * How long something moved, bounded from both sides by the frames that saw it.
 *
 * `moving(i)` says whether sample `i` differs from rest. The animation runs over some
 * interval [s, s + D). The first sample that moved is at or after `s`, and the one before it
 * at or before `s`; the last that moved is before `s + D`, and the one after it at or after.
 * So D is at most the time between the sample before the first movement and the sample after
 * the last -- `upper` -- and at least the time between the first and last movement, `lower`.
 * `upper` is what a limit is held to: it cannot come out under the truth.
 */
export const movement = (samples: Sample[], moving: (s: Sample) => boolean) => {
    const first = samples.findIndex(moving)
    let last = -1
    samples.forEach((s, i) => { if (moving(s)) last = i })
    if (first === -1) return { moved: false, lower: 0, upper: 0, gap: 0 }
    const b = Math.max(first - 1, 0)
    // A tracker that stopped while still moving has no "after", and no upper bound.
    if (last === samples.length - 1) {
        return { moved: true, lower: samples[last].t - samples[first].t, upper: Infinity, gap: Infinity }
    }
    const window = samples.slice(b, last + 2)
    const gap = Math.max(...window.slice(1).map((s, i) => s.t - window[i].t))
    return { moved: true, lower: samples[last].t - samples[first].t, upper: samples[last + 1].t - samples[b].t, gap }
}

/**
 * The longest a frame may take for a window of them to be timed.
 *
 * Two reasons, and the tighter one sets it. `motion` advances its animations by at most 40ms
 * a frame, so when the main thread is starved -- a busy machine, a dozen browsers at once --
 * an animation stretches in wall time rather than jumping ahead. Measured: a 150ms colour
 * change took 262-279ms of wall time with five test workers sharing the machine, and exactly
 * 150 alone. Under 40ms a frame, wall time *is* the animation's time. And `upper` exceeds
 * the true duration by at most the gap before the motion and the gap after it, so with gaps
 * of 25ms a 150ms motion bounds at 200 at worst -- a window that could not fail a motion
 * inside the limit. A window with a longer gap is measuring the machine, and is taken again.
 */
export const FRAME_CLAMP_MS = 25

/**
 * Run `attempt` until the frames it returns were delivered on time, at most `tries` times.
 * Returns that attempt's result; fails, saying so, if no attempt was clean.
 */
export const onTime = async <T extends { gap: number }>(attempt: () => Promise<T>, tries = 3): Promise<T> => {
    const gaps: number[] = []
    for (let n = 0; n < tries; n++) {
        const result = await attempt()
        if (result.gap <= FRAME_CLAMP_MS) return result
        gaps.push(result.gap)
    }
    throw new Error(`frames were never delivered on time: longest gaps ${gaps.map(g => g.toFixed(0)).join(', ')}ms`)
}
