/**
 * The player's theme choice, applied before the first paint (UI row 1).
 *
 * The phone decides by default: `palette.css` follows `prefers-color-scheme`. A player who
 * chose a theme has it stored under `THEME_KEY`, and this script, inline and first in
 * `<head>` (`layout.tsx`), marks `<html>` with it before anything is drawn. A choice applied
 * after hydration would draw a frame in the phone's theme first, which is the flash this
 * exists to prevent.
 *
 * Only the two names are accepted. Anything else stored -- a value from a later version, a
 * typo, a hand edit -- leaves the attribute off and the phone deciding, rather than becoming
 * an attribute that matches no rule and still overrides nothing.
 *
 * Nothing writes the key yet: the Settings choice is UI row 8.
 */

/** Where the choice is stored, in local storage. */
export const THEME_KEY = 'dominoFill.theme'

/** The values a stored choice may have; any other leaves the phone deciding. */
export const THEME_CHOICES = ['light', 'dark'] as const

export type ThemeChoice = typeof THEME_CHOICES[number]

/**
 * The script's source.
 *
 * Besides `data-theme`, it points the browser chrome's colour at the chosen theme's ground,
 * so a phone set to dark with the game set to light does not draw a dark bar over a light
 * page. It holds no colour of its own: the grounds are the tags' content, which the layout's
 * `viewport` reads from the palette through `siteMetadata.ts`.
 *
 * It does that by **switching the tags' `media`, never their `content`**. There is one
 * `theme-color` tag per scheme, and the tag for the chosen theme is made to match always
 * (`all`), the other never (`not all`). React matches a `<meta>` it hydrates by its `content`:
 * when this script rewrote the content, React found no tag for the dark ground and added a
 * third one, which the browser then read (measured, UI row 1).
 *
 * Next places the tags above this script, so they are switched at once; and again once the
 * document is parsed, in case they ever come after it.
 *
 * In a `try`: storage can throw (a private window, blocked site data), and a script that
 * throws before the first paint must still leave the page to the phone's theme.
 */
export const themeScript = (): string => `(function () {
  try {
    var choice = window.localStorage.getItem(${JSON.stringify(THEME_KEY)});
    if (${JSON.stringify(THEME_CHOICES)}.indexOf(choice) < 0) return;
    document.documentElement.setAttribute('data-theme', choice);
    var chosen = '(prefers-color-scheme: ' + choice + ')';
    var paint = function () {
      var tags = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < tags.length; i++) {
        var media = tags[i].getAttribute('data-media') || tags[i].getAttribute('media');
        tags[i].setAttribute('data-media', media);
        tags[i].setAttribute('media', media === chosen ? 'all' : 'not all');
      }
    };
    paint();
    document.addEventListener('DOMContentLoaded', paint);
  } catch (e) {}
})();`
