import type { NextConfig } from "next";

/**
 * Cache policy for the published corpus (spec P1-6, row 18d).
 *
 * The chunk filenames carry a content hash precisely so they can be cached forever, and the
 * comment in `corpusSource.ts` said so — but saying so is not doing so. Measured against
 * `next start`, every file under `public/` is served `Cache-Control: public, max-age=0`, so
 * the browser revalidated a 104 KB immutable file on every load and the whole point of
 * hashing the name was thrown away. A content-hashed filename does not change Next's
 * `public/` policy on its own; nothing does but this.
 *
 * The two paths want opposite things, which is why they are two rules:
 *
 *   - a **chunk** is immutable by construction. Different content produces a different
 *     filename, so the bytes behind `2026-09.<digest>.json` can never change and a year of
 *     `immutable` is safe. `immutable` is the part that matters: it suppresses the
 *     revalidation a mere `max-age` still permits on reload.
 *   - **`index.json`** is the one file that is rewritten, every time the corpus is extended.
 *     It must be revalidated or a client would keep an index that does not know about the
 *     months added since — which, for a game whose content horizon is the thing being
 *     extended, is the one stale document that matters. `must-revalidate` with a zero
 *     lifetime still allows a conditional request, so the common case is a 304 and not a
 *     30 KB download.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        /*
         * `YYYY-MM.<16 hex>.json`, and nothing else.
         *
         * A wildcard over `/puzzles/` produces byte-identical headers today, and that was
         * measured rather than assumed: the later `index.json` rule wins for the same key,
         * and the directory holds no file that is neither the index nor a hashed chunk, so
         * there is nothing for the two sources to disagree about. (A path that does not
         * exist never reaches either rule -- Next answers a 404 with its own no-store.)
         *
         * The precise source stays because it states the invariant the whole scheme rests
         * on: only a name that proves its own content may be pinned for a year. The day a
         * file is added here whose name is not a digest, a wildcard would pin it and this
         * will not.
         */
        source: '/puzzles/:month(\\d{4}-\\d{2}).:digest([0-9a-f]{16}).json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/puzzles/index.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ]
  },
};

export default nextConfig;
