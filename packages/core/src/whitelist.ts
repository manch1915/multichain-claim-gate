import { parseUnits } from 'viem'
import { detectFamily, normalizeAddress } from './caip.js'
import type { ChainFamily } from './chains.js'

export interface WhitelistEntry {
  line: number
  address: string
  family: ChainFamily
  /** Human-readable amount as written in the file. */
  amount: string
  baseAmount: bigint
}

export interface WhitelistIssue {
  line: number
  message: string
}

export interface WhitelistParseResult {
  entries: WhitelistEntry[]
  issues: WhitelistIssue[]
  totals: Record<ChainFamily, { count: number; amount: bigint }>
}

export interface WhitelistOptions {
  decimals: Record<ChainFamily, number>
  maxRows?: number
}

const AMOUNT = /^\d+(\.\d+)?$/

/**
 * Parses `address,amount` rows. A header row, blank lines and `#` comments are skipped.
 * Commas, semicolons and tabs all work as separators, since spreadsheets export all three.
 */
export function parseWhitelist(text: string, options: WhitelistOptions): WhitelistParseResult {
  const maxRows = options.maxRows ?? 10_000
  const entries: WhitelistEntry[] = []
  const issues: WhitelistIssue[] = []
  const seen = new Map<string, number>()

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  lines.forEach((raw, i) => {
    const line = i + 1
    const content = raw.trim()
    if (content === '' || content.startsWith('#')) return

    const [rawAddress = '', rawAmount = '', ...rest] = content
      .split(/[,;\t]/)
      .map((cell) => cell.trim().replace(/^"|"$/g, ''))

    if (entries.length === 0 && issues.length === 0 && /^address$/i.test(rawAddress)) return
    if (rest.some((cell) => cell !== '')) {
      issues.push({ line, message: 'Expected two columns: address and amount' })
      return
    }

    const family = detectFamily(rawAddress)
    if (!family) {
      issues.push({ line, message: `"${rawAddress}" is not an EVM or Solana address` })
      return
    }
    const normalizedAmount = rawAmount.replace(/_/g, '')
    if (!AMOUNT.test(normalizedAmount)) {
      issues.push({ line, message: `"${rawAmount}" is not a valid amount` })
      return
    }

    const decimals = options.decimals[family]
    const fraction = normalizedAmount.split('.')[1] ?? ''
    if (fraction.length > decimals) {
      issues.push({ line, message: `Amount has more than ${decimals} decimal places` })
      return
    }
    const baseAmount = parseUnits(normalizedAmount, decimals)
    if (baseAmount === 0n) {
      issues.push({ line, message: 'Amount must be greater than zero' })
      return
    }

    const address = normalizeAddress(rawAddress)
    const key = family === 'evm' ? address.toLowerCase() : address
    const firstLine = seen.get(key)
    if (firstLine !== undefined) {
      issues.push({ line, message: `Duplicate address, first listed on line ${firstLine}` })
      return
    }
    if (entries.length >= maxRows) {
      issues.push({ line, message: `The file has more than ${maxRows} rows` })
      return
    }

    seen.set(key, line)
    entries.push({ line, address, family, amount: normalizedAmount, baseAmount })
  })

  const totals: WhitelistParseResult['totals'] = {
    evm: { count: 0, amount: 0n },
    solana: { count: 0, amount: 0n },
  }
  for (const entry of entries) {
    totals[entry.family].count += 1
    totals[entry.family].amount += entry.baseAmount
  }

  return { entries, issues, totals }
}
