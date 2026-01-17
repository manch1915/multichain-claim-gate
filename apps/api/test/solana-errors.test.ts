import { describe, expect, it } from 'vitest'
import { describeSolanaFailure } from '../src/infra/solana/solana-gateway.js'

// Shapes taken from a real preflight failure on solana-test-validator.
const preflight = (code: number) =>
  Object.assign(new Error('Transaction simulation failed'), {
    context: { logs: ['Program log: Instruction: Claim'] },
    cause: { context: { code, index: 0 } },
  })

describe('describeSolanaFailure', () => {
  it('maps program error codes to readable messages', () => {
    expect(describeSolanaFailure(preflight(6000))).toMatch(/list changed/)
    expect(describeSolanaFailure(preflight(6001))).toMatch(/already claimed/)
    expect(describeSolanaFailure(preflight(6002))).toMatch(/paused/)
  })

  it('recognises expired blockhashes and falls back to a generic message', () => {
    expect(describeSolanaFailure(new Error('Blockhash not found'))).toMatch(/expired/)
    expect(describeSolanaFailure(new Error('boom'))).toMatch(/rejected/)
  })
})
