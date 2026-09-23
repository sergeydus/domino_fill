import { defineConfig, devices } from '@playwright/test'
import { BASE_URL } from './e2e/server'

/**
 * The four visual baselines (graphics spec P0-4, row 4).
 *
 * A separate config because pixels are a property of the machine as much as of the code:
 * these compare only on the environment the baselines were taken on, a GitHub-hosted
 * `ubuntu-24.04` runner (see `.github/workflows/ci.yml`), and `npm run test:e2e` -- the
 * suite that runs everywhere -- never sees them. Run anywhere else, they fail against
 * baselines from a different rasteriser, which says nothing about the code.
 *
 * No container. The spec asked for the official Playwright image pinned by digest; this
 * project does not use Docker anywhere, CI included. What is pinned instead, and what is
 * not, is the trade-off recorded in the spec: Playwright's version (and with it Chromium's
 * build) is pinned by the lockfile; the runner image is not, and GitHub updates it. Every
 * baseline set carries the environment it was taken in (`environment.json`) so that a
 * failure after an image update says so rather than looking like a regression.
 */
export default defineConfig({
    testDir: './visual-tests',
    // One set, for one platform. Playwright's default adds the platform to the name; there
    // is only ever the one, so the name says what the picture is instead.
    snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
    // A missing baseline is a failure, never an invitation to write one: baselines are
    // written only by `npm run visual:update`, which refuses to run off the CI runner.
    updateSnapshots: 'none',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // No retries: a retry would turn exactly the flake this suite must measure into a pass.
    retries: 0,
    reporter: process.env.CI ? 'line' : [['list']],
    globalSetup: './e2e/globalSetup.ts',
    expect: {
        toHaveScreenshot: {
            // Measured, not chosen: 100 comparisons (4 baselines x 25) on the runner that
            // took them, every one zero pixels different. See the spec's P0-4 amendment.
            maxDiffPixels: 0,
            // Stops CSS animations and transitions; `motion`'s JavaScript animations are
            // waited out by `waitForRest` instead, because this cannot see them.
            animations: 'disabled',
            caret: 'hide',
            scale: 'css',
        },
    },
    use: {
        ...devices['Desktop Chrome'],
        baseURL: BASE_URL,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
        colorScheme: 'light',
        locale: 'en-US',
        // The calendar is shifted to a fixed instant in UTC; the page reads it in UTC too,
        // so "which day is it" has one answer on every runner.
        timezoneId: 'UTC',
    },
    projects: [{ name: 'visual' }],
})
