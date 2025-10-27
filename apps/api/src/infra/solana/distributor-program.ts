import { createHash } from 'node:crypto'
import {
  AccountRole,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from '@solana/kit'

// Hand-written client for programs/merkle-distributor. Discriminators follow Anchor's
// sha256("global:<name>")[..8] and sha256("account:<Name>")[..8] conventions.
const discriminator = (preimage: string) =>
  createHash('sha256').update(preimage).digest().subarray(0, 8)

const INITIALIZE = discriminator('global:initialize')
const CLAIM = discriminator('global:claim')
const UPDATE_ROOT = discriminator('global:update_root')
export const DISTRIBUTOR_ACCOUNT = discriminator('account:Distributor')
export const CLAIM_STATUS_ACCOUNT = discriminator('account:ClaimStatus')

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as Address
export const SYSTEM_PROGRAM = '11111111111111111111111111111111' as Address

const encoder = getAddressEncoder()
const decoder = getAddressDecoder()

export interface DistributorAccounts {
  programId: Address
  distributor: Address
  mint: Address
  vault: Address
}

export async function claimStatusAddress(
  programId: Address,
  distributor: Address,
  claimant: Address,
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [Buffer.from('claim'), encoder.encode(distributor), encoder.encode(claimant)],
  })
  return pda
}

export async function associatedTokenAddress(owner: Address, mint: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [encoder.encode(owner), encoder.encode(TOKEN_PROGRAM), encoder.encode(mint)],
  })
  return pda
}

export async function claimInstruction(
  accounts: DistributorAccounts,
  payer: Address,
  claimant: Address,
  amount: bigint,
  proof: Uint8Array[],
): Promise<Instruction> {
  const data = Buffer.alloc(8 + 8 + 4 + proof.length * 32)
  CLAIM.copy(data, 0)
  data.writeBigUInt64LE(amount, 8)
  data.writeUInt32LE(proof.length, 16)
  proof.forEach((node, i) => Buffer.from(node).copy(data, 20 + i * 32))

  return {
    programAddress: accounts.programId,
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: claimant, role: AccountRole.READONLY_SIGNER },
      { address: accounts.distributor, role: AccountRole.WRITABLE },
      {
        address: await claimStatusAddress(accounts.programId, accounts.distributor, claimant),
        role: AccountRole.WRITABLE,
      },
      { address: accounts.mint, role: AccountRole.READONLY },
      { address: accounts.vault, role: AccountRole.WRITABLE },
      {
        address: await associatedTokenAddress(claimant, accounts.mint),
        role: AccountRole.WRITABLE,
      },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
  }
}

export async function distributorAddress(
  programId: Address,
  mint: Address,
  authority: Address,
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [Buffer.from('distributor'), encoder.encode(mint), encoder.encode(authority)],
  })
  return pda
}

export function initializeInstruction(
  accounts: DistributorAccounts,
  authority: Address,
  root: Uint8Array,
): Instruction {
  return {
    programAddress: accounts.programId,
    accounts: [
      { address: authority, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.mint, role: AccountRole.READONLY },
      { address: accounts.distributor, role: AccountRole.WRITABLE },
      { address: accounts.vault, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(Buffer.concat([INITIALIZE, Buffer.from(root)])),
  }
}

export function updateRootInstruction(
  accounts: DistributorAccounts,
  authority: Address,
  root: Uint8Array,
): Instruction {
  if (root.length !== 32) throw new Error('Merkle root must be 32 bytes')
  return {
    programAddress: accounts.programId,
    accounts: [
      { address: authority, role: AccountRole.READONLY_SIGNER },
      { address: accounts.distributor, role: AccountRole.WRITABLE },
    ],
    data: new Uint8Array(Buffer.concat([UPDATE_ROOT, Buffer.from(root)])),
  }
}

export interface DecodedDistributor {
  authority: Address
  mint: Address
  vault: Address
  root: string
  version: bigint
  totalClaimed: bigint
  claimants: bigint
  paused: boolean
}

export function decodeDistributor(data: Uint8Array): DecodedDistributor {
  const buffer = Buffer.from(data)
  if (!buffer.subarray(0, 8).equals(DISTRIBUTOR_ACCOUNT)) {
    throw new Error('Account is not a Distributor')
  }
  const key = (offset: number) => decodeAddress(buffer.subarray(offset, offset + 32))
  return {
    authority: key(8),
    mint: key(40),
    vault: key(72),
    root: buffer.subarray(104, 136).toString('hex'),
    version: buffer.readBigUInt64LE(136),
    totalClaimed: buffer.readBigUInt64LE(144),
    claimants: buffer.readBigUInt64LE(152),
    paused: buffer[160] === 1,
  }
}

export function decodeClaimedAmount(data: Uint8Array): bigint {
  const buffer = Buffer.from(data)
  if (!buffer.subarray(0, 8).equals(CLAIM_STATUS_ACCOUNT)) {
    throw new Error('Account is not a ClaimStatus')
  }
  return buffer.readBigUInt64LE(40)
}

function decodeAddress(bytes: Uint8Array): Address {
  return decoder.decode(bytes)
}
