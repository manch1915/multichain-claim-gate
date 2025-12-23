// End-to-end run against a local solana-test-validator with the program deployed and
// apps/api/scripts/solana-setup.ts already run. Skipped unless SOLANA_E2E_DEPLOYMENTS points at the
// deployments file that the setup script wrote. The wallet side is played by @solana/web3.js, which
// is what the AppKit Solana adapter hands to wallets.
import { readFileSync } from 'node:fs'
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  getBase58Decoder,
  signBytes,
} from '@solana/kit'
import { Keypair, VersionedTransaction } from '@solana/web3.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureDemoData } from '../../src/bootstrap.js'
import { deploymentsSchema } from '../../src/config.js'
import { createContainer, createInfrastructure, type Container } from '../../src/container.js'
import { DrizzleCampaignRepository } from '../../src/infra/db/campaign-repository.js'
import { DrizzleGateRepository } from '../../src/infra/db/gate-repository.js'
import { buildServer } from '../../src/http/server.js'
import { silentLogger } from '../../src/services/logger.js'
import { DEVNET, createTestDb, testConfig } from '../helpers.js'
import { requestMessage } from '../signers.js'

const deploymentsFile = process.env.SOLANA_E2E_DEPLOYMENTS
const rpcUrl = process.env.SOLANA_E2E_RPC_URL ?? 'http://127.0.0.1:8899'
const feePayerSecret = process.env.SOLANA_E2E_FEE_PAYER

const claimant = Keypair.generate()
let app: Awaited<ReturnType<typeof buildServer>>
let container: Container
let closeDb: () => Promise<void>
let cookie: string
let mint: string

describe.skipIf(!deploymentsFile || !feePayerSecret)('Solana claim on a local validator', () => {
  beforeAll(async () => {
    const deployments = deploymentsSchema.parse(JSON.parse(readFileSync(deploymentsFile!, 'utf8')))
    mint = deployments.solana!.mint
    const config = {
      ...testConfig({ SOLANA_RPC_URL: rpcUrl, SOLANA_FEE_PAYER_SECRET: feePayerSecret }),
      deployments: { evm: {}, solana: deployments.solana },
    }
    const db = await createTestDb()
    closeDb = db.close
    await ensureDemoData(
      config,
      new DrizzleCampaignRepository(db.db),
      new DrizzleGateRepository(db.db),
    )
    container = createContainer(config, db.db, await createInfrastructure(config), silentLogger)
    app = await buildServer(container, { logger: false })

    const signer = await createKeyPairSignerFromBytes(claimant.secretKey)
    const message = await requestMessage(app, `${DEVNET}:${claimant.publicKey.toBase58()}`)
    const signature = await signBytes(signer.keyPair.privateKey, new TextEncoder().encode(message))
    const response = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { message, signature: getBase58Decoder().decode(signature) },
    })
    expect(response.statusCode).toBe(200)
    cookie = String(response.headers['set-cookie']).split(';')[0] ?? ''
  }, 120_000)

  afterAll(async () => {
    container?.publisher.stop()
    await app?.close()
    await closeDb?.()
  })

  it('publishes the root on-chain and claims with the backend as fee payer', async () => {
    await app.inject({
      method: 'POST',
      url: '/campaigns/meridian-genesis/demo-join',
      headers: { cookie },
    })
    await container.publisher.publish('meridian-genesis')

    const eligibility = await app.inject({
      url: '/campaigns/meridian-genesis/eligibility',
      headers: { cookie },
    })
    expect(eligibility.json().chains[0]).toMatchObject({
      status: 'claimable',
      claimable: '250000000',
    })

    const prepared = await app.inject({
      method: 'POST',
      url: '/claims/solana/prepare',
      payload: { campaignId: 'meridian-genesis' },
      headers: { cookie },
    })
    expect(prepared.statusCode).toBe(200)

    // What the wallet does: deserialize, sign as claimant, serialize back.
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(prepared.json().transaction, 'base64'),
    )
    transaction.sign([claimant])
    const submitted = await app.inject({
      method: 'POST',
      url: '/claims/solana/submit',
      payload: {
        id: prepared.json().id,
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
      },
      headers: { cookie },
    })
    expect(submitted.statusCode).toBe(200)
    const id = submitted.json().action.id

    const deadline = Date.now() + 60_000
    let status = 'pending'
    while (status === 'pending' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      status = (await app.inject({ url: `/claims/${id}`, headers: { cookie } })).json().action
        .status
    }
    expect(status).toBe('confirmed')

    const { value } = await createSolanaRpc(rpcUrl)
      .getTokenAccountsByOwner(
        address(claimant.publicKey.toBase58()),
        { mint: address(mint) },
        { encoding: 'jsonParsed' },
      )
      .send()
    expect(value[0]?.account.data.parsed.info.tokenAmount.amount).toBe('250000000')

    const lounge = await app.inject({ url: '/gates/holders-lounge', headers: { cookie } })
    expect(lounge.json().passed).toBe(true)
  }, 120_000)

  it('does not prepare a second claim for the same wallet', async () => {
    const prepared = await app.inject({
      method: 'POST',
      url: '/claims/solana/prepare',
      payload: { campaignId: 'meridian-genesis' },
      headers: { cookie },
    })
    expect(prepared.json().error.code).toBe('already_claimed')
  })

  it('rejects a transaction that was changed after the backend built it', async () => {
    const other = Keypair.generate()
    const signer = await createKeyPairSignerFromBytes(other.secretKey)
    const message = await requestMessage(app, `${DEVNET}:${other.publicKey.toBase58()}`)
    const signature = await signBytes(signer.keyPair.privateKey, new TextEncoder().encode(message))
    const login = await app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { message, signature: getBase58Decoder().decode(signature) },
    })
    const otherCookie = String(login.headers['set-cookie']).split(';')[0] ?? ''
    await app.inject({
      method: 'POST',
      url: '/campaigns/meridian-genesis/demo-join',
      headers: { cookie: otherCookie },
    })
    await container.publisher.publish('meridian-genesis')

    const prepared = await app.inject({
      method: 'POST',
      url: '/claims/solana/prepare',
      payload: { campaignId: 'meridian-genesis' },
      headers: { cookie: otherCookie },
    })
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(prepared.json().transaction, 'base64'),
    )
    transaction.sign([other])
    const bytes = Buffer.from(transaction.serialize())
    const last = bytes.length - 1
    bytes.writeUInt8((bytes.readUInt8(last) ^ 0xff) & 0xff, last)

    const submitted = await app.inject({
      method: 'POST',
      url: '/claims/solana/submit',
      payload: { id: prepared.json().id, transaction: bytes.toString('base64') },
      headers: { cookie: otherCookie },
    })
    expect(submitted.json().error.code).toBe('transaction_mismatch')
  }, 120_000)
})
