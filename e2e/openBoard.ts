import { expect, type Locator, type Page } from '@playwright/test'
import { shouldRetryStartup, type NetworkFailure, type ResourceType } from './startupRetry'

/**
 * Open the page with the board ready, and explain itself when it is not.
 *
 * Every spec waited on `[data-board-shell]` with the default timeout and, when that
 * expired, reported only "element(s) not found" against a DOM reading `no board`. That is
 * the least informative possible account of the one startup path the app has, so the wait
 * lives here and carries its own diagnostics.
 *
 * `no board` is `DominoClient`'s loading state: the board arrives from
 * `getCurrentActiveBoard`, a `"use server"` action called from `useEffect`, so nothing
 * renders until the client has hydrated *and* a POST round-trip has come back. The
 * instrumentation below separates those two, which is what turned the intermittent startup
 * failure from a mystery into a measurement: `hydrated` says whether React ever took
 * control, and `fetches` says what the action did once it had.
 */

export type BoardDiagnostics = {
    hydrated: boolean
    readyState: string
    body: string
    fetches: string[]
    errors: string[]
    sinceGoto: number
}

const INSTRUMENT = () => {
    const w = window as unknown as {
        __probe: { fetches: string[], errors: string[], t0: number }
    }
    w.__probe = { fetches: [], errors: [], t0: Date.now() }
    window.addEventListener('error', e => w.__probe.errors.push(`error: ${e.message}`))
    window.addEventListener('unhandledrejection', e =>
        w.__probe.errors.push(`unhandledrejection: ${String((e as PromiseRejectionEvent).reason)}`))

    const original = window.fetch
    window.fetch = async (...args: Parameters<typeof fetch>) => {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url
        const started = Date.now() - w.__probe.t0
        try {
            const res = await original(...args)
            w.__probe.fetches.push(`OK ${res.status} ${url} @${started}ms +${Date.now() - w.__probe.t0 - started}ms`)
            return res
        } catch (err) {
            w.__probe.fetches.push(`REJECT ${url} @${started}ms :: ${(err as Error).message}`)
            throw err
        }
    }
}

/**
 * Network failures, recorded in the test process rather than the page.
 *
 * The in-page `fetch` patch cannot see these: a `<script>` that never loads fires no
 * `error` event the page listens for, produces no fetch, and leaves `readyState` at
 * `complete` regardless. A page that never hydrates therefore looks like an empty page
 * with no errors anywhere -- exactly what the first captured failure looked like -- so the
 * request-level view has to come from Playwright.
 *
 * Stored structured, not pre-formatted: `shouldRetryStartup` reasons about which request
 * failed and how, rather than grepping a sentence.
 */
type Recording = { failures: NetworkFailure[], attempt: number }

const NETWORK = new WeakMap<Page, Recording>()

const failuresOf = (page: Page) => NETWORK.get(page)?.failures ?? []

const describeFailures = (failures: readonly NetworkFailure[]) => failures
    .map(f => `[attempt ${f.attempt}] ` + (f.kind === 'failed'
        ? `FAILED ${f.method} ${f.url} (${f.resourceType}) :: ${f.error}`
        : `HTTP ${f.status} ${f.method} ${f.url} (${f.resourceType})`))
    .join(' | ')

/** Install the diagnostics. Call before `goto`; harmless if the page then loads fine. */
export const instrument = async (page: Page) => {
    // The listeners close over this object for the life of the page, so the attempt counter
    // has to live *inside* it. An earlier version replaced the whole array before a reload
    // and left the listeners writing to the orphaned one, which silently dropped every
    // failure from the retried attempt -- the exact attempt whose diagnostics matter most.
    const recording: Recording = { failures: [], attempt: 0 }
    NETWORK.set(page, recording)

    // The analytics beacon 404s against a self-hosted `next start` and has nothing to do
    // with the app booting, so it is never recorded as a failure at all.
    const ours = (url: string) => !url.includes('/_vercel/')
    const common = (r: { url(): string, method(): string, resourceType(): string }) => ({
        url: r.url(),
        method: r.method(),
        resourceType: r.resourceType() as ResourceType,
        attempt: recording.attempt,
    })

    page.on('requestfailed', r => {
        if (!ours(r.url())) return
        recording.failures.push({
            kind: 'failed', ...common(r), error: r.failure()?.errorText ?? 'unknown',
        })
    })
    page.on('response', r => {
        if (r.status() >= 400 && ours(r.url())) {
            recording.failures.push({ kind: 'http', ...common(r.request()), status: r.status() })
        }
    })
    await page.addInitScript(INSTRUMENT)
}

export const collectDiagnostics = (page: Page): Promise<BoardDiagnostics> => page.evaluate(() => {
    const w = window as unknown as { __probe?: { fetches: string[], errors: string[], t0: number } }
    return {
        // The effect that loads the board only runs after hydration; if React never got
        // that far, the board's absence says nothing about the server. React attaches
        // `__reactFiber$...` to the nodes it has claimed, which is the signal available
        // without adding a marker to production markup purely for the tests.
        hydrated: Object.keys(document.body).some(k => k.startsWith('__reactFiber')),
        readyState: document.readyState,
        body: document.body.innerText.slice(0, 120).replace(/\s+/g, ' '),
        fetches: w.__probe?.fetches ?? [],
        errors: w.__probe?.errors ?? [],
        sinceGoto: w.__probe ? Date.now() - w.__probe.t0 : -1,
    }
})

/**
 * Wait for something that only exists once the app has started, and explain a timeout.
 *
 * The locator is the caller's, because what proves "started" depends on whether the
 * tutorial is up: with it suppressed that is `[data-board-shell]`, but while it is showing
 * there are *two* boards on the page -- the tutorial's own 2x2 and the one behind it -- so
 * waiting on that selector is a strict-mode violation rather than a wait. Measured, by
 * making exactly that mistake here.
 *
 * At most one reload, and only when `shouldRetryStartup` says the page never got its
 * bundle. That rule lives in its own module with its own tests precisely because the
 * condition it guards cannot be produced on demand -- it appeared about once in twelve full
 * runs -- so a browser run cannot be the thing that checks it. Every decision is announced,
 * refusals included, so a gate that retried is never mistaken for one that simply passed.
 */
export const waitForReady = async (
    page: Page, locator: Locator, what = 'The board', timeout = 15_000,
) => {
    try {
        await expect(locator).toBeVisible({ timeout })
        return
    } catch (err) {
        const decide = async (reloadsUsed: number) => shouldRetryStartup({
            failures: failuresOf(page),
            hydrated: (await collectDiagnostics(page)).hydrated,
            reloadsUsed,
        })

        const decision = await decide(0)
        if (!decision.retry) throw await describeFailure(page, err, what, timeout, decision.reason)

        console.warn(`[e2e] ${what} did not load: ${decision.reason}.`)

        // Pause first, then mark the new attempt, then reload -- in that order.
        //
        // The pause is there to let the failing condition drain, and requests from the
        // first load can still fail during it. Incrementing before the pause would label
        // those stragglers as attempt 1, which is the one thing the marker exists to get
        // right. Nothing is cleared: both attempts are kept, and the marker is what tells
        // them apart in the report.
        await page.waitForTimeout(1_000)
        const recording = NETWORK.get(page)
        if (recording) recording.attempt += 1
        await page.reload()
        try {
            await expect(locator).toBeVisible({ timeout })
        } catch (retryErr) {
            // Refuses, because one reload is the budget. Called for the reason string, so
            // the report says why no further retry was taken rather than going silent.
            const after = await decide(1)
            throw await describeFailure(
                page, retryErr, `${what} (after one reload)`, timeout, after.reason)
        }
    }
}

const describeFailure = async (
    page: Page, err: unknown, what: string, timeout: number, verdict: string,
) => {
    const d = await collectDiagnostics(page)
    const network = failuresOf(page)
    // Whether the bundle's script tags are even present. A chunk that never arrived leaves
    // the tag in the markup and the page unhydrated, which is otherwise invisible.
    const scripts = await page.evaluate(() =>
        Array.from(document.querySelectorAll('script[src]'))
            .map(el => (el as HTMLScriptElement).src.split('/').pop())
            .join(',') || '(no script tags)'
    ).catch(() => '(unreadable)')

    return new Error([
        `${what} never rendered within ${timeout}ms.`,
        `  hydrated: ${d.hydrated}  readyState: ${d.readyState}  elapsed: ${d.sinceGoto}ms`,
        `  body: ${JSON.stringify(d.body)}`,
        `  fetches: ${d.fetches.length ? d.fetches.join(' | ') : '(none -- the load effect never ran)'}`,
        `  page errors: ${d.errors.length ? d.errors.join(' | ') : '(none)'}`,
        `  scripts: ${scripts}`,
        `  network: ${network.length ? describeFailures(network) : '(nothing failed)'}`,
        `  retry rule: ${verdict}`,
        `  original: ${(err as Error).message.split('\n')[0]}`,
    ].join('\n'))
}

/** Load the page past the tutorial and wait for the board, with a useful failure. */
export const openBoard = async (page: Page, timeout = 15_000) => {
    // The tutorial is suppressed before the first paint rather than dismissed afterwards.
    // Clicking Skip works only on the first visit, and probing for the button races the
    // first render -- when it lost, the tutorial's own 2x2 board was still mounted and
    // every `[data-board-shell]` query matched two elements. The tutorial's own behaviour
    // is covered in e2e/tutorial.spec.ts; everywhere else it is in the way.
    await page.addInitScript(() => localStorage.setItem('hasSeenTutorial', 'true'))
    await instrument(page)
    await page.goto('/')
    await waitForBoard(page, timeout)
}

/** The common case: the tutorial is suppressed, so there is exactly one board. */
export const waitForBoard = (page: Page, timeout = 15_000) =>
    waitForReady(page, page.locator('[data-board-shell]'), 'The board', timeout)
