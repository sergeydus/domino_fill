import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { performance } from 'node:perf_hooks'
import { logSocketSnapshot, SOCKET_SNAPSHOT_PREFIX, tcpCounts } from '@/e2e/socketSnapshot'

const child = vi.hoisted(() => ({ exec: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: child.exec }))

const identity = {
    project: 'phone-360', titlePath: ['original case'], workerIndex: 2,
    testRetry: 0, loadAttemptAtDiagnosis: 0,
}
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
let warning: ReturnType<typeof vi.spyOn>
const record = () => JSON.parse(String(warning.mock.calls[0][0]).slice(SOCKET_SNAPSHOT_PREFIX.length))
const settle = (error: Error | null = null, raw = ' TCP 127.0.0.1:3100 127.0.0.1:51000 TIME_WAIT') => {
    child.exec.mock.calls[0][3](error, raw, 'NATIVE_STDERR_SENTINEL 198.51.100.88')
}

beforeEach(() => {
    child.exec.mockReset()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
    Object.defineProperty(process, 'platform', platform)
    vi.restoreAllMocks()
    vi.useRealTimers()
})

describe('TCP aggregates', () => {
    it.each([
        '127.0.0.1:3100', '[::1]:3100', '[0:0:0:0:0:0:0:1]:3100',
        '[::1%1]:3100', '[::ffff:127.0.0.1]:3100', '[::ffff:7f00:1]:3100',
        '[0:0:0:0:0:ffff:7f02:1234]:3100',
    ])('recognizes the local test endpoint %s', address => {
        expect(tcpCounts(` TCP ${address} 127.0.0.1:51000 TIME_WAIT`),
            'loopback identity contributes to test TIME_WAIT').toMatchObject({
            allTCP: 1, totalTimeWait: 1, testTCP: 1, testTimeWait: 1, nonTestTimeWait: 0,
        })
    })

    it('uses either endpoint and counts a row matching both once', () => {
        const counts = tcpCounts([
            ' TCP 127.0.0.1:3100 127.0.0.1:51000 ESTABLISHED',
            ' TCP 127.0.0.1:51000 127.0.0.1:3100 ESTABLISHED',
            ' TCP [::1]:3101 [::1]:51000 TIME_WAIT',
            ' TCP 127.0.0.1:3100 127.0.0.1:3101 TIME_WAIT',
            ' TCP 192.0.2.10:51000 198.51.100.1:443 TIME_WAIT',
            ' TCP 192.0.2.10:51001 198.51.100.1:443 ESTABLISHED',
            ' TCP 0.0.0.0:3100 0.0.0.0:0 LISTENING',
            ' UDP 127.0.0.1:3100 *:*',
        ].join('\r\n'))
        expect(counts, 'aggregate fixture counts rows and states once').toEqual({
            allTCP: 7, totalEstablished: 3, totalTimeWait: 3,
            testTCP: 4, testEstablished: 2, testTimeWait: 2,
            nonTestTCP: 3, nonTestEstablished: 1, nonTestTimeWait: 1,
        })
    })

    it.each(['198.51.100.1:3100', '127.0.0.1:13100', '[::2]:3100', '[::ffff:8000:1]:3100'])(
        'excludes a non-test endpoint %s', address => {
            expect(tcpCounts(` TCP ${address} 198.51.100.1:443 TIME_WAIT`).testTimeWait,
                'non-test endpoint stays outside test totals').toBe(0)
        })

    it.each([
        ' TCP 127.0.0.1:3100 broken TIME_WAIT',
        ' TCP 127.0.0.1:3100 127.0.0.1:51000 TIME_WAIT extra',
        ' TCP 127.0.0.1:99999 127.0.0.1:51000 TIME_WAIT',
        ' TCP [broken]:3100 127.0.0.1:51000 TIME_WAIT',
        ' TCP 127.0.0.1:3100 127.0.0.1:51000 bad-state',
    ])('rejects malformed TCP rows: %s', row => {
        expect(() => tcpCounts(row)).toThrow(/Malformed TCP/)
    })
})

describe('one settlement record', () => {
    it('starts one hidden bounded command and measures diagnosis/capture timing', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-10-18T10:00:00Z'))
        vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(15).mockReturnValueOnce(45)
        const task = logSocketSnapshot(() => identity)
        expect(child.exec, 'one hidden command has the five-second deadline').toHaveBeenCalledExactlyOnceWith('netstat', ['-an'], {
            encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024,
        }, expect.any(Function))
        expect(warning).not.toHaveBeenCalled()
        settle()
        await task
        expect(warning, 'one settlement line per diagnosis').toHaveBeenCalledTimes(1)
        expect(record()).toMatchObject({
            diagnosis: 'socket-exhaustion', platform: 'win32', identity,
            diagnosedAtUtc: '2026-10-18T10:00:00.000Z', diagnosisToCaptureMs: 5,
            captureDurationMs: 30, requestFailureToCaptureMs: 'unknown', status: 'success',
            counts: { testTimeWait: 1 },
        })
        expect(String(warning.mock.calls[0][0]), 'raw endpoint never reaches the record').not.toContain('127.0.0.1')
        expect(String(warning.mock.calls[0][0]), 'native stderr never reaches the record').not.toContain('NATIVE_STDERR_SENTINEL')
    })

    it.each([
        [{ code: 'ENOENT' }, 'unavailable'],
        [{ code: 5 }, 'command-error'],
        [{ killed: true }, 'timeout'],
        [{ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', killed: true }, 'output-limit'],
    ] as const)('reports a failed command without native output: %j', async (fields, status) => {
        const task = logSocketSnapshot(() => identity)
        settle(Object.assign(new Error('NATIVE_ERROR_SENTINEL 198.51.100.88'), fields))
        await expect(task).resolves.toBeUndefined()
        expect(warning).toHaveBeenCalledTimes(1)
        expect(record().status, 'command failure has a status rather than counts').toBe(status)
        expect(record()).not.toHaveProperty('counts')
        expect(String(warning.mock.calls[0][0]), 'native failure payload stays private')
            .not.toMatch(/SENTINEL|198\.51\.100\.88|127\.0\.0\.1/)
    })

    it('contains a synchronous spawn failure', async () => {
        child.exec.mockImplementation(() => { throw new Error('SPAWN_SENTINEL') })
        await expect(logSocketSnapshot(() => identity), 'spawn failures settle without rejecting').resolves.toBeUndefined()
        expect(record().status).toBe('spawn-error')
        expect(record()).not.toHaveProperty('counts')
        expect(String(warning.mock.calls[0][0])).not.toContain('SPAWN_SENTINEL')
    })

    it('reports a malformed row without exposing it or fabricating zero counts', async () => {
        const task = logSocketSnapshot(() => identity)
        settle(null, ' TCP 198.51.100.88:3100 PARSE_SENTINEL TIME_WAIT')
        await task
        expect(record().status, 'malformed output is not a zero-count success').toBe('parse-error')
        expect(record()).not.toHaveProperty('counts')
        expect(String(warning.mock.calls[0][0])).not.toMatch(/PARSE_SENTINEL|198\.51\.100\.88/)
    })

    it('reports unsupported platforms without a command', async () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
        const task = logSocketSnapshot(() => identity)
        expect(child.exec, 'unsupported platform never starts Windows command').not.toHaveBeenCalled()
        await task
        expect(record()).toMatchObject({ status: 'unsupported-platform', diagnosisToCaptureMs: null, captureDurationMs: null })
        expect(record()).not.toHaveProperty('counts')
    })

    it('records unknown context and still collects', async () => {
        const task = logSocketSnapshot(() => { throw new Error('CONTEXT_SENTINEL') })
        const settled = task.catch(() => {})
        expect(child.exec, 'unknown context still starts the snapshot').toHaveBeenCalledTimes(1)
        settle()
        await settled
        expect(record()).toMatchObject({ identity: 'unknown', status: 'success' })
        expect(String(warning.mock.calls[0][0])).not.toContain('CONTEXT_SENTINEL')
    })

    it('copies the title array before it can change', async () => {
        const current = { ...identity, titlePath: ['original'] }
        const task = logSocketSnapshot(() => current)
        current.titlePath[0] = 'later'
        current.loadAttemptAtDiagnosis = 1
        settle()
        await task
        expect(record().identity, 'copied identity survives caller changes')
            .toMatchObject({ titlePath: ['original'], loadAttemptAtDiagnosis: 0 })
    })

    it('contains a failed diagnostic sink without a task rejection', async () => {
        warning.mockImplementation(() => { throw new Error('sink closed') })
        const task = logSocketSnapshot(() => identity)
        settle()
        await expect(task).resolves.toBeUndefined()
        expect(warning).toHaveBeenCalledTimes(1)
    })
})
