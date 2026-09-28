/**
 * What the game is called and where it lives, in one place (spec P2-2, rows 20b and 20f).
 *
 * Row 20b put real metadata in `layout.tsx` and a real manifest in `manifest.ts`, and
 * claimed a route was used "so the strings cannot drift without TypeScript noticing".
 * That was false: they were duplicated literals in two files, and TypeScript has no opinion
 * about whether two string literals are equal. This module is what makes the claim true —
 * both read from here — and `e2e/metadata.spec.ts` checks the *served* manifest against the
 * *served* page, which is the only place drift would actually hurt.
 */

import { PALETTE } from './palette'

/**
 * Where the game is deployed, and what an absolute URL in a meta tag has to point at.
 *
 * Row 20b fell back to `http://localhost:3000`. That is worse than leaving `metadataBase`
 * unset: Next's own default consults `VERCEL_URL` first and only then localhost, so naming
 * localhost explicitly *suppresses* the deployment-aware behaviour. Unless the environment
 * variable happened to be configured outside this repository, every deployed Open Graph and
 * Twitter card advertised an image on somebody's laptop — a valid, absolute, unreachable
 * URL, which is exactly the failure the absolute-URL work was for.
 *
 * The canonical origin is the fallback instead, because that is the answer that is correct
 * when nothing else is known. The environment variable stays, because the test harness
 * needs it: `e2e/server.ts` builds with it set to the test server's own origin, without
 * which a missing `metadataBase` is indistinguishable from a present one.
 */
export const CANONICAL_ORIGIN = 'https://domino-fill.vercel.app'

/**
 * The site URL to build absolute metadata URLs from.
 *
 * Takes the configured value as an argument rather than reading `process.env` itself, so
 * the interesting case — the variable *missing* — is a normal test rather than an
 * environment stunt. `tests/siteMetadata.test.ts` covers it.
 *
 * A malformed or non-HTTP override falls back rather than throwing. `new URL()` throwing
 * inside `metadata` fails the build, and a typo in a deploy variable is not worth taking a
 * site down for when there is a correct answer available.
 */
export const resolveSiteUrl = (configured?: string): string => {
    const trimmed = configured?.trim()
    if (!trimmed) return CANONICAL_ORIGIN
    try {
        const url = new URL(trimmed)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return CANONICAL_ORIGIN
        return url.origin
    } catch {
        return CANONICAL_ORIGIN
    }
}

/** The name under an icon, in an install dialog, and in a link preview's byline. */
export const NAME = 'Domino Fill'

/** The browser tab, the bookmark, the search result. */
export const TITLE = 'Domino Fill — a daily domino logic puzzle'

/** The full description: search results, and nothing else has room for it. */
export const DESCRIPTION =
    'Fill the board with dominoes so every row and column adds up to its target. '
    + 'A new puzzle every day, in three sizes.'

/** The short one, for a link preview and an install dialog, where two lines is the budget. */
export const SHORT_DESCRIPTION =
    'Fill the board with dominoes so every row and column adds up to its target.'

/**
 * The board's own ground: the palette's `ground` token (graphics spec P0-5), which is also
 * `--ground` in the generated `palette.css` and the icon's background.
 *
 * Shared by the browser chrome's theme colour and the installed app's splash screen, so
 * neither flashes a white band above a grey page. Read from the palette rather than copied,
 * so a change to the ground reaches both without anyone remembering to look.
 */
export const GROUND: string = PALETTE.ground

/** The icon the manifest, the splash screen and the link preview all use. */
export const ICON_512 = '/icon-512.png'
