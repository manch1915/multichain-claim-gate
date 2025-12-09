// End-to-end run against a real Anvil node: deploys the Foundry artifacts, then signs in, joins the
// demo list, lets the publisher push the root, claims through the sponsor and checks the gate.
// Run with `npm run test:e2e -w @mcg/api` while `anvil --hardfork prague` listens on ANVIL_RPC_URL.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Abi,
  type Address,
  type Hex,
} from 'viem'
import { anvil } from 'viem/chains'
import { mnemonicToAccount } from 'viem/accounts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureDemoData } from '../../src/bootstrap.js'
import { createContainer, createInfrastructure, type Container } from '../../src/container.js'
import { DrizzleCampaignRepository } from '../../src/infra/db/campaign-repository.js'
import { DrizzleGateRepository } from '../../src/infra/db/gate-repository.js'
import { buildServer } from '../../src/http/server.js'
import { silentLogger } from '../../src/services/logger.js'
import { createTestDb, testConfig } from '../helpers.js'
import { requestMessage } from '../signers.js'

const RPC = process.env.ANVIL_RPC_URL ?? 'http://127.0.0.1:8545'
const MNEMONIC = 'test test test test test test test test test test test junk'
const CHAIN = 'eip155:31337'
const deployer = mnemonicToAccount(MNEMONIC, { addressIndex: 0 })
const sponsor = mnemonicToAccount(MNEMONIC, { addressIndex: 1 })
const user = mnemonicToAccount(MNEMONIC, { addressIndex: 9 })

const artifactsDir = fileURLToPath(new URL('../../../../contracts/evm/out', import.meta.url))
function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const json = JSON.parse(readFileSync(`${artifactsDir}/${name}.sol/${name}.json`, 'utf8'))
  return { abi: json.abi, bytecode: json.bytecode.object }
}

const publicClient = createPublicClient({ chain: anvil, transport: http(RPC) })
const wallet = createWalletClient({ account: deployer, chain: anvil, transport: http(RPC) })

async function deploy(name: string, args: unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name)
  const hash = await wallet.deployContract({ abi, bytecode, args })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) throw new Error(`${name} was not deployed`)
  return receipt.contractAddress
}

let app: Awaited<ReturnType<typeof buildServer>>
let container: Container
let closeDb: () => Promise<void>
let token: Address
let cookie: string

beforeAll(async () => {
  token = await deploy('MeridianToken', [deployer.address, 100_000_000n * 10n ** 18n])
  const distributor = await deploy('MerkleDistributor', [
    token,
    sponsor.address,
    `0x${'00'.repeat(32)}`,
  ])
  const accessPass = await deploy('AccessPass', [sponsor.address])
  const fund = await wallet.writeContract({
    address: token,
    abi: parseAbi(['function transfer(address to, uint256 amount) returns (bool)']),
    functionName: 'transfer',
    args: [distributor, 10_000_000n * 10n ** 18n],
  })
  await publicClient.waitForTransactionReceipt({ hash: fund })

  const base = testConfig({
    ANVIL_RPC_URL: RPC,
    SPONSOR_PRIVATE_KEY: `0x${Buffer.from(sponsor.getHdKey().privateKey!).toString('hex')}`,
    SOLANA_RPC_URL: 'http://127.0.0.1:1',
  })
  const config = {
    ...base,
    deployments: { evm: { '31337': { chainId: 31337, token, distributor, accessPass } } },
  }
  const db = await createTestDb()
  closeDb = db.close
  await ensureDemoData(
    config,
    new DrizzleCampaignRepository(db.db),
    new DrizzleGateRepository(db.db),
  )
  const infra = await createInfrastructure(config)
  container = createContainer(config, db.db, infra, silentLogger)
  app = await buildServer(container, { logger: false })

  const message = await requestMessage(app, `${CHAIN}:${user.address}`)
  const response = await app.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { message, signature: await user.signMessage({ message }) },
  })
  cookie = String(response.headers['set-cookie']).split(';')[0] ?? ''
}, 120_000)

afterAll(async () => {
  container?.publisher.stop()
  await app?.close()
  await closeDb?.()
})

async function waitFor<T>(load: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await load()
    if (done(value) || Date.now() > deadline) return value
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
}

const balanceOf = (owner: Address) =>
  publicClient.readContract({
    address: token,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [owner],
  })

describe('claim and gate on a real chain', () => {
  it('publishes the root, claims through the sponsor and opens the lounge', async () => {
    const join = await app.inject({
      method: 'POST',
      url: '/campaigns/meridian-genesis/demo-join',
      headers: { cookie },
    })
    expect(join.json()).toEqual({ added: 1 })
    await container.publisher.publish('meridian-genesis')

    const eligibility = await waitFor(
      async () =>
        (
          await app.inject({ url: '/campaigns/meridian-genesis/eligibility', headers: { cookie } })
        ).json().chains[0],
      (row: { status: string }) => row.status === 'claimable',
    )
    expect(eligibility).toMatchObject({ chain: CHAIN, status: 'claimable' })

    const claim = await app.inject({
      method: 'POST',
      url: '/claims/evm',
      payload: { campaignId: 'meridian-genesis', chain: CHAIN },
      headers: { cookie },
    })
    expect(claim.statusCode).toBe(200)
    const id = claim.json().action.id

    const action = await waitFor(
      async () => (await app.inject({ url: `/claims/${id}`, headers: { cookie } })).json().action,
      (value: { status: string }) => value.status !== 'pending',
    )
    expect(action.status).toBe('confirmed')
    expect(await balanceOf(user.address)).toBe(250n * 10n ** 18n)

    const lounge = await app.inject({ url: '/gates/holders-lounge', headers: { cookie } })
    expect(lounge.json().passed).toBe(true)
  }, 120_000)

  it('refuses a second claim with the on-chain revert reason', async () => {
    const again = await app.inject({
      method: 'POST',
      url: '/claims/evm',
      payload: { campaignId: 'meridian-genesis', chain: CHAIN },
      headers: { cookie },
    })
    expect(again.json().error.code).toBe('already_claimed')
  })
})
