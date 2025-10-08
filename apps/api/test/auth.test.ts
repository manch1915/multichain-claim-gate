import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BASE, DEVNET, cookieFrom, createTestApp, type TestApp } from './helpers.js'
import { evmWallet, requestMessage, signInEvm, signInSolana, solanaWallet } from './signers.js'

let t: TestApp

beforeEach(async () => {
  t = await createTestApp()
})
afterEach(async () => {
  await t.close()
})

describe('sign-in with Ethereum', () => {
  it('builds an EIP-4361 message bound to the app domain', async () => {
    const wallet = evmWallet()
    const message = await requestMessage(t.app, `${BASE}:${wallet.address}`)

    expect(message).toContain('localhost:3000 wants you to sign in with your Ethereum account:')
    expect(message).toContain(wallet.address)
    expect(message).toContain('Chain ID: 84532')
    expect(message).toMatch(/Nonce: [0-9a-f]{32}/)
    expect(message).toContain('Expiration Time:')
  })

  it('creates an httpOnly session cookie after a valid signature', async () => {
    const wallet = evmWallet()
    const message = await requestMessage(t.app, `${BASE}:${wallet.address}`)
    const response = await t.app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { message, signature: await wallet.signMessage({ message }) },
    })

    expect(response.statusCode).toBe(200)
    expect(String(response.headers['set-cookie'])).toMatch(/HttpOnly/i)
    expect(String(response.headers['set-cookie'])).toMatch(/SameSite=Lax/i)

    const session = await t.app.inject({
      url: '/auth/session',
      headers: { cookie: cookieFrom(response) },
    })
    expect(session.json().session.accounts).toEqual([
      { family: 'evm', chain: BASE, address: wallet.address },
    ])
  })

  it('rejects a replayed message', async () => {
    const wallet = evmWallet()
    const message = await requestMessage(t.app, `${BASE}:${wallet.address}`)
    const signature = await wallet.signMessage({ message })
    const payload = { message, signature }

    expect((await t.app.inject({ method: 'POST', url: '/auth/verify', payload })).statusCode).toBe(
      200,
    )
    const replay = await t.app.inject({ method: 'POST', url: '/auth/verify', payload })
    expect(replay.statusCode).toBe(400)
    expect(replay.json().error.code).toBe('nonce_invalid')
  })

  it('rejects a signature from another wallet', async () => {
    const wallet = evmWallet()
    const message = await requestMessage(t.app, `${BASE}:${wallet.address}`)
    const response = await t.app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { message, signature: await evmWallet().signMessage({ message }) },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('signature_invalid')
  })

  it('rejects a message edited after it was issued', async () => {
    const wallet = evmWallet()
    const message = await requestMessage(t.app, `${BASE}:${wallet.address}`)
    const tampered = message.replace('localhost:3000', 'evil.example')
    const response = await t.app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { message: tampered, signature: await wallet.signMessage({ message: tampered }) },
    })
    expect(response.statusCode).toBe(400)
  })

  it('refuses chains outside the demo', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/auth/message',
      payload: { accountId: `eip155:1:${evmWallet().address}` },
    })
    expect(response.statusCode).toBe(400)
  })
})

describe('sign-in with Solana', () => {
  it('verifies an ed25519 signature over the SIWS message', async () => {
    const wallet = await solanaWallet()
    const message = await requestMessage(t.app, `${DEVNET}:${wallet.address}`)
    expect(message).toContain('wants you to sign in with your Solana account:')
    expect(message).toContain('Chain ID: devnet')

    const response = await t.app.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { message, signature: await wallet.sign(message) },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().session.accounts[0]).toMatchObject({
      family: 'solana',
      address: wallet.address,
    })
  })
})

describe('sessions', () => {
  it('links an EVM and a Solana wallet to one session', async () => {
    const evm = await signInEvm(t.app)
    const solana = await signInSolana(t.app, evm.cookie)

    const session = await t.app.inject({ url: '/auth/session', headers: { cookie: solana.cookie } })
    const families = session
      .json()
      .session.accounts.map((account: { family: string }) => account.family)
    expect(families.sort()).toEqual(['evm', 'solana'])
  })

  it('replaces the account when a different wallet of the same family signs in', async () => {
    const first = await signInEvm(t.app)
    const second = evmWallet()
    await signInEvm(t.app, second, first.cookie)

    const session = await t.app.inject({ url: '/auth/session', headers: { cookie: first.cookie } })
    expect(session.json().session.accounts).toHaveLength(1)
    expect(session.json().session.accounts[0].address).toBe(second.address)
  })

  it('signs out one family and then the whole session', async () => {
    const evm = await signInEvm(t.app)
    await signInSolana(t.app, evm.cookie)
    const headers = { cookie: evm.cookie }

    const partial = await t.app.inject({
      method: 'POST',
      url: '/auth/sign-out',
      payload: { family: 'evm' },
      headers,
    })
    expect(partial.json().session.accounts).toHaveLength(1)

    await t.app.inject({ method: 'POST', url: '/auth/sign-out', payload: {}, headers })
    const after = await t.app.inject({ url: '/auth/session', headers })
    expect(after.json().session).toBeNull()
  })

  it('flags admin wallets from the environment', async () => {
    await t.close()
    const admin = evmWallet()
    t = await createTestApp({ ADMIN_ADDRESSES: [admin.address.toLowerCase()] })
    const { cookie } = await signInEvm(t.app, admin)
    const session = await t.app.inject({ url: '/auth/session', headers: { cookie } })
    expect(session.json().session.isAdmin).toBe(true)
  })
})
