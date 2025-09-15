import type { PriceProvider } from '../../ports/chains.js'
import { TtlCache } from '../cache.js'

const IDS: Record<string, string> = { ETH: 'ethereum', SOL: 'solana', USDC: 'usd-coin' }

/** Mainnet reference prices from CoinGecko's free endpoint. Testnet tokens themselves are worthless. */
export class CoinGeckoPriceProvider implements PriceProvider {
  private readonly cache = new TtlCache<Record<string, number>>(5 * 60_000)

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  prices(): Promise<Record<string, number>> {
    return this.cache.get('prices', async () => {
      const ids = Object.values(IDS).join(',')
      const response = await this.fetchImpl(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6_000) },
      )
      if (!response.ok) throw new Error(`CoinGecko responded with ${response.status}`)
      const body = (await response.json()) as Record<string, { usd?: number }>
      return Object.fromEntries(
        Object.entries(IDS)
          .map(([symbol, id]) => [symbol, body[id]?.usd] as const)
          .filter((entry): entry is readonly [string, number] => typeof entry[1] === 'number'),
      )
    })
  }
}
