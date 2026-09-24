import { writeFileSync } from 'node:fs'
import { PALETTE_CSS_PATH, renderPaletteCss } from './palette-css'
import { runCli } from './args'

/**
 * Write `app/palette.css` from `app/palette.ts` (graphics spec P0-5, row 5). `npm run tokens`.
 *
 * Separate from the renderer for the reason `icons-write.ts` is: a test imports the renderer,
 * and a module that writes to the repository when it is loaded cannot be imported by one.
 */
runCli(async () => {
    writeFileSync(PALETTE_CSS_PATH, renderPaletteCss())
    console.log(`${PALETTE_CSS_PATH} written`)
})
