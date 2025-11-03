// Rule helpers with no runtime dependencies, safe to ship to the browser.
import { chainByCaip2 } from '../chains.js'
import type { Condition, Rule, RuleGroup } from './rules.js'

export function isGroup(value: Rule): value is RuleGroup {
  return value.kind === 'all' || value.kind === 'any'
}

/** Walks the tree and returns every leaf condition. */
export function collectConditions(value: Rule): Condition[] {
  return isGroup(value) ? value.rules.flatMap(collectConditions) : [value]
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
