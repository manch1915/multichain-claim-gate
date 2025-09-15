import { chains, type Condition, type Rule } from '@mcg/core'
import { getAddressDecoder } from '@solana/kit'
import { getAddress, keccak256, parseUnits, toHex } from 'viem'
import type { Config } from './config.js'
import type { AllocationRecord, Gate } from './domain/models.js'
import type { CampaignRepository, GateRepository } from './ports/repositories.js'

export const DEMO_AMOUNT = '250'

/**
 * Seeds the demo campaign and gated pages once. The seeded community wallets are derived from
 * fixed labels, so they look like real addresses but nobody holds their keys.
 */
export async function ensureDemoData(
  config: Config,
  campaigns: CampaignRepository,
  gates: GateRepository,
): Promise<void> {
  const campaignId = config.env.DEMO_CAMPAIGN_ID
  const existing = await campaigns.findCampaign(campaignId)
  if (!existing) {
    await campaigns.upsertCampaign({
      id: campaignId,
      name: 'Meridian Genesis Drop',
      description:
        'Retroactive MRD airdrop for early Meridian testers, liquidity providers and community moderators.',
      decimals: { evm: 18, solana: config.deployments.solana?.decimals ?? 6 },
      demoAmount: DEMO_AMOUNT,
      demoJoinOpen: true,
    })
    await campaigns.upsertAllocations(
      seedAllocations(campaignId, config.deployments.solana?.decimals ?? 6),
    )
  }

  const existingGates = new Set((await gates.list()).map((gate) => gate.id))
  for (const gate of demoGates(config)) {
    if (!existingGates.has(gate.id)) await gates.upsert(gate)
  }
}

function seedAllocations(campaignId: string, solanaDecimals: number): AllocationRecord[] {
  // Rough shape of a real retro drop: many small testers, fewer LPs, a handful of moderators.
  const tiers = [
    { label: 'tester', count: 34, amount: '120' },
    { label: 'lp', count: 9, amount: '640' },
    { label: 'moderator', count: 4, amount: '1500' },
  ]
  const records: AllocationRecord[] = []
  const addedAt = new Date()
  for (const tier of tiers) {
    for (let i = 0; i < tier.count; i++) {
      const seed = keccak256(toHex(`meridian:${tier.label}:${i}`))
      records.push({
        campaignId,
        family: 'evm',
        address: getAddress(`0x${seed.slice(-40)}`),
        amount: parseUnits(tier.amount, 18),
        source: 'seed',
        addedAt,
      })
      if (i % 3 === 0) {
        const bytes = Buffer.from(
          keccak256(toHex(`meridian:sol:${tier.label}:${i}`)).slice(2),
          'hex',
        )
        records.push({
          campaignId,
          family: 'solana',
          address: getAddressDecoder().decode(bytes),
          amount: parseUnits(tier.amount, solanaDecimals),
          source: 'seed',
          addedAt,
        })
      }
    }
  }
  return records
}

function demoGates({ deployments }: Config): Gate[] {
  const base = deployments.evm[String(84532)] ?? Object.values(deployments.evm)[0]
  const mrdHoldings: Condition[] = Object.values(deployments.evm).map((deployment) => ({
    kind: 'erc20',
    chain: `eip155:${deployment.chainId}`,
    contract: deployment.token,
    symbol: 'MRD',
    decimals: 18,
    minAmount: '100',
  }))
  if (deployments.solana) {
    mrdHoldings.push({
      kind: 'spl',
      chain: chains.solanaDevnet.caip2,
      mint: deployments.solana.mint,
      symbol: 'MRD',
      decimals: deployments.solana.decimals,
      minAmount: '100',
    })
  }
  const pass: Condition[] = base
    ? [
        {
          kind: 'erc721',
          chain: `eip155:${base.chainId}`,
          contract: base.accessPass,
          name: 'Meridian Pass',
          minCount: 1,
        },
      ]
    : []
  const holdsMrd: Rule[] = mrdHoldings.length
    ? [{ kind: 'any', label: 'Hold at least 100 MRD on any network', rules: mrdHoldings }]
    : []
  const fallbackRule: Condition = {
    kind: 'native',
    chain: chains.sepolia.caip2,
    minAmount: '0.01',
  }

  const loungeRules = [...pass, ...holdsMrd]
  const updatedAt = new Date()
  return [
    {
      id: 'holders-lounge',
      title: 'Holders Lounge',
      summary: 'Release notes, the testnet roadmap and a private chat for Meridian holders.',
      rule: loungeRules.length ? { kind: 'any', rules: loungeRules } : fallbackRule,
      content: {
        heading: 'Welcome to the Holders Lounge',
        body: [
          'You are in. Access was checked on the server against live balances, so this page never reaches a wallet that does not qualify.',
          'What is coming in the next testnet cycle: fee rebates for LPs on Base Sepolia, a Solana devnet vault with weekly epochs, and governance voting on the Q1 emission schedule.',
          'Office hours with the core team run every Thursday at 16:00 UTC. Bring your questions about the vault parameters.',
        ].join('\n\n'),
        links: [
          {
            label: 'Testnet roadmap',
            href: 'https://github.com/manch1915/multichain-claim-gate#roadmap',
          },
        ],
      },
      telegramEnabled: true,
      updatedAt,
    },
    {
      id: 'founders-circle',
      title: 'Founders Circle',
      summary: 'Early access to vault strategies. Needs both a pass and a bigger MRD position.',
      rule: {
        kind: 'all',
        rules: [
          ...pass,
          ...(mrdHoldings.length
            ? [
                {
                  kind: 'any' as const,
                  label: 'Hold at least 1000 MRD on any network',
                  rules: mrdHoldings.map((condition) => ({ ...condition, minAmount: '1000' })),
                },
              ]
            : [fallbackRule]),
        ],
      },
      content: {
        heading: 'Founders Circle',
        body: 'Strategy drafts for the devnet vault are shared here first, two weeks before the public write-up.',
        links: [],
      },
      telegramEnabled: false,
      updatedAt,
    },
  ]
}
