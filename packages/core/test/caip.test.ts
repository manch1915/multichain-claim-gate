import { describe, expect, it } from 'vitest'
import {
  chainByCaip2,
  detectFamily,
  formatAccountId,
  parseAccountId,
  shortAddress,
} from '../src/index.js'

describe('CAIP helpers', () => {
  it('parses and checksums EVM account ids', () => {
    const account = parseAccountId('eip155:84532:0x70997970c51812dc3a010c7d01b50e0d17dc79c8')
    expect(account).toEqual({
      chain: 'eip155:84532',
      address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    })
    expect(formatAccountId(account)).toBe('eip155:84532:0x70997970C51812dc3A010C7d01b50e0d17dc79C8')
  })

  it('keeps Solana addresses untouched', () => {
    const id =
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
    expect(parseAccountId(id).address).toBe('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')
    expect(chainByCaip2(parseAccountId(id).chain)?.key).toBe('solanaDevnet')
  })

  it('rejects malformed ids', () => {
    expect(() => parseAccountId('eip155:1')).toThrow()
    expect(() => parseAccountId('eip155:1:nope')).toThrow()
    expect(() => parseAccountId('eip155:0x1:0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toThrow()
    expect(() => parseAccountId('cosmos:hub:0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toThrow()
  })

  it('rejects an address from the other family', () => {
    expect(() =>
      parseAccountId(
        'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      ),
    ).toThrow(/does not belong/)
    expect(() =>
      parseAccountId('eip155:84532:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'),
    ).toThrow(/does not belong/)
  })

  it('detects address families', () => {
    expect(detectFamily('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe('evm')
    expect(detectFamily('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toBe('solana')
    expect(detectFamily('hello')).toBeUndefined()
  })

  it('shortens addresses for display', () => {
    expect(shortAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')).toBe('0x7099…79C8')
    expect(shortAddress('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toBe('7xKX…gAsU')
  })
})
