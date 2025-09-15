import { chains, publicChainKeys } from '@mcg/core'
import { createKeyPairSignerFromBytes, createSolanaRpc, getBase58Encoder } from '@solana/kit'
import { privateKeyToAccount } from 'viem/accounts'
import type { Config } from './config.js'
import type { SignatureVerifier } from './ports/auth.js'
import type {
  BalanceReader,
  EvmGateway,
  EvmSponsor,
  HistoryProvider,
  PriceProvider,
  SolanaGateway,
  TelegramInviter,
} from './ports/chains.js'
import { MultichainBalanceReader } from './infra/balances.js'
import {
  DrizzleActionRepository,
  DrizzlePreparedTransactionRepository,
} from './infra/db/action-repository.js'
import { DrizzleAuthRepository } from './infra/db/auth-repository.js'
import { DrizzleCampaignRepository } from './infra/db/campaign-repository.js'
import type { Db } from './infra/db/client.js'
import { DrizzleGateRepository } from './infra/db/gate-repository.js'
import { createEvmClients } from './infra/evm/clients.js'
import { ViemEvmGateway } from './infra/evm/evm-gateway.js'
import { DirectSponsor, PimlicoSponsor } from './infra/evm/sponsor.js'
import { ExplorerHistoryProvider } from './infra/http-clients/history.js'
import { CoinGeckoPriceProvider } from './infra/http-clients/prices.js'
import { BotApiTelegramInviter } from './infra/http-clients/telegram.js'
import { KitSolanaGateway } from './infra/solana/solana-gateway.js'
import { MultichainSignatureVerifier } from './infra/siwx/verifier.js'
import { AdminService } from './services/admin-service.js'
import { AuthService } from './services/auth-service.js'
import { CampaignService } from './services/campaign-service.js'
import { ClaimService } from './services/claim-service.js'
import { GateService } from './services/gate-service.js'
import type { Logger } from './services/logger.js'
import {
  PaymasterService,
  PimlicoUpstream,
  type PaymasterUpstream,
} from './services/paymaster-service.js'
import { PortfolioService, type TrackedAsset } from './services/portfolio-service.js'
import { RootPublisher } from './services/root-publisher.js'

export interface Infrastructure {
  evm: EvmGateway | undefined
  sponsor: EvmSponsor | undefined
  solana: SolanaGateway | undefined
  balances: BalanceReader
  history: HistoryProvider
  prices: PriceProvider
  telegram: TelegramInviter
  verifier: SignatureVerifier
  paymasterUpstream: PaymasterUpstream | undefined
  portfolioChains: string[]
  trackedAssets: TrackedAsset[]
  distributorsByChainId: Map<number, string>
}

export interface Container {
  auth: AuthService
  campaigns: CampaignService
  claims: ClaimService
  gates: GateService
  portfolio: PortfolioService
  admin: AdminService
  paymaster: PaymasterService
  publisher: RootPublisher
  secureCookies: boolean
  publicOrigin: string
  demoCampaignId: string
}

const USDC: Record<string, string> = {
  [chains.sepolia.caip2]: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  [chains.baseSepolia.caip2]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  [chains.solanaDevnet.caip2]: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
}

export async function createInfrastructure({ env, deployments }: Config): Promise<Infrastructure> {
  const evmHandles = createEvmClients({
    sepolia: env.SEPOLIA_RPC_URL,
    baseSepolia: env.BASE_SEPOLIA_RPC_URL,
    anvil: env.ANVIL_RPC_URL,
  })
  const solanaRpc = createSolanaRpc(env.SOLANA_RPC_URL)

  const evmDeployments = new Map(
    Object.values(deployments.evm).map((deployment) => [
      `eip155:${deployment.chainId}`,
      deployment,
    ]),
  )
  const owner = env.SPONSOR_PRIVATE_KEY
    ? privateKeyToAccount(env.SPONSOR_PRIVATE_KEY as `0x${string}`)
    : undefined
  const sponsor = owner
    ? env.PIMLICO_API_KEY
      ? new PimlicoSponsor(
          owner,
          evmHandles,
          env.PIMLICO_API_KEY,
          env.PIMLICO_SPONSORSHIP_POLICY_ID,
        )
      : new DirectSponsor(owner, evmHandles)
    : undefined
  const passChain = evmDeployments.has(chains.baseSepolia.caip2)
    ? chains.baseSepolia.caip2
    : [...evmDeployments.keys()][0]
  const evm =
    owner && evmDeployments.size > 0
      ? new ViemEvmGateway(evmHandles, evmDeployments, owner.address, passChain)
      : undefined

  let solana: SolanaGateway | undefined
  if (deployments.solana && env.SOLANA_FEE_PAYER_SECRET) {
    const signer = await createKeyPairSignerFromBytes(
      parseSolanaSecret(env.SOLANA_FEE_PAYER_SECRET),
    )
    solana = new KitSolanaGateway(solanaRpc, signer, deployments.solana)
  }

  const trackedAssets: TrackedAsset[] = []
  for (const [chain, deployment] of evmDeployments) {
    trackedAssets.push(
      {
        chain,
        kind: 'erc20',
        address: deployment.token,
        symbol: 'MRD',
        name: 'Meridian',
        decimals: 18,
      },
      {
        chain,
        kind: 'erc721',
        address: deployment.accessPass,
        symbol: 'MPASS',
        name: 'Meridian Pass',
        decimals: 0,
      },
    )
  }
  if (deployments.solana) {
    trackedAssets.push({
      chain: chains.solanaDevnet.caip2,
      kind: 'spl',
      address: deployments.solana.mint,
      symbol: 'MRD',
      name: 'Meridian',
      decimals: deployments.solana.decimals,
    })
  }
  for (const [chain, token] of Object.entries(USDC)) {
    trackedAssets.push({
      chain,
      kind: chain.startsWith('solana:') ? 'spl' : 'erc20',
      address: token,
      symbol: 'USDC',
      name: 'USD Coin (Circle testnet)',
      decimals: 6,
    })
  }

  const portfolioChains = publicChainKeys.map((key) => chains[key].caip2)
  if (evmHandles.has(chains.anvil.caip2)) portfolioChains.push(chains.anvil.caip2)

  return {
    evm,
    sponsor,
    solana,
    balances: new MultichainBalanceReader(evmHandles, solanaRpc),
    history: new ExplorerHistoryProvider(solanaRpc),
    prices: new CoinGeckoPriceProvider(),
    telegram: new BotApiTelegramInviter(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID),
    verifier: new MultichainSignatureVerifier(
      new Map([...evmHandles].map(([chain, handle]) => [chain, handle.client])),
    ),
    paymasterUpstream: env.PIMLICO_API_KEY
      ? new PimlicoUpstream(env.PIMLICO_API_KEY, env.PIMLICO_SPONSORSHIP_POLICY_ID)
      : undefined,
    portfolioChains,
    trackedAssets,
    distributorsByChainId: new Map(
      Object.values(deployments.evm).map((deployment) => [
        deployment.chainId,
        deployment.distributor,
      ]),
    ),
  }
}

export function createContainer(
  config: Config,
  db: Db,
  infra: Infrastructure,
  logger: Logger,
): Container {
  const { env } = config
  const campaignRepo = new DrizzleCampaignRepository(db)
  const actionRepo = new DrizzleActionRepository(db)
  const gateRepo = new DrizzleGateRepository(db)

  const publisher = new RootPublisher({
    campaigns: campaignRepo,
    evm: infra.evm,
    sponsor: infra.sponsor,
    solana: infra.solana,
    logger,
    debounceMs: env.ROOT_PUBLISH_DEBOUNCE_MS,
  })
  const campaigns = new CampaignService(campaignRepo, infra.evm, infra.solana, publisher)

  return {
    auth: new AuthService(new DrizzleAuthRepository(db), infra.verifier, {
      origin: env.PUBLIC_ORIGIN,
      sessionTtlMs: env.SESSION_TTL_HOURS * 3_600_000,
      nonceTtlMs: 10 * 60_000,
      adminAddresses: env.ADMIN_ADDRESSES,
      allowLocalChains: Boolean(env.ANVIL_RPC_URL),
    }),
    campaigns,
    claims: new ClaimService(
      campaigns,
      actionRepo,
      new DrizzlePreparedTransactionRepository(db),
      infra.evm,
      infra.sponsor,
      infra.solana,
      logger,
    ),
    gates: new GateService(gateRepo, infra.balances, infra.telegram),
    portfolio: new PortfolioService(
      infra.portfolioChains,
      infra.trackedAssets,
      infra.balances,
      infra.history,
      infra.prices,
    ),
    admin: new AdminService(campaignRepo, actionRepo, gateRepo),
    paymaster: new PaymasterService(
      env.APP_SECRET,
      infra.distributorsByChainId,
      infra.paymasterUpstream,
    ),
    publisher,
    secureCookies: env.PUBLIC_ORIGIN.startsWith('https://'),
    publicOrigin: env.PUBLIC_ORIGIN,
    demoCampaignId: env.DEMO_CAMPAIGN_ID,
  }
}

function parseSolanaSecret(secret: string): Uint8Array {
  const trimmed = secret.trim()
  if (trimmed.startsWith('[')) return Uint8Array.from(JSON.parse(trimmed) as number[])
  return new Uint8Array(getBase58Encoder().encode(trimmed))
}
