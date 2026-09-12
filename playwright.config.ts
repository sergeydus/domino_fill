import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`

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
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'line' : [['list']],
    use: {
        baseURL,
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
    webServer: {
        command: `npm run build && npx next start --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
    },
})
