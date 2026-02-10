import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/**/*',
    '!src/tests/**/*',
    '!src/specs/**/*'
  ],
  format: ['cjs', 'esm'], // Output both
  dts: true,              // Generate types
  clean: true,            // Clean dist
  target: 'esnext',
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.cjs',
    }
  }
})
