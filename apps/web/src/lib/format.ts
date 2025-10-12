import { formatUnits } from 'viem'

/** Base-unit string to a readable amount: grouped thousands, trailing zeros trimmed. */
export function formatAmount(base: string | bigint, decimals: number, maxFraction = 4): string {
  const value = formatUnits(typeof base === 'bigint' ? base : BigInt(base || '0'), decimals)
  const [whole = '0', fraction = ''] = value.split('.')
  const grouped = Number(whole).toLocaleString('en-US')
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, '')
  return trimmed ? `${grouped}.${trimmed}` : grouped
}

export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return 'pending'
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export function shortHash(hash: string, size = 6): string {
  return hash.length > size * 2 + 3 ? `${hash.slice(0, size + 2)}…${hash.slice(-size)}` : hash
}
