import { beforeAll, afterAll } from 'vitest'

/**
 * Shared test setup.
 *
 * jsdom implements no media playback, so anything that reaches `audio.play()` prints
 * "Not implemented: HTMLMediaElement's play() method" to stderr. `BoardSquare` plays a
 * sound on every click, so the click tests started emitting it.
 *
 * Stubbed here rather than worked around in production code: the sound firing on every
 * click -- including rejected placements -- is a real defect (spec D10-f), but it is
 * P1-5's to fix, and changing behaviour to quiet a test environment would be the wrong
 * reason to touch it. The original is restored afterwards so nothing leaks between runs.
 *
 * jsdom also implements no layout, so `Element.prototype.scrollIntoView` does not exist at
 * all -- calling it throws rather than merely printing. `CompletionCard` scrolls itself into
 * view on mount, which is load-bearing on a phone (measured: without it the card's buttons
 * sit below the fold at 360x640), so the production call stays and the test environment
 * grows the method it is missing.
 *
 * Registered for every file, including the `node`-environment ones, so the guards below are
 * what keep this from throwing where there is no DOM at all.
 */

const hasMediaElement = () => typeof HTMLMediaElement !== 'undefined'
const hasElement = () => typeof Element !== 'undefined'

/**
 * A working `localStorage`, because this Node does not have one and shadows jsdom's.
 *
 * Probed on Node 25: `window.localStorage` is Node's own global (it warns about
 * `--localstorage-file` on startup), `window.localStorage === globalThis.localStorage`, and
 * **every method is undefined** -- `getItem`, `setItem`, `clear`, `length`, all of them.
 * jsdom's implementation is there but unreachable behind it.
 *
 * This is the same hazard `app/hooks/useLocalStorage.ts` records, and the reason production
 * feature-checks the *method* rather than the object. Production is therefore correct as it
 * stands and is not touched here: what is stubbed is the broken environment, which is where
 * a test-environment problem belongs.
 *
 * Installed **unconditionally, without reading the existing value**. That is not laziness
 * about detecting the broken case: merely *touching* Node's `localStorage` getter is what
 * makes it emit `Warning: --localstorage-file was provided without a valid path` on stderr,
 * once per worker. A probe to decide whether a stub is needed therefore costs the very
 * silence it was checking for -- measured at 1798 bytes of stderr across the suite, where
 * the standing requirement is zero. `defineProperty` never invokes the getter.
 */

const inMemoryStorage = (): Storage => {
    const entries = new Map<string, string>()
    return {
        get length() { return entries.size },
        key: (index: number) => [...entries.keys()][index] ?? null,
        getItem: (key: string) => entries.get(String(key)) ?? null,
        setItem: (key: string, value: string) => { entries.set(String(key), String(value)) },
        removeItem: (key: string) => { entries.delete(String(key)) },
        clear: () => { entries.clear() },
    } as Storage
}

let hadStorage = true

let originalPlay: (() => Promise<void>) | undefined
/** Undefined is the *expected* prior value: jsdom has no such method to save. */
let hadScrollIntoView = false

beforeAll(() => {
    if (hasMediaElement()) {
        originalPlay = HTMLMediaElement.prototype.play
        HTMLMediaElement.prototype.play = function play() { return Promise.resolve() }
    }
    if (hasElement() && typeof Element.prototype.scrollIntoView !== 'function') {
        hadScrollIntoView = false
        Element.prototype.scrollIntoView = function scrollIntoView() { /* no layout to scroll */ }
    } else if (hasElement()) {
        hadScrollIntoView = true
    }
    if (typeof window !== 'undefined') {
        hadStorage = false
        Object.defineProperty(window, 'localStorage', {
            value: inMemoryStorage(), configurable: true, writable: true,
        })
    }
})

afterAll(() => {
    if (hasMediaElement() && originalPlay) HTMLMediaElement.prototype.play = originalPlay
    if (hasElement() && !hadScrollIntoView) {
        delete (Element.prototype as Partial<Element>).scrollIntoView
    }
    if (!hadStorage) delete (window as Partial<Window & typeof globalThis>).localStorage
})
