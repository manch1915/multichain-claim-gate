import { z } from 'zod'

const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Expected a positive decimal number, e.g. "100" or "0.05"')

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Expected an EVM address')
const caip2Evm = z.string().regex(/^eip155:\d+$/, 'Expected an EVM CAIP-2 chain id')
const caip2Solana = z.string().regex(/^solana:\w+$/, 'Expected a Solana CAIP-2 chain id')

export const erc721Condition = z.object({
  kind: z.literal('erc721'),
  chain: caip2Evm,
  contract: evmAddress,
  name: z.string().min(1).max(60),
  minCount: z.number().int().min(1).default(1),
})

export const erc20Condition = z.object({
  kind: z.literal('erc20'),
  chain: caip2Evm,
  contract: evmAddress,
  symbol: z.string().min(1).max(12),
  decimals: z.number().int().min(0).max(36),
  minAmount: decimalString,
})

export const nativeCondition = z.object({
  kind: z.literal('native'),
  chain: z.union([caip2Evm, caip2Solana]),
  minAmount: decimalString,
})

export const splCondition = z.object({
  kind: z.literal('spl'),
  chain: caip2Solana,
  mint: z.string().min(32).max(44),
  symbol: z.string().min(1).max(12),
  decimals: z.number().int().min(0).max(18),
  minAmount: decimalString,
})

export const condition = z.discriminatedUnion('kind', [
  erc721Condition,
  erc20Condition,
  nativeCondition,
  splCondition,
])

export type Condition = z.infer<typeof condition>

export interface RuleGroup {
  kind: 'all' | 'any'
  label?: string | undefined
  rules: Rule[]
}

export type Rule = Condition | RuleGroup

export const rule: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    condition,
    z.object({
      kind: z.enum(['all', 'any']),
      label: z.string().max(80).optional(),
      rules: z.array(rule).min(1).max(10),
    }),
  ]),
)

export function isGroup(value: Rule): value is RuleGroup {
  return value.kind === 'all' || value.kind === 'any'
}

/** Walks the tree and returns every leaf condition, used to prefetch balances in one batch. */
export function collectConditions(value: Rule): Condition[] {
  return isGroup(value) ? value.rules.flatMap(collectConditions) : [value]
}

export function ruleDepth(value: Rule): number {
  return isGroup(value) ? 1 + Math.max(...value.rules.map(ruleDepth)) : 0
}
