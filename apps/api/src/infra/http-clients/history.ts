import { chainByCaip2 } from '@mcg/core'
import { address, type Rpc, type SolanaRpcApi } from '@solana/kit'
import { formatEther } from 'viem'
import type { HistoryProvider, TxHistoryItem } from '../../ports/chains.js'
import { TtlCache } from '../cache.js'

const BLOCKSCOUT: Record<string, string> = {
  'eip155:11155111': 'https://eth-sepolia.blockscout.com',
  'eip155:84532': 'https://base-sepolia.blockscout.com',
}

interface BlockscoutTx {
  hash: string
  timestamp: string | null
  status: 'ok' | 'error' | null
  value: string
  method: string | null
  from: { hash: string }
  to: { hash: string } | null
}

export class ExplorerHistoryProvider implements HistoryProvider {
  private readonly cache = new TtlCache<TxHistoryItem[]>(30_000)

  constructor(
    private readonly solana: Rpc<SolanaRpcApi> | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  history(chain: string, owner: string, limit: number): Promise<TxHistoryItem[]> {
    return this.cache.get(`${chain}:${owner}:${limit}`, () =>
      chain.startsWith('solana:')
        ? this.solanaHistory(chain, owner, limit)
        : this.evmHistory(chain, owner, limit),
    )
  }

  private async evmHistory(chain: string, owner: string, limit: number): Promise<TxHistoryItem[]> {
    const base = BLOCKSCOUT[chain]
    if (!base) return []
    const response = await this.fetchImpl(`${base}/api/v2/addresses/${owner}/transactions`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`Blockscout responded with ${response.status}`)
    const body = (await response.json()) as { items?: BlockscoutTx[] }
    const explorer = chainByCaip2(chain)?.explorer

    return (body.items ?? []).slice(0, limit).map((tx) => {
      const from = tx.from.hash.toLowerCase()
      const to = tx.to?.hash.toLowerCase()
      const me = owner.toLowerCase()
      const direction = from === me && to === me ? 'self' : from === me ? 'out' : 'in'
      const value = BigInt(tx.value || '0')
      const summary = tx.method
        ? humanizeMethod(tx.method)
        : value > 0n
          ? `${direction === 'in' ? 'Received' : 'Sent'} ${trimAmount(formatEther(value))} ETH`
          : 'Contract call'
      return {
        chain,
        hash: tx.hash,
        timestamp: tx.timestamp,
        direction,
        summary,
        status: tx.status === 'error' ? 'failed' : 'success',
        url: explorer?.tx(tx.hash) ?? '',
      }
    })
  }

  private async solanaHistory(
    chain: string,
    owner: string,
    limit: number,
  ): Promise<TxHistoryItem[]> {
    if (!this.solana) return []
    const signatures = await this.solana.getSignaturesForAddress(address(owner), { limit }).send()
    const explorer = chainByCaip2(chain)?.explorer
    return signatures.map((item) => ({
      chain,
      hash: item.signature,
      timestamp: item.blockTime ? new Date(Number(item.blockTime) * 1000).toISOString() : null,
      direction: 'self',
      summary: item.memo ?? 'Transaction',
      status: item.err ? 'failed' : 'success',
      url: explorer?.tx(item.signature) ?? '',
    }))
  }
}

function humanizeMethod(method: string): string {
  const words = method.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function trimAmount(value: string): string {
  const [whole, fraction = ''] = value.split('.')
  const short = fraction.slice(0, 4).replace(/0+$/, '')
  return short ? `${whole}.${short}` : (whole ?? '0')
}
