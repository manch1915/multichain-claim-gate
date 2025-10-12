import type { SIWXConfig, SIWXMessage, SIWXSession } from '@reown/appkit'
import type { QueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { SessionView } from './types'

type CaipNetworkId = SIWXMessage.Input['chainId']

const familyOf = (chainId: string) => (chainId.startsWith('solana:') ? 'solana' : 'evm')
const sameAddress = (a: string, b: string) =>
  a.startsWith('0x') ? a.toLowerCase() === b.toLowerCase() : a === b

/**
 * Sign-in with X backed by our API. The server writes the exact SIWE or SIWS text and keeps the
 * nonce, so the browser never builds a message it could tamper with. Sessions live in an httpOnly
 * cookie; nothing about them is stored in localStorage.
 */
export function createSiwx(queryClient: QueryClient): SIWXConfig {
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['session'] })

  async function currentSession(): Promise<SessionView | null> {
    const { session } = await api.get<{ session: SessionView | null }>('/auth/session')
    return session
  }

  async function addSession(session: SIWXSession) {
    await api.post('/auth/verify', { message: session.message, signature: session.signature })
    await refresh()
  }

  return {
    async createMessage(input) {
      const { message } = await api.post<{ message: string }>('/auth/message', {
        accountId: `${input.chainId}:${input.accountAddress}`,
      })
      const field = (name: string) => new RegExp(`^${name}: (.+)$`, 'm').exec(message)?.[1]
      return {
        ...input,
        domain: window.location.host,
        uri: window.location.origin,
        version: '1',
        nonce: field('Nonce') ?? '',
        issuedAt: field('Issued At'),
        expirationTime: field('Expiration Time'),
        toString: () => message,
      }
    },

    addSession,

    async revokeSession(chainId, address) {
      const session = await currentSession()
      const account = session?.accounts.find((item) => item.family === familyOf(chainId))
      if (account && sameAddress(account.address, address)) {
        await api.post('/auth/sign-out', { family: familyOf(chainId) })
        await refresh()
      }
    },

    async setSessions(sessions) {
      if (sessions.length === 0) {
        await api.post('/auth/sign-out', {})
        await refresh()
        return
      }
      for (const session of sessions) await addSession(session)
    },

    // One signature covers every network of the same family, so switching from Base Sepolia to
    // Sepolia does not ask the user to sign again.
    async getSessions(chainId: CaipNetworkId, address: string) {
      const session = await currentSession().catch(() => null)
      const account = session?.accounts.find((item) => item.family === familyOf(chainId))
      if (!account || !sameAddress(account.address, address)) return []
      return [
        {
          data: {
            accountAddress: address,
            chainId,
            domain: window.location.host,
            uri: window.location.origin,
            version: '1',
            nonce: 'server-session',
          },
          message: '',
          signature: '',
        },
      ]
    },

    getRequired: () => true,
    signOutOnDisconnect: true,
  }
}
