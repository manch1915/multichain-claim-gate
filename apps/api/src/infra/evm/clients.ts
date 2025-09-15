import { createPublicClient, http, type Chain, type PublicClient } from 'viem'
import { anvil, baseSepolia, sepolia } from 'viem/chains'

export interface EvmRpcConfig {
  sepolia: string
  baseSepolia: string
  anvil?: string | undefined
}

export interface EvmChainHandle {
  caip2: string
  chain: Chain
  client: PublicClient
  rpcUrl: string
}

export function createEvmClients(rpc: EvmRpcConfig): Map<string, EvmChainHandle> {
  const entries: [Chain, string | undefined][] = [
    [sepolia, rpc.sepolia],
    [baseSepolia, rpc.baseSepolia],
    [anvil, rpc.anvil],
  ]
  const handles = new Map<string, EvmChainHandle>()
  for (const [chain, url] of entries) {
    if (!url) continue
    const caip2 = `eip155:${chain.id}`
    const client = createPublicClient({
      chain,
      transport: http(url, { retryCount: 2, timeout: 15_000 }),
      batch: { multicall: chain.id !== anvil.id },
    }) as PublicClient
    handles.set(caip2, { caip2, chain, client, rpcUrl: url })
  }
  return handles
}
