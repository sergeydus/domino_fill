import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
    test: {
        // The rules layer is pure; only hook/component tests need a DOM, and those
        // opt in per-file via `// @vitest-environment jsdom`.
        environment: 'node',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        // Keeps the unit run's stderr empty: jsdom has no media playback, and the board
        // plays a sound on click. See tests/setup.ts.
        setupFiles: ['tests/setup.ts'],
    },
    resolve: {
        alias: { '@': path.resolve(__dirname) },
    },
})
