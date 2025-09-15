import { address, type Rpc, type SolanaRpcApi } from '@solana/kit'
import type { Hex } from 'viem'
import { AppError } from '../domain/errors.js'
import type { BalanceReader } from '../ports/chains.js'
import { TtlCache } from './cache.js'
import { erc20Abi } from './evm/abis.js'
import type { EvmChainHandle } from './evm/clients.js'

/** ERC-20 and ERC-721 share the `balanceOf(address)` signature, so one ABI covers both. */
export class MultichainBalanceReader implements BalanceReader {
  private readonly cache = new TtlCache<bigint>(15_000)

  constructor(
    private readonly evm: Map<string, EvmChainHandle>,
    private readonly solana: Rpc<SolanaRpcApi> | undefined,
  ) {}

  native(chain: string, owner: string): Promise<bigint> {
    return this.cache.get(`native:${chain}:${owner}`, async () => {
      if (chain.startsWith('solana:')) {
        const { value } = await this.solanaRpc().getBalance(address(owner)).send()
        return BigInt(value)
      }
      return this.evmClient(chain).getBalance({ address: owner as Hex })
    })
  }

  erc20(chain: string, token: string, owner: string): Promise<bigint> {
    return this.cache.get(`erc20:${chain}:${token}:${owner}`, () =>
      this.balanceOf(chain, token, owner),
    )
  }

  erc721(chain: string, collection: string, owner: string): Promise<bigint> {
    return this.cache.get(`erc721:${chain}:${collection}:${owner}`, () =>
      this.balanceOf(chain, collection, owner),
    )
  }

  spl(_chain: string, mint: string, owner: string): Promise<bigint> {
    return this.cache.get(`spl:${mint}:${owner}`, async () => {
      const { value } = await this.solanaRpc()
        .getTokenAccountsByOwner(
          address(owner),
          { mint: address(mint) },
          { encoding: 'jsonParsed' },
        )
        .send()
      return value.reduce(
        (sum, item) => sum + BigInt(item.account.data.parsed.info.tokenAmount.amount),
        0n,
      )
    })
  }

  private balanceOf(chain: string, contract: string, owner: string): Promise<bigint> {
    return this.evmClient(chain).readContract({
      address: contract as Hex,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner as Hex],
    })
  }

  private evmClient(chain: string) {
    const handle = this.evm.get(chain)
    if (!handle) throw new AppError('not_configured', `No RPC configured for ${chain}`)
    return handle.client
  }

  private solanaRpc() {
    if (!this.solana) throw new AppError('not_configured', 'No Solana RPC configured')
    return this.solana
  }
}
