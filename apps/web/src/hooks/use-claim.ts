'use client'

import { useAppKitProvider } from '@reown/appkit/react'
import type { Provider as SolanaProvider } from '@reown/appkit-adapter-solana/react'
import { VersionedTransaction } from '@solana/web3.js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCapabilities, useSendCalls } from 'wagmi'
import { api } from '@/lib/api'
import { DEMO_CAMPAIGN } from '@/lib/networks'
import type { ActionView } from '@/lib/types'

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
  const capabilities = useCapabilities({ query: { retry: false } })
  const supported = Boolean(
    (
      capabilities.data as
        Record<number, { paymasterService?: { supported?: boolean } }> | undefined
    )?.[chainId]?.paymasterService?.supported,
  )
  const sendCalls = useSendCalls()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const query = new URLSearchParams({ campaignId: DEMO_CAMPAIGN, chain })
      const { call, paymasterUrl } = await api.get<{
        call: { to: `0x${string}`; data: `0x${string}` }
        paymasterUrl: string | null
      }>(`/claims/evm/call?${query}`)
      if (!paymasterUrl) throw new Error('The wallet paymaster is not enabled on this server')
      const result = await sendCalls.mutateAsync({
        chainId,
        calls: [{ to: call.to, data: call.data }],
        capabilities: { paymasterService: { url: paymasterUrl } },
      })
      return result.id
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['eligibility'] }),
  })

  return { supported, mutation }
}

/** Solana: the backend builds the transaction and pays fee and rent, the wallet only signs. */
export function useSolanaClaim() {
  const { walletProvider } = useAppKitProvider<SolanaProvider>('solana')
  return useMutation({
    mutationFn: async () => {
      if (!walletProvider) throw new Error('Connect a Solana wallet first')
      const prepared = await api.post<{ id: string; transaction: string }>(
        '/claims/solana/prepare',
        {
          campaignId: DEMO_CAMPAIGN,
        },
      )
      const transaction = VersionedTransaction.deserialize(base64ToBytes(prepared.transaction))
      const signed = await walletProvider.signTransaction(transaction)
      const { action } = await api.post<{ action: ActionView }>('/claims/solana/submit', {
        id: prepared.id,
        transaction: bytesToBase64(signed.serialize()),
      })
      return action
    },
  })
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
