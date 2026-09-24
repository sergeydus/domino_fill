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
            /*
             * Both set explicitly, because the defaults hid the question. The comparator is
             * pixelmatch, which forgives each pixel a colour difference below `threshold`
             * (0.2 by default, in YIQ) and ignores pixels it judges anti-aliasing. Measured at
             * 0.2, a tile-face colour change and a three-level darker cell both passed; at 0
             * both fail. Anti-aliased edges still cannot be counted -- a half-pixel outline
             * change passes either way -- and the geometry assertions of row 2 exist for
             * exactly that. See the spec's P0-4 amendment for the table and the runs.
             */
            maxDiffPixels: 0,
            threshold: 0,
            // Stops CSS animations and transitions; `motion`'s JavaScript animations are
            // waited out by `waitForRest` instead, because this cannot see them.
            animations: 'disabled',
            caret: 'hide',
            scale: 'css',
        },
    },
    use: {
        ...devices['Desktop Chrome'],
        /*
         * Raster whole tiles, every time (found at graphics row 7).
         *
         * By default Chromium re-rasterises only the invalidated part of a tile, and the
         * anti-aliasing where a partial raster meets the old one depends on what was
         * invalidated before the screenshot -- on timing, not on the page. Rows 3 and 6 saw
         * it as a few-pixel cluster that toggled between runs of unchanged code, always
         * classed as anti-aliasing until row 7's art put one counted pixel in it: 7 of 25
         * same-runner comparisons of the 53px sheet failed by that one pixel. Measured on
         * the development host, ten shots of the sheet came out as three different images
         * by default and as one with this switch; five of each baseline, one image each.
         * The page is the same; the rasteriser just stops depending on its own history.
         */
        launchOptions: { args: ['--disable-partial-raster'] },
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
