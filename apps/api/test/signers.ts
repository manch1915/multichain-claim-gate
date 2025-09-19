import { generateKeyPairSigner, getBase58Decoder, signBytes } from '@solana/kit'
import type { FastifyInstance } from 'fastify'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { BASE, DEVNET, cookieFrom } from './helpers.js'

export function evmWallet() {
  return privateKeyToAccount(generatePrivateKey())
}

export async function solanaWallet() {
  const signer = await generateKeyPairSigner()
  return {
    address: signer.address as string,
    sign: async (message: string) => {
      const signature = await signBytes(
        signer.keyPair.privateKey,
        new TextEncoder().encode(message),
      )
      return getBase58Decoder().decode(signature)
    },
  }
}

export async function requestMessage(app: FastifyInstance, accountId: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/message',
    payload: { accountId },
  })
  if (response.statusCode !== 200) throw new Error(response.body)
  return response.json<{ message: string }>().message
}

export async function signInEvm(
  app: FastifyInstance,
  wallet = evmWallet(),
  cookie?: string,
): Promise<{ cookie: string; address: string }> {
  const message = await requestMessage(app, `${BASE}:${wallet.address}`)
  const signature = await wallet.signMessage({ message })
  const response = await app.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { message, signature },
    headers: cookie ? { cookie } : {},
  })
  if (response.statusCode !== 200) throw new Error(response.body)
  return { cookie: cookie ?? cookieFrom(response), address: wallet.address }
}

export async function signInSolana(
  app: FastifyInstance,
  cookie?: string,
): Promise<{ cookie: string; address: string }> {
  const wallet = await solanaWallet()
  const message = await requestMessage(app, `${DEVNET}:${wallet.address}`)
  const response = await app.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { message, signature: await wallet.sign(message) },
    headers: cookie ? { cookie } : {},
  })
  if (response.statusCode !== 200) throw new Error(response.body)
  return { cookie: cookie ?? cookieFrom(response), address: wallet.address }
}
