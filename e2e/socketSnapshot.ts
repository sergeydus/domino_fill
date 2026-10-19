import { execFile } from 'node:child_process'
import { isIP } from 'node:net'
import { performance } from 'node:perf_hooks'

export const SOCKET_SNAPSHOT_PREFIX = '[e2e socket snapshot] '

export type SocketIdentity = {
    project: string
    titlePath: readonly string[]
    workerIndex: number
    testRetry: number
    loadAttemptAtDiagnosis: number | 'unknown'
}

const endpoint = (value: string) => {
    const match = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(value)
    if (!match) throw new Error('Malformed TCP endpoint')
    const address = (match[1] ?? match[2]).replace(/%[^%]+$/, '').toLowerCase()
    const port = Number(match[3])
    const version = isIP(address)
    if (!version || port > 65535) throw new Error('Malformed TCP endpoint')
    const normalized = version === 6
        ? new URL(`http://[${address}]`).hostname.slice(1, -1) : address
    return { address: normalized, port }
}

const testEndpoint = (value: string) => {
    const { address, port } = endpoint(value)
    const loopback = /^127\./.test(address) || address === '::1'
        || /^::ffff:7f[\da-f]{2}:[\da-f]{1,4}$/.test(address)
    return loopback && (port === 3100 || port === 3101)
}

/** Only aggregate counts escape this parser, including on a parse failure. */
export const tcpCounts = (raw: string) => {
    const counts = {
        allTCP: 0, totalEstablished: 0, totalTimeWait: 0,
        testTCP: 0, testEstablished: 0, testTimeWait: 0,
    }
    for (const line of raw.split(/\r?\n/)) {
        if (!/^\s*TCP(?:\s|$)/.test(line)) continue
        const fields = line.trim().split(/\s+/)
        if (fields.length !== 4 || !/^[A-Z][A-Z_0-9]*$/.test(fields[3])) {
            throw new Error('Malformed TCP row')
        }
        endpoint(fields[1])
        endpoint(fields[2])
        const test = testEndpoint(fields[1]) || testEndpoint(fields[2])
        counts.allTCP++
        if (test) counts.testTCP++
        if (fields[3] === 'ESTABLISHED') {
            counts.totalEstablished++
            if (test) counts.testEstablished++
        }
        if (fields[3] === 'TIME_WAIT') {
            counts.totalTimeWait++
            if (test) counts.testTimeWait++
        }
    }
    return {
        ...counts,
        nonTestTCP: counts.allTCP - counts.testTCP,
        nonTestEstablished: counts.totalEstablished - counts.testEstablished,
        nonTestTimeWait: counts.totalTimeWait - counts.testTimeWait,
    }
}

type Outcome = { status: 'success', counts: ReturnType<typeof tcpCounts> } | {
    status: 'unsupported-platform' | 'unavailable' | 'output-limit' | 'timeout' |
    'command-error' | 'spawn-error' | 'parse-error'
}

const collect = (platform: string): Promise<Outcome> => {
    if (platform !== 'win32') return Promise.resolve({ status: 'unsupported-platform' })
    return new Promise(resolve => {
        try {
            execFile('netstat', ['-an'], {
                encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024,
            }, (error, stdout) => {
                if (error) {
                    const status = error.code === 'ENOENT' ? 'unavailable'
                        : error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'output-limit'
                            : error.killed ? 'timeout' : 'command-error'
                    resolve({ status })
                    return
                }
                try { resolve({ status: 'success', counts: tcpCounts(stdout) }) }
                catch { resolve({ status: 'parse-error' }) }
            })
        } catch { resolve({ status: 'spawn-error' }) }
    })
}

/** Fire and forget: no teardown wait; worker termination may lose the settlement line. */
export const logSocketSnapshot = async (getIdentity: () => SocketIdentity): Promise<void> => {
    const diagnosedAtUtc = new Date().toISOString()
    const diagnosedMs = performance.now()
    let identity: SocketIdentity | 'unknown'
    try {
        const current = getIdentity()
        identity = {
            project: current.project, titlePath: [...current.titlePath], workerIndex: current.workerIndex,
            testRetry: current.testRetry, loadAttemptAtDiagnosis: current.loadAttemptAtDiagnosis,
        }
    } catch { identity = 'unknown' }
    const platform = process.platform
    const startedMs = platform === 'win32' ? performance.now() : null
    const outcome = await collect(platform)
    const record = {
        diagnosis: 'socket-exhaustion', platform, identity, diagnosedAtUtc,
        diagnosisToCaptureMs: startedMs === null ? null : startedMs - diagnosedMs,
        captureDurationMs: startedMs === null ? null : performance.now() - startedMs,
        requestFailureToCaptureMs: 'unknown',
        ...outcome,
    }
    // Diagnostics must not turn a logging failure into an unhandled task rejection.
    try { console.warn(SOCKET_SNAPSHOT_PREFIX + JSON.stringify(record)) }
    catch { /* No second logging attempt or effect on readiness. */ }
}
