import { chainByCaip2, familyOfChain } from '@mcg/core'
import { createSiweMessage } from 'viem/siwe'

export interface SignInMessageInput {
  chain: string
  address: string
  domain: string
  uri: string
  nonce: string
  issuedAt: Date
  expirationTime: Date
  statement: string
}

/**
 * EIP-4361 for EVM accounts and the matching Sign In With Solana text for Solana accounts.
 * The server builds the exact string the wallet signs, so verification only has to compare it.
 */
export function buildSignInMessage(input: SignInMessageInput): string {
  if (familyOfChain(input.chain) === 'evm') {
    return createSiweMessage({
      address: input.address as `0x${string}`,
      chainId: Number(input.chain.split(':')[1]),
      domain: input.domain,
      uri: input.uri,
      version: '1',
      nonce: input.nonce,
      issuedAt: input.issuedAt,
      expirationTime: input.expirationTime,
      statement: input.statement,
    })
  }

  const cluster = chainByCaip2(input.chain)?.reference ?? input.chain
  return [
    `${input.domain} wants you to sign in with your Solana account:`,
    input.address,
    '',
    input.statement,
    '',
    `URI: ${input.uri}`,
    'Version: 1',
    `Chain ID: ${cluster}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expirationTime.toISOString()}`,
  ].join('\n')
}

export function extractNonce(message: string): string | undefined {
  return /^Nonce: ([A-Za-z0-9]{8,})$/m.exec(message)?.[1]
}
