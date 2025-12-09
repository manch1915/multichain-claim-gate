import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Every test file spins up an in-memory Postgres (PGlite) and runs migrations.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    exclude: [...configDefaults.exclude, 'test/e2e/**'],
  },
})
