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
})
