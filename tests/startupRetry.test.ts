import { describe, it, expect } from 'vitest'
import { shouldRetryStartup, isCriticalRequest, type NetworkFailure } from '@/e2e/startupRetry'

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

const failed = (url: string, error: string): NetworkFailure =>
    ({ kind: 'failed', url, method: 'GET', error })

const decide = (failures: NetworkFailure[], hydrated = false, reloadsUsed = 0) =>
    shouldRetryStartup({ failures, hydrated, reloadsUsed })

describe('which requests can stop the page booting', () => {
    it('counts the JS chunks and the document', () => {
        expect(isCriticalRequest(chunk)).toBe(true)
        expect(isCriticalRequest(document_)).toBe(true)
        expect(isCriticalRequest('http://127.0.0.1:3100/dominoFill')).toBe(true)
    })

    it('does not count assets the page can boot without', () => {
        for (const url of [
            'http://127.0.0.1:3100/sounds/click.mp3',
            'http://127.0.0.1:3100/pieces/one.png',
            'http://127.0.0.1:3100/_next/static/css/app.css',
            'http://127.0.0.1:3100/favicon.ico',
        ]) {
            expect(isCriticalRequest(url), url).toBe(false)
        }
    })
})

describe('the measured case retries', () => {
    it('a chunk lost to ERR_NO_BUFFER_SPACE', () => {
        const d = decide([failed(chunk, 'net::ERR_NO_BUFFER_SPACE')])
        expect(d.retry).toBe(true)
        expect(d.diagnosis).toBe('socket-exhaustion')
        expect(d.reason).toContain('ERR_NO_BUFFER_SPACE')
    })

    it('the document lost the same way', () => {
        expect(decide([failed(document_, 'net::ERR_NO_BUFFER_SPACE')]).retry).toBe(true)
    })
})

describe('broader transport errors retry without claiming a cause', () => {
    for (const code of ['net::ERR_INSUFFICIENT_RESOURCES', 'net::ERR_NETWORK_CHANGED']) {
        it(`${code} is retried but not diagnosed`, () => {
            const d = decide([failed(chunk, code)])
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
        const d = decide([failed('http://127.0.0.1:3100/sounds/click.mp3', 'net::ERR_NO_BUFFER_SPACE')])
        expect(d.retry).toBe(false)
        expect(d.reason).toContain('no critical request failed')
    })

    it('an HTTP error is the app or the server answering, not a lost request', () => {
        const d = decide([{ kind: 'http', url: document_, method: 'GET', status: 500 }])
        expect(d.retry).toBe(false)
    })

    it('a critical request lost to some other transport error is reported, not retried', () => {
        const d = decide([failed(chunk, 'net::ERR_CONNECTION_REFUSED')])
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
        const d = decide([failed(chunk, 'net::ERR_NO_BUFFER_SPACE')], true)
        expect(d.retry).toBe(false)
        expect(d.reason).toContain('hydrated')
    })

    it('only one reload is ever taken', () => {
        const failures = [failed(chunk, 'net::ERR_NO_BUFFER_SPACE')]
        expect(decide(failures, false, 0).retry).toBe(true)
        expect(decide(failures, false, 1).retry).toBe(false)
        expect(decide(failures, false, 2).retry).toBe(false)
    })
})

describe('the reason is always reportable', () => {
    it('every outcome explains itself, including the refusals', () => {
        const cases = [
            decide([]),
            decide([failed(chunk, 'net::ERR_NO_BUFFER_SPACE')]),
            decide([failed(chunk, 'net::ERR_NO_BUFFER_SPACE')], true),
            decide([failed(chunk, 'net::ERR_NO_BUFFER_SPACE')], false, 1),
            decide([failed('http://127.0.0.1:3100/a.png', 'net::ERR_NO_BUFFER_SPACE')]),
        ]
        for (const c of cases) expect(c.reason.length).toBeGreaterThan(10)
    })
})
