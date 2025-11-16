'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DEMO_CAMPAIGN } from '@/lib/networks'
import type { ActionView } from '@/lib/types'
import { isWalletReady, loadWallet, walletsEnabled } from '@/lib/wallet'

/** Gasless claim through the backend sponsor. The wallet is not asked for anything. */
export function useSponsoredClaim(chain: string) {
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ action: ActionView }>('/claims/evm', { campaignId: DEMO_CAMPAIGN, chain }))
        .action,
  })
}

/**
 * Wallets that implement EIP-5792 `paymasterService` (Coinbase Smart Wallet, Base Account) can send
 * the claim themselves; our ERC-7677 proxy decides whether to sponsor it.
 */
export function useWalletPaymasterClaim(chain: string) {
  const chainId = Number(chain.split(':')[1])
  const queryClient = useQueryClient()
  const capability = useQuery({
    queryKey: ['paymaster-capability', chainId],
    // Only asked once the wallet code is loaded anyway; never loads it just for this check.
    enabled: walletsEnabled && isWalletReady(),
    queryFn: async () => (await loadWallet()).supportsPaymaster(chainId),
    staleTime: 60_000,
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const query = new URLSearchParams({ campaignId: DEMO_CAMPAIGN, chain })
      const { call, paymasterUrl } = await api.get<{
        call: { to: `0x${string}`; data: `0x${string}` }
        paymasterUrl: string | null
      }>(`/claims/evm/call?${query}`)
      if (!paymasterUrl) throw new Error('The wallet paymaster is not enabled on this server')
      const wallet = await loadWallet()
      await wallet.sendSponsoredCall({ chainId, to: call.to, data: call.data, paymasterUrl })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['eligibility'] }),
  })

  return { supported: capability.data === true, mutation }
}

/** Solana: the backend builds the transaction and pays fee and rent, the wallet only signs. */
export function useSolanaClaim() {
  return useMutation({
    mutationFn: async () => {
      const prepared = await api.post<{ id: string; transaction: string }>(
        '/claims/solana/prepare',
        { campaignId: DEMO_CAMPAIGN },
      )
      const wallet = await loadWallet()
      const transaction = await wallet.signSolanaTransaction(prepared.transaction)
      const { action } = await api.post<{ action: ActionView }>('/claims/solana/submit', {
        id: prepared.id,
        transaction,
      })
      return action
    },
  })
}
