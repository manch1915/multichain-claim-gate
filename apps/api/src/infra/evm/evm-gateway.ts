import { BaseError, ContractFunctionRevertedError, type Hex } from 'viem'
import type { EvmDeployment } from '../../config.js'
import { AppError } from '../../domain/errors.js'
import type { EvmCall, EvmDistributorState, EvmGateway } from '../../ports/chains.js'
import { TtlCache } from '../cache.js'
import { accessPassAbi, distributorAbi } from './abis.js'
import { encodeClaim, encodeMintPass, encodeSetRoot } from './calls.js'
import type { EvmChainHandle } from './clients.js'

const REVERT_MESSAGES: Record<string, string> = {
  InvalidProof: 'The proof does not match the current root. Refresh and try again.',
  NothingToClaim: 'This wallet already claimed its allocation',
  EnforcedPause: 'Claims are paused for now',
}

export class ViemEvmGateway implements EvmGateway {
  private readonly stateCache = new TtlCache<EvmDistributorState>(4_000)

  constructor(
    private readonly handles: Map<string, EvmChainHandle>,
    private readonly deployments: Map<string, EvmDeployment>,
    private readonly sponsorAddress: `0x${string}`,
    private readonly passChainId: string | undefined,
  ) {}

  supportedChains(): string[] {
    return [...this.deployments.keys()].filter((chain) => this.handles.has(chain))
  }

  passChain(): string | undefined {
    return this.passChainId && this.deployments.has(this.passChainId) ? this.passChainId : undefined
  }

  setRootCall(chain: string, root: string): EvmCall {
    return encodeSetRoot(this.deployment(chain).distributor as Hex, root)
  }

  claimCall(chain: string, account: string, amount: bigint, proof: Hex[]): EvmCall {
    return encodeClaim(this.deployment(chain).distributor as Hex, account, amount, proof)
  }

  mintPassCall(chain: string, to: string): EvmCall {
    return encodeMintPass(this.deployment(chain).accessPass as Hex, to)
  }

  distributorState(chain: string): Promise<EvmDistributorState> {
    return this.stateCache.get(chain, async () => {
      const { client } = this.handle(chain)
      const address = this.deployment(chain).distributor as Hex
      const [root, paused] = await Promise.all([
        client.readContract({ address, abi: distributorAbi, functionName: 'merkleRoot' }),
        client.readContract({ address, abi: distributorAbi, functionName: 'paused' }),
      ])
      return { root, paused }
    })
  }

  async claimedAmount(chain: string, account: string): Promise<bigint> {
    return this.handle(chain).client.readContract({
      address: this.deployment(chain).distributor as Hex,
      abi: distributorAbi,
      functionName: 'claimed',
      args: [account as Hex],
    })
  }

  async simulateClaim(chain: string, account: string, amount: bigint, proof: Hex[]): Promise<void> {
    try {
      await this.handle(chain).client.simulateContract({
        address: this.deployment(chain).distributor as Hex,
        abi: distributorAbi,
        functionName: 'claim',
        args: [account as Hex, amount, proof],
        account: this.sponsorAddress,
      })
    } catch (error) {
      const name = revertName(error)
      if (name && REVERT_MESSAGES[name]) {
        throw new AppError(
          name === 'NothingToClaim' ? 'already_claimed' : 'bad_request',
          REVERT_MESSAGES[name],
        )
      }
      throw new AppError('chain_error', 'Could not simulate the claim on this network')
    }
  }

  async hasPass(chain: string, account: string): Promise<boolean> {
    return this.handle(chain).client.readContract({
      address: this.deployment(chain).accessPass as Hex,
      abi: accessPassAbi,
      functionName: 'hasMinted',
      args: [account as Hex],
    })
  }

  /** Drops cached roots after we publish, so eligibility reflects the new root immediately. */
  invalidate(chain: string): void {
    this.stateCache.delete(chain)
  }

  private handle(chain: string): EvmChainHandle {
    const handle = this.handles.get(chain)
    if (!handle) throw new AppError('not_configured', `No RPC configured for ${chain}`)
    return handle
  }

  private deployment(chain: string): EvmDeployment {
    const deployment = this.deployments.get(chain)
    if (!deployment) throw new AppError('not_configured', `Contracts are not deployed on ${chain}`)
    return deployment
  }
}

function revertName(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined
  const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError)
  return revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined
}
