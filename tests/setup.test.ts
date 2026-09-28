// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'

/**
 * The unit run is expected to produce no stderr at all, which is only true while the media
 * stub in tests/setup.ts is registered. Without this, dropping `setupFiles` from the
 * config would leave the suite green and quietly reintroduce the noise -- visible only to
 * whoever happens to be reading stderr that day.
 */
describe('test setup', () => {
    it('stubs media playback, so jsdom never prints "Not implemented"', async () => {
        const audio = new Audio('snap.mp3')
        await expect(audio.play()).resolves.toBeUndefined()
    })

    it('supplies scrollIntoView, which jsdom does not implement at all', () => {
        // Not merely noisy like `play()` -- absent, so calling it throws. `CompletionCard`
        // calls it on mount for a measured reason, so the environment gains the method
        // rather than the component losing the call.
        const el = document.createElement('div')
        expect(typeof el.scrollIntoView).toBe('function')
        expect(() => el.scrollIntoView({ block: 'nearest' })).not.toThrow()
    })

    it('supplies a working localStorage, which this Node actively breaks', () => {
        /*
         * Node 25 defines its own `localStorage` global that shadows jsdom's and has no
         * methods at all -- probed: `getItem`, `setItem`, `clear` and `length` are every one
         * of them undefined. Persistence would silently do nothing, and the tests for it
         * would pass by never storing anything.
         */
        expect(typeof window.localStorage.setItem).toBe('function')

        window.localStorage.setItem('probe', 'value')
        expect(window.localStorage.getItem('probe')).toBe('value')
        expect(window.localStorage.length).toBe(1)

        window.localStorage.removeItem('probe')
        expect(window.localStorage.getItem('probe')).toBeNull()

        window.localStorage.setItem('probe', 'again')
        window.localStorage.clear()
        expect(window.localStorage.length).toBe(0)
    })
})
