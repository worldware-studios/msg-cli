import { defineConfig } from 'vitest/config'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      // @worldware/msg is built with tsup (index.mjs); ensure Vitest resolves it
      '@worldware/msg': join(__dirname, 'node_modules/@worldware/msg/dist/index.mjs'),
    },
  },
  test: {
    coverage: {
      // Enforces the > 90% target in project/rules.md; `npm run coverage`
      // (run in CI) fails if any metric drops below it.
      thresholds: {
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
      exclude: [
        '**/*.json',
        'src/tests/**',
        '**/fixtures/**',
        'dist/**'
      ]
    }
  },
})