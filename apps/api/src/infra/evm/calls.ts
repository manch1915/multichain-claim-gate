import { encodeFunctionData, type Hex } from 'viem'
import type { EvmCall } from '../../ports/chains.js'
import { accessPassAbi, distributorAbi } from './abis.js'

export function encodeSetRoot(distributor: `0x${string}`, root: string): EvmCall {
  return {
    to: distributor,
    data: encodeFunctionData({
      abi: distributorAbi,
      functionName: 'setMerkleRoot',
      args: [root as Hex],
    }),
  }
}

export function encodeClaim(
  distributor: `0x${string}`,
  account: string,
  amount: bigint,
  proof: Hex[],
): EvmCall {
  return {
    to: distributor,
    data: encodeFunctionData({
      abi: distributorAbi,
      functionName: 'claim',
      args: [account as Hex, amount, proof],
    }),
  }
}

export function encodeMintPass(pass: `0x${string}`, to: string): EvmCall {
  return {
    to: pass,
    data: encodeFunctionData({ abi: accessPassAbi, functionName: 'mintTo', args: [to as Hex] }),
  }
}
