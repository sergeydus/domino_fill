import { defineConfig, devices } from '@playwright/test'
import { BASE_URL } from './e2e/server'

/**
 * Browser-level tests (spec P1-9).
 *
 * These exist because jsdom has no layout engine: `getBoundingClientRect()` returns zeros,
 * so it cannot answer whether labels line up with their rows, whether the page overflows
 * horizontally, or whether a control is actually reachable on a small screen. Everything
 * here needs a real browser or it is not being tested at all.
 *
 * Runs against a production build rather than `next dev`: the dev overlay and its indicator
 * are extra fixed-position chrome that layout assertions should not have to reason about.
 *
 * The server is started and stopped by e2e/globalSetup.ts rather than Playwright's managed
 * `webServer`. See e2e/server.ts for why: the managed lifecycle was reported hanging at
 * "Terminating the WebServer" on Windows, and it would also silently reuse whatever happened
 * to be listening on the port.
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'line' : [['list']],
    globalSetup: './e2e/globalSetup.ts',
    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'desktop',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
        },
        {
            // The phone size the spec's layout criteria are written against.
            name: 'phone-360',
            use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 } },
        },
    ],
})
