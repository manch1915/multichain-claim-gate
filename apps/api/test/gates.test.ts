import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, type TestApp } from './helpers.js'
import { signInEvm, signInSolana } from './signers.js'

let t: TestApp

beforeEach(async () => {
  t = await createTestApp()
})
afterEach(async () => {
  await t.app.close()
})

describe('token gating', () => {
  it('hides content from visitors without a wallet', async () => {
    const response = await t.app.inject({ url: '/gates/holders-lounge' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ passed: false, content: null })
    expect(response.json().result.children[0]).toMatchObject({ missingAccount: true })
  })

  it('opens the lounge for a pass holder', async () => {
    const { cookie, address } = await signInEvm(t.app)
    t.balances.set('erc721', address, 1n)

    const response = await t.app.inject({ url: '/gates/holders-lounge', headers: { cookie } })
    expect(response.json().passed).toBe(true)
    expect(response.json().content.heading).toBe('Welcome to the Holders Lounge')
  })

  it('opens the lounge for 100 MRD held on Solana', async () => {
    const { cookie, address } = await signInSolana(t.app)
    t.balances.set('spl', address, 100_000_000n)

    const response = await t.app.inject({ url: '/gates/holders-lounge', headers: { cookie } })
    expect(response.json().passed).toBe(true)
  })

  it('shows required and actual amounts when a wallet falls short', async () => {
    const { cookie, address } = await signInEvm(t.app)
    t.balances.set('erc20', address, 99n * 10n ** 18n)

    const response = await t.app.inject({ url: '/gates/holders-lounge', headers: { cookie } })
    const mrd = response.json().result.children[1].children[0]
    expect(mrd).toMatchObject({ passed: false, required: '100', actual: '99' })
    expect(response.json().content).toBeNull()
  })

  it('needs every branch of an "all" rule', async () => {
    const { cookie, address } = await signInEvm(t.app)
    t.balances.set('erc721', address, 1n)
    t.balances.set('erc20', address, 500n * 10n ** 18n)

    const response = await t.app.inject({ url: '/gates/founders-circle', headers: { cookie } })
    expect(response.json().passed).toBe(false)
  })

  it('issues a Telegram invite only to qualifying wallets', async () => {
    const { cookie, address } = await signInEvm(t.app)
    const denied = await t.app.inject({
      method: 'POST',
      url: '/gates/holders-lounge/telegram',
      headers: { cookie },
    })
    expect(denied.statusCode).toBe(403)

    t.balances.set('erc721', address, 1n)
    const granted = await t.app.inject({
      method: 'POST',
      url: '/gates/holders-lounge/telegram',
      headers: { cookie },
    })
    expect(granted.json().invite.url).toBe('https://t.me/+invite')
  })

  it('lets admins edit rules and rejects invalid ones', async () => {
    const response = await t.app.inject({
      method: 'PUT',
      url: '/admin/gates/holders-lounge',
      payload: { title: 'x' },
    })
    expect(response.statusCode).toBe(401)
  })
})
