import { getBase58Encoder } from '@solana/kit'

/** Accepts a base58 secret key or the JSON byte array that solana-keygen writes. */
export function parseSolanaSecret(secret: string): Uint8Array {
  const trimmed = secret.trim()
  if (trimmed.startsWith('[')) return Uint8Array.from(JSON.parse(trimmed) as number[])
  return new Uint8Array(getBase58Encoder().encode(trimmed))
}
