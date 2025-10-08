import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BASE, createTestApp, type TestApp } from './helpers.js'
import { evmWallet, signInEvm, signInSolana } from './signers.js'

let t: TestApp
const campaignId = 'meridian-genesis'

beforeEach(async () => {
  t = await createTestApp()
})
afterEach(async () => {
  await t.close()
})

async function eligibility(cookie: string) {
  const response = await t.app.inject({
    url: `/campaigns/${campaignId}/eligibility`,
    headers: { cookie },
  })
  return response.json<{ chains: { chain: string; status: string; claimable: string }[] }>().chains
}

async function join(cookie: string) {
  const response = await t.app.inject({
    method: 'POST',
    url: `/campaigns/${campaignId}/demo-join`,
    headers: { cookie },
  })
  expect(response.statusCode).toBe(200)
  await t.container.publisher.publish(campaignId)
}

describe('demo whitelist and gasless EVM claim', () => {
  it('walks a wallet from "not listed" to "claimed"', async () => {
    const { cookie, address } = await signInEvm(t.app)

    expect((await eligibility(cookie))[0]).toMatchObject({ chain: BASE, status: 'not_listed' })

    await join(cookie)
    const ready = (await eligibility(cookie))[0]!
    expect(ready.status).toBe('claimable')
    expect(ready.claimable).toBe((250n * 10n ** 18n).toString())

    const claim = await t.app.inject({
      method: 'POST',
      url: '/claims/evm',
      payload: { campaignId, chain: BASE },
      headers: { cookie },
    })
    expect(claim.statusCode).toBe(200)
    expect(claim.json().action).toMatchObject({ method: 'sponsored-userop', address })

    expect(t.evm.claimed.get(address.toLowerCase())).toBe(250n * 10n ** 18n)
    expect((await eligibility(cookie))[0]!.status).toBe('claimed')

    const status = await t.app.inject({
      url: `/claims/${claim.json().action.id}`,
      headers: { cookie },
    })
    expect(status.json().action.status).toBe('confirmed')
  })

  it('reports pending publication until the new root is on-chain', async () => {
    await t.close()
    t = await createTestApp({ ROOT_PUBLISH_DEBOUNCE_MS: 60_000 })
    const { cookie } = await signInEvm(t.app)
    await t.app.inject({
      method: 'POST',
      url: `/campaigns/${campaignId}/demo-join`,
      headers: { cookie },
    })

    expect((await eligibility(cookie))[0]!.status).toBe('pending_publication')
    const early = await t.app.inject({
      method: 'POST',
      url: '/claims/evm',
      payload: { campaignId, chain: BASE },
      headers: { cookie },
    })
    expect(early.json().error.code).toBe('pending_publication')
  })

  it('keeps seeded allocations claimable after new wallets join', async () => {
    const first = await signInEvm(t.app)
    await join(first.cookie)
    const rootAfterFirst = t.evm.root

    const second = await signInEvm(t.app, evmWallet())
    await join(second.cookie)
    expect(t.evm.root).not.toBe(rootAfterFirst)

    // The first wallet's proof is rebuilt from the new root, so it still works.
    expect((await eligibility(first.cookie))[0]!.status).toBe('claimable')
  })

  it('does not publish when nothing changed', async () => {
    const { cookie } = await signInEvm(t.app)
    await join(cookie)
    const updates = t.sponsor.submitted.length
    await join(cookie)
    expect(t.sponsor.submitted.length).toBe(updates)
  })

  it('surfaces a sponsor outage as a readable error', async () => {
    const { cookie } = await signInEvm(t.app)
    await join(cookie)
    t.sponsor.failNext = true
    const response = await t.app.inject({
      method: 'POST',
      url: '/claims/evm',
      payload: { campaignId, chain: BASE },
      headers: { cookie },
    })
    expect(response.statusCode).toBe(502)
    expect(response.json().error.message).toMatch(/sponsor/i)
  })

  it('requires a session', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/claims/evm',
      payload: { campaignId, chain: BASE },
    })
    expect(response.statusCode).toBe(401)
  })
})

describe('access pass', () => {
  it('mints one pass per wallet through the sponsor', async () => {
    const { cookie, address } = await signInEvm(t.app)
    const first = await t.app.inject({ method: 'POST', url: '/claims/pass', headers: { cookie } })
    expect(first.statusCode).toBe(200)
    expect(t.evm.passes.has(address.toLowerCase())).toBe(true)

    const second = await t.app.inject({ method: 'POST', url: '/claims/pass', headers: { cookie } })
    expect(second.json().error.code).toBe('already_claimed')
  })
})

describe('Solana claim with a backend fee payer', () => {
  it('prepares, accepts the wallet signature and records the claim', async () => {
    const { cookie, address } = await signInSolana(t.app)
    await join(cookie)

    const prepared = await t.app.inject({
      method: 'POST',
      url: '/claims/solana/prepare',
      payload: { campaignId },
      headers: { cookie },
    })
    expect(prepared.statusCode).toBe(200)
    const { id, amount } = prepared.json()
    expect(amount).toBe('250000000')

    const submit = await t.app.inject({
      method: 'POST',
      url: '/claims/solana/submit',
      payload: { id, transaction: t.solana.walletSigned() },
      headers: { cookie },
    })
    expect(submit.statusCode).toBe(200)
    expect(submit.json().action).toMatchObject({ method: 'solana-fee-payer', txHash: '5ignature' })
    expect(t.solana.claimed.get(address)).toBe(250_000_000n)
  })

  it('refuses to reuse a prepared transaction', async () => {
    const { cookie } = await signInSolana(t.app)
    await join(cookie)
    const prepared = await t.app.inject({
      method: 'POST',
      url: '/claims/solana/prepare',
      payload: { campaignId },
      headers: { cookie },
    })
    const payload = { id: prepared.json().id, transaction: t.solana.walletSigned() }

    await t.app.inject({
      method: 'POST',
      url: '/claims/solana/submit',
      payload,
      headers: { cookie },
    })
    const again = await t.app.inject({
      method: 'POST',
      url: '/claims/solana/submit',
      payload,
      headers: { cookie },
    })
    expect(again.json().error.code).toBe('nonce_invalid')
  })
})

describe('whitelist upload', () => {
  const csv = 'address,amount\n0x70997970C51812dc3A010C7d01b50e0d17dc79C8,1200\nbad,1\n'

  it('previews roots and row errors for anyone', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: `/campaigns/${campaignId}/whitelist/preview`,
      payload: { csv },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ valid: 1, issueCount: 1 })
    expect(response.json().roots.evm).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('only lets admins import', async () => {
    const { cookie } = await signInEvm(t.app)
    const response = await t.app.inject({
      method: 'POST',
      url: `/admin/campaigns/${campaignId}/whitelist`,
      payload: { csv },
      headers: { cookie },
    })
    expect(response.statusCode).toBe(403)
  })

  it('imports for admins and publishes a new root', async () => {
    await t.close()
    const admin = evmWallet()
    t = await createTestApp({ ADMIN_ADDRESSES: [admin.address] })
    const { cookie } = await signInEvm(t.app, admin)

    const response = await t.app.inject({
      method: 'POST',
      url: `/admin/campaigns/${campaignId}/whitelist`,
      payload: { csv },
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ added: 1, valid: 1 })

    await t.container.publisher.publish(campaignId)
    const dashboard = await t.app.inject({ url: '/admin/dashboard', headers: { cookie } })
    expect(dashboard.json().canEdit).toBe(true)
    expect(dashboard.json().allocations.bySource.csv).toBe(1)
  })
})
