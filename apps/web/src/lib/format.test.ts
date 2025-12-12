import { describe, expect, it } from 'vitest'
import { formatAmount, plural, relativeTime, shortHash } from './format'

describe('formatAmount', () => {
  it('groups thousands and trims trailing zeros', () => {
    expect(formatAmount(1_250_500_000_000_000_000_000n, 18)).toBe('1,250.5')
    expect(formatAmount('250000000', 6)).toBe('250')
  })

  it('shows dust instead of rounding it to zero', () => {
    expect(formatAmount(1n, 18)).toBe('< 0.0001')
    expect(formatAmount(0n, 18)).toBe('0')
  })

  it('caps the fraction length', () => {
    expect(formatAmount(123_456_789n, 6, 2)).toBe('123.45')
  })
})

describe('copy helpers', () => {
  it('pluralises counts', () => {
    expect(plural(1, 'wallet', 'wallets')).toBe('1 wallet')
    expect(plural(1200, 'wallet', 'wallets')).toBe('1,200 wallets')
  })

  it('describes times relative to now', () => {
    const now = Date.parse('2026-10-20T12:00:00Z')
    expect(relativeTime('2026-10-20T11:59:30Z', now)).toBe('just now')
    expect(relativeTime('2026-10-20T11:15:00Z', now)).toBe('45 min ago')
    expect(relativeTime('2026-10-19T10:00:00Z', now)).toBe('yesterday')
    expect(relativeTime(null, now)).toBe('pending')
  })

  it('shortens hashes in the middle', () => {
    expect(shortHash('0x2b39da3ee2a0c1b9d3d2cab')).toBe('0x2b39da…3d2cab')
  })
})
