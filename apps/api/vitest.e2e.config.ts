import { defineConfig } from 'vitest/config'

// Needs a running Anvil node and `forge build` artifacts in contracts/evm/out.
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
