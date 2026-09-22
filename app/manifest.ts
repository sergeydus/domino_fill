import type { MetadataRoute } from 'next'
import { GROUND, ICON_512, NAME, SHORT_DESCRIPTION } from './siteMetadata'

/**
 * The web app manifest (spec P2-2, row 20b).
 *
 * Sequenced behind P1-6 on purpose: installability is retention polish, and until row 18
 * there was nothing to retain a player *with* -- the game served two bundled day-entries
 * on a two-day rotation, so every date had the same puzzles and "come back tomorrow" was
 * not a true statement. A ten-year corpus makes the promise real, and only then is asking
 * someone to put the game on their home screen worth anything.
 *
 * A route rather than a static `manifest.json` so the values are computed from the same
 * module the page's metadata is (`siteMetadata.ts`) rather than typed out twice. Row 20b
 * claimed the route itself prevented drift "without TypeScript noticing", which was not
 * true -- these were duplicated string literals, and TypeScript has no opinion about
 * whether two literals are equal. Sharing the constants is what prevents it, and
 * `e2e/metadata.spec.ts` checks the served manifest against the served page in case someone
 * unshares them again.
 *
 * `display: 'standalone'` rather than `fullscreen`: the board is budgeted against the
 * space its chrome leaves (P0-3) and the browser's own UI is part of that budget, but the
 * status bar and the home indicator are not chrome the game should be hiding -- and
 * `fullscreen` on Android hides the status bar, which takes the clock away from someone
 * playing a *daily* puzzle.
 */
const manifest = (): MetadataRoute.Manifest => ({
    name: NAME,
    short_name: NAME,
    description: SHORT_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The board's own ground, so the splash screen does not flash white before the game
    // appears on top of it.
    background_color: GROUND,
    theme_color: GROUND,
    icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: ICON_512, sizes: '512x512', type: 'image/png', purpose: 'any' },
        // `maskable` is a separate declaration, not a flag on the ones above: Android
        // crops a maskable icon to whatever shape the launcher uses, and this drawing has
        // enough margin around the domino to survive that.
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
})

export default manifest
