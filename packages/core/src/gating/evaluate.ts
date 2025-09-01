import { formatUnits, parseUnits } from 'viem'
import { chainByCaip2 } from '../chains.js'
import { isGroup, type Condition, type Rule } from './rules.js'

/**
 * Returns the holder's balance for a condition in base units (or a count for NFTs), or `null`
 * when the holder has no linked account on that chain.
 */
export type MeasureFn = (condition: Condition) => Promise<bigint | null>

export interface ConditionResult {
  type: 'condition'
  passed: boolean
  condition: Condition
  label: string
  required: string
  actual: string | null
  /** Set when the holder has no account on the condition's chain. */
  missingAccount: boolean
}

export interface GroupResult {
  type: 'group'
  passed: boolean
  kind: 'all' | 'any'
  label: string
  children: EvaluationResult[]
}

export type EvaluationResult = ConditionResult | GroupResult

export async function evaluateRule(rule: Rule, measure: MeasureFn): Promise<EvaluationResult> {
  if (isGroup(rule)) {
    const children = await Promise.all(rule.rules.map((child) => evaluateRule(child, measure)))
    const passed =
      rule.kind === 'all' ? children.every((c) => c.passed) : children.some((c) => c.passed)
    return {
      type: 'group',
      passed,
      kind: rule.kind,
      label: rule.label ?? (rule.kind === 'all' ? 'All of the following' : 'Any of the following'),
      children,
    }
  }

  const actual = await measure(rule)
  const { required, decimals } = threshold(rule)
  return {
    type: 'condition',
    passed: actual !== null && actual >= required,
    condition: rule,
    label: describeCondition(rule),
    required: formatUnits(required, decimals),
    actual: actual === null ? null : formatUnits(actual, decimals),
    missingAccount: actual === null,
  }
}

export function threshold(condition: Condition): { required: bigint; decimals: number } {
  switch (condition.kind) {
    case 'erc721':
      return { required: BigInt(condition.minCount), decimals: 0 }
    case 'erc20':
    case 'spl':
      return {
        required: parseUnits(condition.minAmount, condition.decimals),
        decimals: condition.decimals,
      }
    case 'native': {
      const decimals = chainByCaip2(condition.chain)?.nativeDecimals ?? 18
      return { required: parseUnits(condition.minAmount, decimals), decimals }
    }
  }
}

export function describeCondition(condition: Condition): string {
  const chain = chainByCaip2(condition.chain)?.shortName ?? condition.chain
  switch (condition.kind) {
    case 'erc721':
      return condition.minCount === 1
        ? `Hold a ${condition.name} on ${chain}`
        : `Hold ${condition.minCount} ${condition.name} on ${chain}`
    case 'erc20':
    case 'spl':
      return `Hold ${condition.minAmount} ${condition.symbol} on ${chain}`
    case 'native':
      return `Hold ${condition.minAmount} ${chainByCaip2(condition.chain)?.nativeSymbol ?? 'native token'} on ${chain}`
  }
}
