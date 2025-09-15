import { createSmartAccountClient } from 'permissionless'
import { to7702SimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { createWalletClient, http, type LocalAccount } from 'viem'
import { entryPoint08Address } from 'viem/account-abstraction'
import { AppError } from '../../domain/errors.js'
import type { EvmCall, EvmSponsor, SponsorSubmission } from '../../ports/chains.js'
import type { EvmChainHandle } from './clients.js'

/** Sends one submission per chain at a time, so nonces never race. */
class ChainQueue {
  private readonly tails = new Map<string, Promise<unknown>>()

  run<T>(chain: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(chain) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(task)
    this.tails.set(chain, next)
    return next
  }
}

/**
 * The sponsor EOA delegates to Simple7702Account (EIP-7702) and sends ERC-4337 user operations
 * that Pimlico's verifying paymaster pays for. The key itself never needs ETH.
 */
export class PimlicoSponsor implements EvmSponsor {
  readonly method = 'sponsored-userop' as const
  private readonly queue = new ChainQueue()
  private readonly clients = new Map<string, ReturnType<PimlicoSponsor['createClient']>>()

  constructor(
    private readonly owner: LocalAccount,
    private readonly handles: Map<string, EvmChainHandle>,
    private readonly apiKey: string,
    private readonly sponsorshipPolicyId: string | undefined,
  ) {}

  get address() {
    return this.owner.address
  }

  submit(chain: string, calls: EvmCall[]): Promise<SponsorSubmission> {
    return this.queue.run(chain, async () => {
      const { smartClient, account, handle } = await this.client(chain)
      const delegated = await account.isDeployed()
      const authorization = delegated
        ? undefined
        : await this.owner.signAuthorization?.({
            address: account.authorization.address,
            chainId: handle.chain.id,
            nonce: await handle.client.getTransactionCount({ address: this.owner.address }),
          })

      const hash = await smartClient.sendUserOperation({ calls, authorization })
      return {
        method: this.method,
        hash,
        wait: async () => {
          const receipt = await smartClient.waitForUserOperationReceipt({ hash, timeout: 120_000 })
          return { success: receipt.success, txHash: receipt.receipt.transactionHash }
        },
      }
    })
  }

  private client(chain: string) {
    let client = this.clients.get(chain)
    if (!client) {
      client = this.createClient(chain)
      client.catch(() => this.clients.delete(chain))
      this.clients.set(chain, client)
    }
    return client
  }

  private async createClient(chain: string) {
    const handle = this.handles.get(chain)
    if (!handle) throw new AppError('not_configured', `No RPC configured for ${chain}`)
    const url = `https://api.pimlico.io/v2/${handle.chain.id}/rpc?apikey=${this.apiKey}`
    const entryPoint = { address: entryPoint08Address, version: '0.8' } as const

    const pimlico = createPimlicoClient({ chain: handle.chain, transport: http(url), entryPoint })
    const account = await to7702SimpleSmartAccount({
      client: handle.client,
      owner: this.owner,
      entryPoint,
    })
    const smartClient = createSmartAccountClient({
      account,
      chain: handle.chain,
      client: handle.client,
      bundlerTransport: http(url),
      paymaster: pimlico,
      paymasterContext: this.sponsorshipPolicyId
        ? { sponsorshipPolicyId: this.sponsorshipPolicyId }
        : undefined,
      userOperation: {
        estimateFeesPerGas: async () => (await pimlico.getUserOperationGasPrice()).fast,
      },
    })
    return { smartClient, account, handle }
  }
}

/** Fallback without a paymaster: the sponsor EOA pays gas itself. Also used against Anvil. */
export class DirectSponsor implements EvmSponsor {
  readonly method = 'sponsor-tx' as const
  private readonly queue = new ChainQueue()

  constructor(
    private readonly owner: LocalAccount,
    private readonly handles: Map<string, EvmChainHandle>,
  ) {}

  get address() {
    return this.owner.address
  }

  submit(chain: string, calls: EvmCall[]): Promise<SponsorSubmission> {
    return this.queue.run(chain, async () => {
      const handle = this.handles.get(chain)
      if (!handle) throw new AppError('not_configured', `No RPC configured for ${chain}`)
      if (calls.length !== 1) throw new Error('DirectSponsor sends one call per transaction')
      const [call] = calls as [EvmCall]

      const wallet = createWalletClient({
        account: this.owner,
        chain: handle.chain,
        transport: http(handle.rpcUrl),
      })
      const hash = await wallet.sendTransaction({ to: call.to, data: call.data, value: call.value })
      return {
        method: this.method,
        hash,
        wait: async () => {
          const receipt = await handle.client.waitForTransactionReceipt({ hash, timeout: 120_000 })
          return { success: receipt.status === 'success', txHash: hash }
        },
      }
    })
  }
}
