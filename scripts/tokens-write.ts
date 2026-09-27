import { writeFileSync } from 'node:fs'
import { PALETTE_CSS_PATH, renderPaletteCss } from './palette-css'
import { TYPOGRAPHY_CSS_PATH, renderTypographyCss } from './typography-css'
import { CONTROLS_CSS_PATH, renderControlsCss } from './controls-css'
import { runCli } from './args'

/**
 * Write `app/palette.css` from `app/palette.ts` (graphics spec P0-5, row 5),
 * `app/typography.css` from `app/typography.ts` (P2-1, row 13), and `app/controls.css` from
 * `app/controls.ts` (P2-2, row 14). `npm run tokens`.
 *
 * Separate from the renderer for the reason `icons-write.ts` is: a test imports the renderer,
 * and a module that writes to the repository when it is loaded cannot be imported by one.
 */
runCli(async () => {
    writeFileSync(PALETTE_CSS_PATH, renderPaletteCss())
    console.log(`${PALETTE_CSS_PATH} written`)
    writeFileSync(TYPOGRAPHY_CSS_PATH, renderTypographyCss())
    console.log(`${TYPOGRAPHY_CSS_PATH} written`)
    writeFileSync(CONTROLS_CSS_PATH, renderControlsCss())
    console.log(`${CONTROLS_CSS_PATH} written`)
})
