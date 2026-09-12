import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
    test: {
        // The rules layer is pure; only hook/component tests need a DOM, and those
        // opt in per-file via `// @vitest-environment jsdom`.
        environment: 'node',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
    resolve: {
        alias: { '@': path.resolve(__dirname) },
    },
})
