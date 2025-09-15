import { familyOfChain } from '@mcg/core'
import {
  getBase58Encoder,
  getPublicKeyFromAddress,
  verifySignature,
  address as toSolanaAddress,
  type SignatureBytes,
} from '@solana/kit'
import { isHex, verifyMessage, type PublicClient } from 'viem'
import type { SignatureVerifier } from '../../ports/auth.js'

export class MultichainSignatureVerifier implements SignatureVerifier {
  constructor(private readonly evmClients: Map<string, PublicClient>) {}

  async verify(
    chain: string,
    address: string,
    message: string,
    signature: string,
  ): Promise<boolean> {
    return familyOfChain(chain) === 'evm'
      ? this.verifyEvm(chain, address, message, signature)
      : verifySolana(address, message, signature)
  }

  private async verifyEvm(
    chain: string,
    address: string,
    message: string,
    signature: string,
  ): Promise<boolean> {
    if (!isHex(signature)) return false
    const params = { address: address as `0x${string}`, message, signature }
    if (await verifyMessage(params).catch(() => false)) return true

    // Smart wallets (Coinbase Smart Wallet, 7702 accounts) sign via ERC-1271 or ERC-6492,
    // which needs an RPC call against the chain they signed in on.
    const client = this.evmClients.get(chain)
    return client ? client.verifyMessage(params).catch(() => false) : false
  }
}

async function verifySolana(address: string, message: string, signature: string): Promise<boolean> {
  let key: Awaited<ReturnType<typeof getPublicKeyFromAddress>>
  try {
    key = await getPublicKeyFromAddress(toSolanaAddress(address))
  } catch {
    return false
  }
  const data = new TextEncoder().encode(message)
  for (const bytes of signatureCandidates(signature)) {
    if (await verifySignature(key, bytes, data).catch(() => false)) return true
  }
  return false
}

/** Wallets disagree on encoding: AppKit returns base58, some return hex or base64. */
export function signatureCandidates(signature: string): SignatureBytes[] {
  const decoders: (() => Uint8Array)[] = [
    () => new Uint8Array(getBase58Encoder().encode(signature)),
    () => Uint8Array.from(Buffer.from(signature.replace(/^0x/, ''), 'hex')),
    () => Uint8Array.from(Buffer.from(signature, 'base64')),
  ]
  const result: SignatureBytes[] = []
  for (const decode of decoders) {
    try {
      const bytes = decode()
      if (bytes.length === 64) result.push(bytes as SignatureBytes)
    } catch {
      // not this encoding
    }
  }
  return result
}
