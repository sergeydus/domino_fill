import { writeFileSync } from 'node:fs'
import { ICONS, renderIcon } from './icon'
import { runCli } from './args'

/**
 * Write every icon (spec P2-2, row 20b). `npm run icons`.
 *
 * Separate from `icon.ts` so the renderer can be imported by a test without a module that
 * writes to the repository as a side effect of being loaded.
 */
runCli(async () => {
    for (const { path, size, why } of ICONS) {
        writeFileSync(path, renderIcon(size))
        console.log(`${path}  ${size}x${size}  -- ${why}`)
    }
})
