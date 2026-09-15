// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useDayRollover, ROLLOVER_POLL_MS } from '@/app/hooks/useDayRollover'

/**
 * Midnight actually arrives (spec P1-7).
 *
 * The board is fetched in a mount effect and never again, so a tab left open overnight
 * serves yesterday's puzzle for as long as it stays open. For a daily game on a phone that
 * is the ordinary case: the tab is backgrounded, not closed.
 *
 * The refetch starts a microtask after the trigger -- the callback is invoked inside the
 * promise chain so that a synchronous throw becomes a rejection rather than escaping -- so
 * assertions about it are made after `flushPromises`, not immediately after the event.
 *
 * Time is moved by moving the *clock*, not by waiting. Every trigger here is checked against
 * a system time the test controls, because the thing being tested is whether the hook
 * notices a changed calendar date, and a test that waited for a real midnight would run once
 * a day.
 */

const Probe: React.FC<{ onRollover: () => void | Promise<void> }> = ({ onRollover }) => {
    useDayRollover(onRollover)
    return null
}

const setNow = (date: Date) => { vi.setSystemTime(date) }

/** jsdom has no way to background a tab, so `hidden` is defined over it. */
const setHidden = (hidden: boolean) => {
    Object.defineProperty(window.document, 'hidden', { value: hidden, configurable: true })
}

const fire = (target: EventTarget, type: string) => {
    act(() => { target.dispatchEvent(new Event(type)) })
}

/**
 * Let the rollover settle.
 *
 * The hook records a day as seen only once the refetch has *resolved*, so the bookkeeping is
 * a microtask behind the event that triggered it. Firing two day-changes back to back without
 * this asserts against a rollover that has not finished yet.
 */
const flushPromises = async () => { await act(async () => { await Promise.resolve() }) }

let rolled: ReturnType<typeof vi.fn>

beforeEach(() => {
    vi.useFakeTimers()
    setNow(new Date(2026, 8, 15, 23, 0))
    setHidden(false)
    rolled = vi.fn()
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

describe('the day change is noticed', () => {
    it('when a backgrounded tab is brought back the next morning', async () => {
        // The common case by a wide margin: the phone was locked overnight.
        render(<Probe onRollover={rolled} />)

        setHidden(true)
        fire(window.document, 'visibilitychange')
        setNow(new Date(2026, 8, 16, 8, 30))
        setHidden(false)
        fire(window.document, 'visibilitychange')
        await flushPromises()

        expect(rolled).toHaveBeenCalledTimes(1)
    })

    it('when a window that was never hidden regains focus', async () => {
        // Switching applications does not change visibility, so a tab on a second monitor
        // can sit visible across midnight.
        render(<Probe onRollover={rolled} />)

        setNow(new Date(2026, 8, 16, 0, 5))
        fire(window, 'focus')
        await flushPromises()

        expect(rolled).toHaveBeenCalledTimes(1)
    })

    it('while the tab simply sits there, open and visible', async () => {
        render(<Probe onRollover={rolled} />)

        setNow(new Date(2026, 8, 16, 0, 0, 30))
        act(() => { vi.advanceTimersByTime(ROLLOVER_POLL_MS) })
        await flushPromises()

        expect(rolled).toHaveBeenCalledTimes(1)
    })
})

describe('and not noticed when nothing has changed', () => {
    it('does not fire on mount', () => {
        // The board has just been fetched; refetching it immediately would be pure waste.
        render(<Probe onRollover={rolled} />)
        expect(rolled).not.toHaveBeenCalled()
    })

    it('does not fire when the tab is revealed on the same day', () => {
        render(<Probe onRollover={rolled} />)

        // Midday, deliberately: fake timers advance the system clock too, so polling five
        // minutes from 23:59 would cross midnight and the test would be asserting the
        // opposite of what it says.
        setNow(new Date(2026, 8, 15, 12, 0))
        fire(window.document, 'visibilitychange')
        fire(window, 'focus')
        act(() => { vi.advanceTimersByTime(ROLLOVER_POLL_MS * 5) })

        expect(rolled).not.toHaveBeenCalled()
    })

    it('does not fire while the tab is still hidden', () => {
        // Nothing is on screen to be stale, and the refetch would race the return.
        render(<Probe onRollover={rolled} />)

        setHidden(true)
        setNow(new Date(2026, 8, 16, 3, 0))
        fire(window.document, 'visibilitychange')

        expect(rolled).not.toHaveBeenCalled()
    })

    it('fires once for one midnight, however many triggers arrive', async () => {
        /*
         * Poll, reveal and focus all fire when someone picks their phone up in the morning.
         * Three refetches for one rollover would be three round trips and three chances to
         * replace the board under the player.
         */
        render(<Probe onRollover={rolled} />)

        setNow(new Date(2026, 8, 16, 7, 0))
        act(() => { vi.advanceTimersByTime(ROLLOVER_POLL_MS) })
        fire(window.document, 'visibilitychange')
        fire(window, 'focus')
        await flushPromises()

        expect(rolled).toHaveBeenCalledTimes(1)
    })

    it('fires again on the day after that', async () => {
        // Once per midnight, not once ever.
        render(<Probe onRollover={rolled} />)

        setNow(new Date(2026, 8, 16, 7, 0))
        fire(window, 'focus')
        await flushPromises()

        setNow(new Date(2026, 8, 17, 7, 0))
        fire(window, 'focus')
        await flushPromises()

        expect(rolled).toHaveBeenCalledTimes(2)
    })
})

describe('a rollover that fails is tried again', () => {
    /*
     * Midnight is exactly when a refetch is most likely to fail: the phone has been asleep,
     * the network is only just back. An earlier version recorded the new day *before* calling
     * back and the caller swallowed the rejection, so a failure was filed as success and every
     * later trigger saw the same day and did nothing -- the tab stayed on yesterday's puzzle
     * until it was closed.
     */
    it('retries on the next trigger after a rejected refetch', async () => {
        const failing = vi.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(undefined)
        render(<Probe onRollover={failing} />)

        setNow(new Date(2026, 8, 16, 7, 0))
        fire(window, 'focus')
        await flushPromises()
        expect(failing).toHaveBeenCalledTimes(1)

        // Same day still: the rollover has not happened yet, so this must try again.
        fire(window, 'focus')
        await flushPromises()

        expect(failing).toHaveBeenCalledTimes(2)
    })

    it('stops retrying once one succeeds', async () => {
        const succeeding = vi.fn().mockResolvedValue(undefined)
        render(<Probe onRollover={succeeding} />)

        setNow(new Date(2026, 8, 16, 7, 0))
        fire(window, 'focus')
        await flushPromises()

        fire(window, 'focus')
        fire(window.document, 'visibilitychange')
        await flushPromises()

        expect(succeeding).toHaveBeenCalledTimes(1)
    })

    it('does not start a second refetch while one is still in flight', async () => {
        // The refetch is slow enough that poll, reveal and focus can all land during it, and
        // one midnight should cost one request.
        let release: () => void = () => { }
        const slow = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
        render(<Probe onRollover={slow} />)

        setNow(new Date(2026, 8, 16, 7, 0))
        fire(window, 'focus')
        fire(window.document, 'visibilitychange')
        act(() => { vi.advanceTimersByTime(ROLLOVER_POLL_MS) })
        await flushPromises()

        expect(slow).toHaveBeenCalledTimes(1)

        release()
        await flushPromises()
        fire(window, 'focus')
        await flushPromises()
        expect(slow, 'and no catch-up burst once it lands').toHaveBeenCalledTimes(1)
    })

    it('a synchronous throw does not wedge rollover for the life of the tab', async () => {
        /*
         * The hook's signature permits a synchronous callback, so it must tolerate a
         * synchronous *throw*. Calling it as an argument to `Promise.resolve(...)` evaluates
         * it before any promise exists, so the exception escapes the chain entirely: `finally`
         * never runs, the in-flight flag stays raised, and no later trigger can ever start
         * another refetch.
         */
        const throwsOnce = vi.fn()
            .mockImplementationOnce(() => { throw new Error('boom') })
            .mockImplementationOnce(() => { })
        render(<Probe onRollover={throwsOnce} />)

        setNow(new Date(2026, 8, 16, 7, 0))
        expect(() => fire(window, 'focus')).not.toThrow()
        await flushPromises()
        expect(throwsOnce).toHaveBeenCalledTimes(1)

        fire(window, 'focus')
        await flushPromises()

        expect(throwsOnce, 'wedged after a synchronous throw').toHaveBeenCalledTimes(2)
    })

    it('a synchronous callback still counts as success', async () => {
        // The hook accepts `void` as well as a promise; a caller that does its work
        // synchronously must not be treated as never having finished.
        const sync = vi.fn(() => { })
        render(<Probe onRollover={sync} />)

        setNow(new Date(2026, 8, 16, 7, 0))
        fire(window, 'focus')
        await flushPromises()
        fire(window, 'focus')
        await flushPromises()

        expect(sync).toHaveBeenCalledTimes(1)
    })
})

describe('the clock is not assumed to behave', () => {
    it('notices a day that moved backwards, as a manual correction or a flight would', async () => {
        /*
         * Why the day is compared rather than a timer set for the next midnight: a timer
         * assumes the clock runs forward at one second per second, which is false across
         * sleep, a timezone change, and a corrected date. Asking "what day is it now" is
         * immune to all three, and a backwards jump is still a changed day.
         */
        render(<Probe onRollover={rolled} />)

        setNow(new Date(2026, 8, 14, 9, 0))
        fire(window, 'focus')
        await flushPromises()

        expect(rolled).toHaveBeenCalledTimes(1)
    })

    it('stops listening when unmounted', async () => {
        const view = render(<Probe onRollover={rolled} />)
        view.unmount()

        setNow(new Date(2026, 8, 16, 7, 0))
        fire(window, 'focus')
        act(() => { vi.advanceTimersByTime(ROLLOVER_POLL_MS * 3) })
        await flushPromises()

        expect(rolled).not.toHaveBeenCalled()
    })

    it('always calls the latest callback, not the one it mounted with', async () => {
        // The caller passes an inline closure over `loadBoards`; holding the first one would
        // refetch through a stale store reference.
        const first = vi.fn()
        const second = vi.fn()
        const view = render(<Probe onRollover={first} />)
        view.rerender(<Probe onRollover={second} />)

        setNow(new Date(2026, 8, 16, 7, 0))
        fire(window, 'focus')
        await flushPromises()

        expect(first).not.toHaveBeenCalled()
        expect(second).toHaveBeenCalledTimes(1)
    })
})
