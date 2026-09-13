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
 * Registered for every file, including the `node`-environment ones, so the guard below is
 * what keeps it from throwing where there is no DOM at all.
 */

const hasMediaElement = () => typeof HTMLMediaElement !== 'undefined'

let original: (() => Promise<void>) | undefined

beforeAll(() => {
    if (!hasMediaElement()) return
    original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function play() { return Promise.resolve() }
})

afterAll(() => {
    if (!hasMediaElement() || !original) return
    HTMLMediaElement.prototype.play = original
})
