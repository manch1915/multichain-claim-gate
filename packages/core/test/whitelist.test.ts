import { describe, expect, it } from 'vitest'
import { parseWhitelist } from '../src/index.js'

const options = { decimals: { evm: 18, solana: 6 } }

describe('parseWhitelist', () => {
  it('reads EVM and Solana rows and skips the header and comments', () => {
    const csv = [
      'address,amount',
      '# early supporters',
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8,120',
      '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU;42.5',
      '',
    ].join('\n')

    const result = parseWhitelist(csv, options)

    expect(result.issues).toEqual([])
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toMatchObject({
      line: 3,
      family: 'evm',
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      baseAmount: 120n * 10n ** 18n,
    })
    expect(result.entries[1]).toMatchObject({ family: 'solana', baseAmount: 42_500_000n })
    expect(result.totals.evm.count).toBe(1)
    expect(result.totals.solana.amount).toBe(42_500_000n)
  })

  it('reports bad rows with line numbers and keeps the good ones', () => {
    const csv = [
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8,100',
      'not-an-address,5',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,abc',
      '0x70997970c51812dc3a010c7d01b50e0d17dc79c8,7',
      '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU,0.0000001',
      '0x90F79bf6EB2c4f870365E785982E1f101E93b906,0',
      '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65,1,extra',
    ].join('\r\n')

    const result = parseWhitelist(csv, options)

    expect(result.entries).toHaveLength(1)
    expect(result.issues.map((issue) => issue.line)).toEqual([2, 3, 4, 5, 6, 7])
    expect(result.issues[2]!.message).toMatch(/first listed on line 1/)
    expect(result.issues[3]!.message).toMatch(/6 decimal places/)
  })

  it('stops at the row limit', () => {
    const csv = [
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8,1',
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,1',
    ].join('\n')
    const result = parseWhitelist(csv, { ...options, maxRows: 1 })
    expect(result.entries).toHaveLength(1)
    expect(result.issues[0]!.message).toMatch(/more than 1 rows/)
  })

  it('accepts quoted cells and underscores in amounts', () => {
    const result = parseWhitelist('"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","1_000"', options)
    expect(result.entries[0]!.baseAmount).toBe(1000n * 10n ** 18n)
  })
})
