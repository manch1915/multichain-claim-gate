import { describe, expect, it } from 'vitest'
import {
  collectConditions,
  evaluateRule,
  rule as ruleSchema,
  type Condition,
  type MeasureFn,
  type Rule,
} from '../src/index.js'

const pass: Condition = {
  kind: 'erc721',
  chain: 'eip155:84532',
  contract: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  name: 'Meridian Pass',
  minCount: 1,
}
const mrdOnBase: Condition = {
  kind: 'erc20',
  chain: 'eip155:84532',
  contract: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  symbol: 'MRD',
  decimals: 18,
  minAmount: '100',
}
const mrdOnSolana: Condition = {
  kind: 'spl',
  chain: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  mint: 'So11111111111111111111111111111111111111112',
  symbol: 'MRD',
  decimals: 6,
  minAmount: '100',
}

const lounge: Rule = {
  kind: 'any',
  label: 'Pass or 100 MRD',
  rules: [pass, { kind: 'any', rules: [mrdOnBase, mrdOnSolana] }],
}

function measureFrom(values: Map<Condition, bigint | null>): MeasureFn {
  return async (condition) => values.get(condition) ?? 0n
}

describe('evaluateRule', () => {
  it('passes an "any" group when one branch holds', async () => {
    const result = await evaluateRule(
      lounge,
      measureFrom(
        new Map<Condition, bigint | null>([
          [pass, 0n],
          [mrdOnBase, 0n],
          [mrdOnSolana, 150_000_000n],
        ]),
      ),
    )
    expect(result.passed).toBe(true)
    expect(result.type).toBe('group')
  })

  it('reports actual and required amounts for each condition', async () => {
    const result = await evaluateRule(mrdOnBase, async () => 99n * 10n ** 18n)
    expect(result).toMatchObject({
      type: 'condition',
      passed: false,
      required: '100',
      actual: '99',
      label: 'Hold 100 MRD on Base Sepolia',
    })
  })

  it('marks conditions on chains without a linked account', async () => {
    const result = await evaluateRule(mrdOnSolana, async () => null)
    expect(result).toMatchObject({ passed: false, missingAccount: true, actual: null })
  })

  it('requires every child in an "all" group', async () => {
    const all: Rule = { kind: 'all', rules: [pass, mrdOnBase] }
    const measure = measureFrom(
      new Map<Condition, bigint | null>([
        [pass, 1n],
        [mrdOnBase, 10n],
      ]),
    )
    expect((await evaluateRule(all, measure)).passed).toBe(false)
  })

  it('collects leaf conditions for batching', () => {
    expect(collectConditions(lounge)).toEqual([pass, mrdOnBase, mrdOnSolana])
  })
})

describe('rule schema', () => {
  it('accepts nested groups', () => {
    expect(ruleSchema.safeParse(lounge).success).toBe(true)
  })

  it('rejects malformed thresholds and empty groups', () => {
    expect(ruleSchema.safeParse({ ...mrdOnBase, minAmount: '-1' }).success).toBe(false)
    expect(ruleSchema.safeParse({ kind: 'all', rules: [] }).success).toBe(false)
    expect(ruleSchema.safeParse({ ...pass, chain: 'solana:devnet' }).success).toBe(false)
  })
})
