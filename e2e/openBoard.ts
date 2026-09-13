import { expect, type Locator, type Page } from '@playwright/test'

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
 * instrumentation below separates those two: `hydrated` says whether the effect ever ran,
 * and `fetches` says what the action did.
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

export const collectDiagnostics = (page: Page) => page.evaluate(() => {
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
 * Network failures, recorded in the test process rather than the page.
 *
 * The in-page `fetch` patch cannot see these: a `<script>` that never loads fires no
 * `error` event the page listens for, produces no fetch, and leaves `readyState` at
 * `complete` regardless. A hydration that never happens looks like an empty page with no
 * errors anywhere -- which is exactly what the first captured failure looked like -- so the
 * request-level view has to come from Playwright.
 */
const NETWORK = new WeakMap<Page, string[]>()

/** Install the diagnostics. Call before `goto`; harmless if the page then loads fine. */
export const instrument = async (page: Page) => {
    const log: string[] = []
    NETWORK.set(page, log)
    page.on('requestfailed', r => {
        // Ignore the analytics beacon: it 404s against a self-hosted `next start` and has
        // nothing to do with the app booting.
        if (r.url().includes('/_vercel/')) return
        log.push(`FAILED ${r.method()} ${r.url()} :: ${r.failure()?.errorText ?? '?'}`)
    })
    page.on('response', r => {
        if (r.status() >= 400 && !r.url().includes('/_vercel/')) {
            log.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`)
        }
    })
    await page.addInitScript(INSTRUMENT)
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

/**
 * Wait for something that only exists once the app has started, and explain a timeout.
 *
 * The locator is the caller's, because what proves "started" depends on whether the
 * tutorial is up: with it suppressed that is `[data-board-shell]`, but while it is showing
 * there are *two* boards on the page -- the tutorial's own 2x2 and the one behind it -- so
 * waiting on that selector is a strict-mode violation rather than a wait. Measured, by
 * making exactly that mistake here.
 */
/**
 * Errors that mean the machine ran out of sockets, not that the app is broken.
 *
 * Measured on Windows: a full run leaves ~2500 sockets to the test port in TIME_WAIT, and
 * back-to-back runs accumulate them. When the pool is under pressure Chromium fails a
 * request at the transport layer with `ERR_NO_BUFFER_SPACE` -- and if the request it kills
 * is a JS chunk, the bundle never arrives, React never hydrates, and the page sits at
 * `no board` with no error anywhere in it. That is the whole of the intermittent startup
 * failure this file was written to explain.
 */
const EXHAUSTION = /ERR_NO_BUFFER_SPACE|ERR_INSUFFICIENT_RESOURCES|ERR_NETWORK_CHANGED/

/**
 * Wait for something that only exists once the app has started, and explain a timeout.
 *
 * The locator is the caller's, because what proves "started" depends on whether the
 * tutorial is up: with it suppressed that is `[data-board-shell]`, but while it is showing
 * there are *two* boards on the page -- the tutorial's own 2x2 and the one behind it -- so
 * waiting on that selector is a strict-mode violation rather than a wait. Measured, by
 * making exactly that mistake here.
 *
 * A load that failed on socket exhaustion is retried once, and *only* that: the reload is
 * gated on having actually seen an exhaustion error in the network log, so a genuinely
 * broken page still fails on the first attempt with its diagnostics intact. It is reported
 * when it happens, because a gate that silently retries is a gate that lies.
 */
export const waitForReady = async (
    page: Page, locator: Locator, what = 'The board', timeout = 15_000,
) => {
    try {
        await expect(locator).toBeVisible({ timeout })
        return
    } catch (err) {
        const exhausted = (NETWORK.get(page) ?? []).filter(l => EXHAUSTION.test(l))
        if (exhausted.length === 0) throw await describeFailure(page, err, what, timeout)

        console.warn(
            `[e2e] ${what} failed to load because the machine ran out of sockets, not ` +
            `because of the app: ${exhausted.join(' | ')}. Reloading once. If this is ` +
            `frequent, the lever is fewer Playwright workers or a pause between runs to ` +
            `let TIME_WAIT drain.`
        )
        NETWORK.set(page, [])
        await page.waitForTimeout(1_000)
        await page.reload()
        try {
            await expect(locator).toBeVisible({ timeout })
        } catch (retryErr) {
            throw await describeFailure(page, retryErr, `${what} (after a reload)`, timeout)
        }
    }
}

const describeFailure = async (page: Page, err: unknown, what: string, timeout: number) => {
    const d = await collectDiagnostics(page)
    const network = NETWORK.get(page) ?? []
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
        `  network: ${network.length ? network.join(' | ') : '(nothing failed)'}`,
        `  original: ${(err as Error).message.split('\n')[0]}`,
    ].join('\n'))
}

/** The common case: the tutorial is suppressed, so there is exactly one board. */
export const waitForBoard = (page: Page, timeout = 15_000) =>
    waitForReady(page, page.locator('[data-board-shell]'), 'The board', timeout)
