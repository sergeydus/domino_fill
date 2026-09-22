import { describe, it, expect } from 'vitest'
import {
    shouldRetryStartup, isCriticalRequest, type NetworkFailure, type ResourceType,
} from '@/e2e/startupRetry'

/**
 * The harness's one automatic retry, pinned.
 *
 * This rule guards a condition that cannot be summoned on demand: socket exhaustion showed
 * up roughly once in twelve full E2E runs, and the run that caught it is evidence the
 * mechanism is real, not a regression test for the code that handles it. An incidental
 * event cannot check that an *unrelated* failure is refused a retry, or that only one
 * reload is ever taken. So the decision is a pure function and the cases are enumerated
 * here.
 *
 * What matters most is the refusals. A retry rule that is looser than the sentence it
 * prints will eventually retry past a real defect and blame the network.
 */

const chunk = 'http://127.0.0.1:3100/_next/static/chunks/18a5a133fb68ca26.js'
const document_ = 'http://127.0.0.1:3100/'

const failed = (
    url: string,
    error: string,
    resourceType: ResourceType = 'script',
    method = 'GET',
    attempt = 0,
): NetworkFailure => ({ kind: 'failed', url, method, resourceType, error, attempt })

const chunkFailure = (error: string, attempt = 0) => failed(chunk, error, 'script', 'GET', attempt)

const decide = (failures: NetworkFailure[], hydrated = false, reloadsUsed = 0) =>
    shouldRetryStartup({ failures, hydrated, reloadsUsed })

describe('which requests can stop the page booting', () => {
    it('counts the navigation and the JS chunks', () => {
        expect(isCriticalRequest({ url: document_, resourceType: 'document' })).toBe(true)
        expect(isCriticalRequest({ url: chunk, resourceType: 'script' })).toBe(true)
        expect(isCriticalRequest({
            url: 'http://127.0.0.1:3100/', resourceType: 'document',
        })).toBe(true)
    })

    it('does not count assets the page can boot without', () => {
        const cases: [string, ResourceType][] = [
            ['http://127.0.0.1:3100/sounds/click.mp3', 'media'],
            ['http://127.0.0.1:3100/pieces/one.png', 'image'],
            ['http://127.0.0.1:3100/_next/static/css/app.css', 'stylesheet'],
            ['http://127.0.0.1:3100/favicon.ico', 'other'],
        ]
        for (const [url, resourceType] of cases) {
            expect(isCriticalRequest({ url, resourceType }), url).toBe(false)
        }
    })

    it('does not mistake a Server Action POST for the document', () => {
        // The app's board arrives via a `"use server"` action posted to `/`, so its URL is
        // indistinguishable from the page's. Only `resourceType` separates them, which is
        // why it is recorded rather than guessed from the path.
        expect(isCriticalRequest({ url: document_, resourceType: 'fetch' })).toBe(false)
    })

    it('does not mistake an extensionless API path for the document', () => {
        for (const resourceType of ['fetch', 'xhr'] as ResourceType[]) {
            expect(isCriticalRequest({
                url: 'http://127.0.0.1:3100/api/boards/today', resourceType,
            }), resourceType).toBe(false)
        }
    })

    it('does not count a script outside the chunk directory', () => {
        expect(isCriticalRequest({
            url: 'http://127.0.0.1:3100/analytics/tracker.js', resourceType: 'script',
        })).toBe(false)
    })
})

describe('the measured case retries', () => {
    it('a chunk lost to ERR_NO_BUFFER_SPACE', () => {
        const d = decide([chunkFailure('net::ERR_NO_BUFFER_SPACE')])
        expect(d.retry).toBe(true)
        expect(d.diagnosis).toBe('socket-exhaustion')
        expect(d.reason).toContain('ERR_NO_BUFFER_SPACE')
    })

    it('the document lost the same way', () => {
        expect(decide([failed(document_, 'net::ERR_NO_BUFFER_SPACE', 'document')]).retry).toBe(true)
    })
})

describe('broader transport errors retry without claiming a cause', () => {
    for (const code of ['net::ERR_INSUFFICIENT_RESOURCES', 'net::ERR_NETWORK_CHANGED']) {
        it(`${code} is retried but not diagnosed`, () => {
            const d = decide([chunkFailure(code)])
            expect(d.retry).toBe(true)
            // The whole point of the distinction: only the measured code gets the
            // socket-exhaustion story attached to it.
            expect(d.diagnosis).toBeNull()
            expect(d.reason).toContain('not established')
            expect(d.reason).not.toContain('TIME_WAIT')
        })
    }
})

describe('refusals', () => {
    it('an unrelated asset failure does not authorise a retry', () => {
        // Even with the exact measured error code: a sound file cannot stop hydration, so
        // a page that did not boot did not fail to boot because of this.
        const d = decide([failed(
            'http://127.0.0.1:3100/sounds/click.mp3', 'net::ERR_NO_BUFFER_SPACE', 'media')])
        expect(d.retry).toBe(false)
        expect(d.reason).toContain('no critical request failed')
    })

    it('an HTTP error is the app or the server answering, not a lost request', () => {
        const d = decide([{
            kind: 'http', url: document_, method: 'GET', resourceType: 'document',
            status: 500, attempt: 0,
        }])
        expect(d.retry).toBe(false)
    })

    it('a critical request lost to some other transport error is reported, not retried', () => {
        const d = decide([chunkFailure('net::ERR_CONNECTION_REFUSED')])
        expect(d.retry).toBe(false)
        expect(d.reason).toContain('not with a retryable error')
    })

    it('nothing failing at all is never a retry', () => {
        const d = decide([])
        expect(d.retry).toBe(false)
    })

    it('a hydrated page is the app\'s problem, whatever else failed', () => {
        // If React took control, the bundle arrived. A board missing after that is a real
        // defect and must not be re-rolled.
        const d = decide([chunkFailure('net::ERR_NO_BUFFER_SPACE')], true)
        expect(d.retry).toBe(false)
        expect(d.reason).toContain('hydrated')
    })

    it('only one reload is ever taken', () => {
        const failures = [chunkFailure('net::ERR_NO_BUFFER_SPACE')]
        expect(decide(failures, false, 0).retry).toBe(true)
        expect(decide(failures, false, 1).retry).toBe(false)
        expect(decide(failures, false, 2).retry).toBe(false)
    })
})

describe('the attempt marker', () => {
    it('does not change the decision, because a decision is only taken on the first load', () => {
        // Recorded for the report, not for the rule. Stated as a test because the first
        // version of this module filtered on it and a mutation removing that filter passed
        // everything -- the `reloadsUsed` guard returns before the filter can ever matter.
        const first = shouldRetryStartup({
            failures: [chunkFailure('net::ERR_NO_BUFFER_SPACE', 0)], hydrated: false, reloadsUsed: 0,
        })
        const tagged = shouldRetryStartup({
            failures: [chunkFailure('net::ERR_NO_BUFFER_SPACE', 7)], hydrated: false, reloadsUsed: 0,
        })
        expect(tagged).toEqual(first)
    })

    it('a second failure after the reload is reported, never retried again', () => {
        const d = shouldRetryStartup({
            failures: [
                chunkFailure('net::ERR_NO_BUFFER_SPACE', 0),
                chunkFailure('net::ERR_NO_BUFFER_SPACE', 1),
            ],
            hydrated: false,
            reloadsUsed: 1,
        })
        expect(d.retry).toBe(false)
        expect(d.reason).toContain('already used')
    })
})

describe('the reason is always reportable', () => {
    it('every outcome explains itself, including the refusals', () => {
        const cases = [
            decide([]),
            decide([chunkFailure('net::ERR_NO_BUFFER_SPACE')]),
            decide([chunkFailure('net::ERR_NO_BUFFER_SPACE')], true),
            decide([chunkFailure('net::ERR_NO_BUFFER_SPACE')], false, 1),
            decide([failed('http://127.0.0.1:3100/a.png', 'net::ERR_NO_BUFFER_SPACE', 'image')]),
        ]
        for (const c of cases) expect(c.reason.length).toBeGreaterThan(10)
    })
})
