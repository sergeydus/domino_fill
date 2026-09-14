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
})

afterAll(() => {
    if (hasMediaElement() && originalPlay) HTMLMediaElement.prototype.play = originalPlay
    if (hasElement() && !hadScrollIntoView) {
        delete (Element.prototype as Partial<Element>).scrollIntoView
    }
})
