import type { BrowserContext, Page, TestInfo } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import type { TransactionProbe } from './challengeTransaction'

export const CHALLENGE_FAILURE_PREFIX = '[e2e challenge failure] '
export const CHALLENGE_CAPTURE_MS = 1000

/** Self-contained: Playwright sends this function into each existing page. */
const readPage = () => {
    const unavailable = (reason: string) => ({ status: 'unavailable' as const, reason })
    const text = document.querySelector('[data-challenge-state]')?.textContent
    let state: unknown = unavailable('fixture-state-missing')
    if (text !== undefined && text !== null) {
        try {
            const value: unknown = JSON.parse(text)
            state = value !== null && typeof value === 'object' && !Array.isArray(value)
                ? { status: 'available', value } : unavailable('malformed-fixture-state')
        } catch { state = unavailable('malformed-fixture-state') }
    }
    const probe: TransactionProbe | undefined = window.challengeTransaction
    const busy = window.challengeFixture?.root.boardsStore.currentBoard?.challengeBinding?.busy
    return {
        fixturePath: location.pathname === '/visual/challenge'
            ? location.pathname : unavailable('not-challenge-fixture'),
        state,
        bindingBusy: busy === undefined ? unavailable('binding-missing') : {
            value: busy, meaning: 'binding operations in flight, not queue depth',
        },
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        transactions: !probe ? unavailable('probe-missing')
            : !Number.isFinite(probe.created) || !Number.isFinite(probe.settled)
                ? unavailable('counters-missing-or-invalid') : {
                    created: probe.created, settled: probe.settled,
                    outstanding: probe.created - probe.settled,
                },
        armedTransaction: !probe ? unavailable('probe-missing') : {
            armed: probe.armed, active: probe.active, completed: probe.completed,
            release: probe.release, abort: probe.abort,
            writesCount: Array.isArray(probe.writes) ? probe.writes.length : unavailable('writes-missing'),
        },
    }
}

type FailureInfo = Pick<TestInfo,
    'status' | 'expectedStatus' | 'project' | 'titlePath' | 'workerIndex' | 'retry' | 'outputPath' | 'attach'>
type Sample = { role: string, sample: unknown }

/** After failure only: reads no storage, changes no page, and never replaces the test error. */
export const captureChallengeFailure = async (
    context: Pick<BrowserContext, 'pages'>, mainPage: Page, info: FailureInfo,
): Promise<void> => {
    const status = info.status
    if ((status !== 'failed' && status !== 'timedOut') || status === info.expectedStatus) return
    const identity = {
        project: info.project.name, titlePath: [...info.titlePath],
        workerIndex: info.workerIndex, testRetry: info.retry,
    }
    const samples: Sample[] = []
    let enumeration: 'available' | 'unavailable' = 'available'
    let pages: Page[] = []
    try { pages = context.pages() }
    catch { enumeration = 'unavailable' }
    let others = 0
    const reads = pages.map(page => {
        const role = page === mainPage ? 'A' : ++others === 1 ? 'B' : `extra-${others - 1}`
        const entry: Sample = { role, sample: { status: 'unavailable', reason: 'capture-timeout' } }
        samples.push(entry)
        // The rejection handler also consumes failures that arrive after the deadline.
        return Promise.resolve().then(() => page.evaluate(readPage)).then(value => {
            entry.sample = { status: 'available', value }
        }, () => { entry.sample = { status: 'unavailable', reason: 'evaluation-failed' } })
    })
    if (!pages.includes(mainPage)) {
        samples.push({ role: 'A', sample: { status: 'unavailable', reason: 'page-missing' } })
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        await Promise.race([
            Promise.all(reads),
            new Promise<void>(resolve => { timer = setTimeout(resolve, CHALLENGE_CAPTURE_MS) }),
        ])
    } finally { clearTimeout(timer) }
    // Serialize once: late reads cannot change the line or the retained file.
    const body = JSON.stringify({ identity, originalStatus: status, enumeration, pages: samples })
    try { console.warn(CHALLENGE_FAILURE_PREFIX + body) }
    catch { /* The attachment remains useful if stderr is unavailable. */ }
    try {
        const path = info.outputPath('challenge-session-failure.json')
        await writeFile(path, body, 'utf8')
        await info.attach('challenge-session-failure', {
            path, contentType: 'application/json',
        })
    } catch { /* The original test error and the log remain unchanged. */ }
}
