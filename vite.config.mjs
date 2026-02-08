import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        '**/*.json',
        'src/tests/**',
        '**/fixtures/**',
        'dist/**'
      ]
    }
  },
})