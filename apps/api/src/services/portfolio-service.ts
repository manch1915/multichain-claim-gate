import { chainByCaip2, familyOfChain } from '@mcg/core'
import type { Session } from '../domain/models.js'
import type {
  BalanceReader,
  HistoryProvider,
  PriceProvider,
  TxHistoryItem,
} from '../ports/chains.js'

export interface TrackedAsset {
  chain: string
  kind: 'erc20' | 'erc721' | 'spl'
  address: string
  symbol: string
  name: string
  decimals: number
}

export interface AssetBalance {
  symbol: string
  name: string
  kind: 'native' | TrackedAsset['kind']
  address: string | null
  decimals: number
  balance: string
  error?: string
}

export interface ChainPortfolio {
  chain: string
  name: string
  address: string
  assets: AssetBalance[]
  history: TxHistoryItem[]
  historyError?: string
}

export class PortfolioService {
  constructor(
    private readonly chains: string[],
    private readonly assets: TrackedAsset[],
    private readonly balances: BalanceReader,
    private readonly history: HistoryProvider,
    private readonly prices: PriceProvider,
  ) {}

  async forSession(session: Session) {
    const tasks: Promise<ChainPortfolio>[] = []
    for (const chain of this.chains) {
      const account = session.accounts.find((item) => item.family === familyOfChain(chain))
      if (account) tasks.push(this.chainPortfolio(chain, account.address))
    }
    const [chains, prices] = await Promise.all([
      Promise.all(tasks),
      this.prices.prices().catch(() => ({})),
    ])
    return { chains, referencePrices: prices, updatedAt: new Date().toISOString() }
  }

  private async chainPortfolio(chain: string, address: string): Promise<ChainPortfolio> {
    const info = chainByCaip2(chain)
    const nativeSymbol = info?.nativeSymbol ?? 'ETH'
    const native = this.read(
      {
        symbol: nativeSymbol,
        name: nativeSymbol === 'SOL' ? 'Solana' : 'Ether',
        kind: 'native',
        address: null,
        decimals: info?.nativeDecimals ?? 18,
      },
      () => this.balances.native(chain, address),
    )
    const tracked = this.assets
      .filter((asset) => asset.chain === chain)
      .map((asset) =>
        this.read(
          {
            symbol: asset.symbol,
            name: asset.name,
            kind: asset.kind,
            address: asset.address,
            decimals: asset.decimals,
          },
          () => {
            if (asset.kind === 'erc20') return this.balances.erc20(chain, asset.address, address)
            if (asset.kind === 'erc721') return this.balances.erc721(chain, asset.address, address)
            return this.balances.spl(chain, asset.address, address)
          },
        ),
      )

    const [assets, history] = await Promise.all([
      Promise.all([native, ...tracked]),
      this.history
        .history(chain, address, 8)
        .then((items) => ({ items }))
        .catch(() => ({ items: [], error: true })),
    ])

    return {
      chain,
      name: info?.name ?? chain,
      address,
      assets,
      history: history.items,
      ...('error' in history
        ? { historyError: 'Transaction history is temporarily unavailable' }
        : {}),
    }
  }

  private async read(
    base: Omit<AssetBalance, 'balance'>,
    load: () => Promise<bigint>,
  ): Promise<AssetBalance> {
    try {
      return { ...base, balance: (await load()).toString() }
    } catch {
      return { ...base, balance: '0', error: 'Could not read the balance' }
    }
  }
}
