import type { MetadataRoute } from 'next'

/**
 * The web app manifest (spec P2-2, row 20b).
 *
 * Sequenced behind P1-6 on purpose: installability is retention polish, and until row 18
 * there was nothing to retain a player *with* -- the game served two bundled day-entries
 * on a two-day rotation, so every date had the same puzzles and "come back tomorrow" was
 * not a true statement. A ten-year corpus makes the promise real, and only then is asking
 * someone to put the game on their home screen worth anything.
 *
 * A route rather than a static `manifest.json` so the icon paths and the name cannot drift
 * from the app's own metadata without TypeScript noticing.
 *
 * `display: 'standalone'` rather than `fullscreen`: the board is budgeted against the
 * space its chrome leaves (P0-3) and the browser's own UI is part of that budget, but the
 * status bar and the home indicator are not chrome the game should be hiding -- and
 * `fullscreen` on Android hides the status bar, which takes the clock away from someone
 * playing a *daily* puzzle.
 */
const manifest = (): MetadataRoute.Manifest => ({
    name: 'Domino Fill',
    short_name: 'Domino Fill',
    description:
        'A daily domino logic puzzle. Fill the board so every row and column adds up.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The board's own ground, so the splash screen does not flash white before the game
    // appears on top of it.
    background_color: '#e8e7e7',
    theme_color: '#e8e7e7',
    icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        // `maskable` is a separate declaration, not a flag on the ones above: Android
        // crops a maskable icon to whatever shape the launcher uses, and this drawing has
        // enough margin around the domino to survive that.
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
})

export default manifest
