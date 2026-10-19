import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Locator, Page } from '@playwright/test'
import { instrument, waitForReady } from '@/e2e/openBoard'
import { SOCKET_SNAPSHOT_PREFIX } from '@/e2e/socketSnapshot'

const mocks = vi.hoisted(() => ({ exec: vi.fn(), visible: vi.fn(), info: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: mocks.exec }))
vi.mock('@playwright/test', () => ({
    expect: () => ({ toBeVisible: mocks.visible }), test: { info: mocks.info },
}))

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
let warning: ReturnType<typeof vi.spyOn>
const snapshots = () => warning.mock.calls.map(call => String(call[0]))
    .filter(line => line.startsWith(SOCKET_SNAPSHOT_PREFIX))
    .map(line => JSON.parse(line.slice(SOCKET_SNAPSHOT_PREFIX.length)))
const info = () => ({
    project: { name: 'phone-360' }, titlePath: ['original test'], workerIndex: 3, retry: 0,
})

const harness = async (hydrated = false) => {
    const listeners = new Map<string, (event: unknown) => void>()
    const events: string[] = []
    const reload = vi.fn(async () => { events.push('reload') })
    const pause = vi.fn(async (ms: number) => {
        events.push('pause')
        await new Promise(resolve => setTimeout(resolve, ms))
        events.push('pause finished')
    })
    const page = {
        on: (name: string, listener: (event: unknown) => void) => { listeners.set(name, listener) },
        addInitScript: vi.fn(async () => {}), waitForTimeout: pause, reload,
        evaluate: vi.fn(async (fn: () => unknown) => fn.toString().includes('script[src]')
            ? '(no script tags)'
            : { hydrated, readyState: 'complete', sinceGoto: 15_000, body: 'no board', fetches: [], errors: [] }),
    } as unknown as Page
    await instrument(page)
    const request = (resourceType = 'script', url = 'http://127.0.0.1:3100/_next/static/chunks/game.js') => ({
        url: () => url, method: () => 'GET', resourceType: () => resourceType,
    })
    const fail = (error = 'net::ERR_NO_BUFFER_SPACE', resourceType?: string, url?: string) => {
        listeners.get('requestfailed')!({ ...request(resourceType, url), failure: () => ({ errorText: error }) })
    }
    const httpFailure = () => listeners.get('response')!({
        status: () => 500, url: () => 'http://127.0.0.1:3100/', request: () => request('document'),
    })
    return { page, pause, reload, events, fail, httpFailure }
}

const finishCapture = (error: Error | null = null) => mocks.exec.mock.calls[0][3](
    error, ' TCP 127.0.0.1:51000 127.0.0.1:3100 TIME_WAIT', 'STDERR_SENTINEL')
const locator = {} as Locator

beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    mocks.exec.mockReset()
    mocks.visible.mockReset().mockRejectedValueOnce(new Error('not visible')).mockResolvedValue(undefined)
    mocks.info.mockReset().mockImplementation(info)
    warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
    Object.defineProperty(process, 'platform', platform)
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('readiness retry and the real diagnostic task', () => {
    it('does no diagnostic work on a successful first load', async () => {
        mocks.visible.mockReset().mockResolvedValue(undefined)
        const h = await harness()
        await waitForReady(h.page, locator)
        expect(mocks.exec).not.toHaveBeenCalled()
        expect(mocks.info).not.toHaveBeenCalled()
        expect(h.pause).not.toHaveBeenCalled()
        expect(h.reload).not.toHaveBeenCalled()
        expect(warning).not.toHaveBeenCalled()
    })

    it('reloads after its original pause while capture is held, then logs the original identity', async () => {
        const h = await harness()
        h.fail()
        h.fail('net::ERR_NO_BUFFER_SPACE', 'document', 'http://127.0.0.1:3100/')
        let ready = false
        const task = waitForReady(h.page, locator, 'Board', 4321).then(() => { ready = true })
        await vi.advanceTimersByTimeAsync(0)
        expect(mocks.exec, 'eligible diagnosis starts exactly one capture').toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(999)
        expect(h.reload).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(h.reload, 'reload never waits for the held capture').toHaveBeenCalledTimes(1)
        expect(h.pause).toHaveBeenCalledExactlyOnceWith(1000)
        expect(ready, 'readiness does not await the held capture').toBe(true)
        await task
        expect(h.events).toEqual(['pause', 'pause finished', 'reload'])
        expect(mocks.visible.mock.calls).toEqual([[{ timeout: 4321 }], [{ timeout: 4321 }]])
        expect(snapshots()).toEqual([])
        mocks.info.mockReturnValue({ ...info(), titlePath: ['later test'], retry: 1 })
        await vi.advanceTimersByTimeAsync(400)
        finishCapture()
        await vi.advanceTimersByTimeAsync(0)
        expect(snapshots()).toHaveLength(1)
        expect(snapshots()[0], 'late snapshot retains original diagnosis identity').toMatchObject({
            status: 'success', requestFailureToCaptureMs: 'unknown', counts: { testTimeWait: 1 },
            identity: { project: 'phone-360', titlePath: ['original test'], workerIndex: 3,
                testRetry: 0, loadAttemptAtDiagnosis: 0 },
        })
        expect(mocks.info).toHaveBeenCalledTimes(1)
        expect(mocks.exec).toHaveBeenCalledTimes(1)
    })

    it.each(['net::ERR_INSUFFICIENT_RESOURCES', 'net::ERR_NETWORK_CHANGED'])(
        'retries %s without a socket snapshot', async code => {
            const h = await harness()
            h.fail(code)
            const task = waitForReady(h.page, locator)
            await vi.advanceTimersByTimeAsync(1000)
            await task
            expect(h.reload).toHaveBeenCalledTimes(1)
            expect(mocks.exec, 'other transient retries never capture sockets').not.toHaveBeenCalled()
            expect(mocks.info).not.toHaveBeenCalled()
            expect(snapshots()).toEqual([])
        })

    it.each(['hydrated', 'http', 'noncritical', 'other transport', 'no failure'])(
        'a %s refusal never starts capture or reload', async refusal => {
            const h = await harness(refusal === 'hydrated')
            if (refusal === 'http') h.httpFailure()
            else if (refusal === 'noncritical') h.fail('net::ERR_NO_BUFFER_SPACE', 'media', 'http://127.0.0.1:3100/click.mp3')
            else if (refusal === 'other transport') h.fail('net::ERR_CONNECTION_REFUSED')
            else if (refusal !== 'no failure') h.fail()
            const error = await waitForReady(h.page, locator).catch(caught => caught as Error)
            expect(error).toBeInstanceOf(Error)
            expect(mocks.exec).not.toHaveBeenCalled()
            expect(h.pause).not.toHaveBeenCalled()
            expect(h.reload).not.toHaveBeenCalled()
        })

    it('a capture error reports its status and leaves the reload intact', async () => {
        const h = await harness()
        h.fail()
        const task = waitForReady(h.page, locator)
        await vi.advanceTimersByTimeAsync(0)
        finishCapture(Object.assign(new Error('NATIVE_ERROR_SENTINEL'), { code: 5 }))
        await vi.advanceTimersByTimeAsync(1000)
        await task
        expect(h.reload).toHaveBeenCalledTimes(1)
        expect(snapshots()).toHaveLength(1)
        expect(snapshots()[0].status).toBe('command-error')
        expect(snapshots()[0]).not.toHaveProperty('counts')
    })

    it('a second failed load reports attempt 1 without starting a second capture', async () => {
        mocks.visible.mockReset().mockRejectedValue(new Error('not visible'))
        const h = await harness()
        h.fail()
        h.reload.mockImplementation(async () => { h.fail() })
        const failure = waitForReady(h.page, locator).catch(error => error as Error)
        await vi.advanceTimersByTimeAsync(1000)
        const error = await failure
        expect(error).toBeInstanceOf(Error)
        expect(String(error)).toContain('after one reload')
        expect(String(error)).toContain('[attempt 1] FAILED')
        expect(h.reload).toHaveBeenCalledTimes(1)
        expect(h.pause).toHaveBeenCalledTimes(1)
        expect(mocks.exec).toHaveBeenCalledTimes(1)
        finishCapture()
        await vi.advanceTimersByTimeAsync(0)
        expect(snapshots()).toHaveLength(1)
        expect(snapshots()[0].identity.loadAttemptAtDiagnosis).toBe(0)
    })
})
