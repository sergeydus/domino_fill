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
    /*
     * No `orientation` member, deliberately (spec row 20g).
     *
     * Row 20b locked the installed app to portrait, which nothing in the spec asked for
     * and which the layout work directly contradicts: `e2e/layout.spec.ts` proves the
     * board fits at 800x400 landscape, and P0-3's whole budget is about surviving the
     * space a device actually offers. A lock also takes the choice away from someone
     * whose phone is mounted, or who holds it landscape because that is what their grip
     * allows -- WCAG 1.3.4 asks that content not restrict orientation unless the
     * orientation is essential, and a square grid of dominoes is not.
     *
     * Omitted rather than set to `any` because `any` is already the default, and a member
     * that restates a default is a member someone edits.
     */
    // The board's own ground, so the splash screen does not flash white before the game
    // appears on top of it.
    background_color: GROUND,
    theme_color: GROUND,
    icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: ICON_512, sizes: '512x512', type: 'image/png', purpose: 'any' },
        /*
         * A separate *file*, not just a separate declaration (spec row 20h).
         *
         * Row 20b pointed this at the icon above and said it had "enough margin around the
         * domino to survive" a crop. Measured, it does not: an Android launcher crops a
         * maskable icon to its own shape, the manifest specification guarantees only a
         * centred circle of radius 40%, and that drawing's corners sit at 0.528 of the
         * icon from its centre -- so a round launcher would clip the domino's edges. The
         * maskable file draws the same mark at 70%, which `tests/icons.test.ts` checks
         * pixel by pixel rather than by arithmetic.
         */
        {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
        },
    ],
})

export default manifest
