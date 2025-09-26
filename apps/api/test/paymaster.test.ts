import { encodeFunctionData, parseAbi } from 'viem'
import { beforeEach, describe, expect, it } from 'vitest'
import { encodeClaim } from '../src/infra/evm/calls.js'
import { PaymasterService } from '../src/services/paymaster-service.js'

const distributor = '0x00000000000000000000000000000000000d1570'
const sender = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const empty = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
const entryPoint = '0x4337084d9e255ff0702461cf8895ce9e3b5ff108'

let forwarded: unknown[]
let service: PaymasterService

beforeEach(() => {
  forwarded = []
  service = new PaymasterService(
    'paymaster-secret-for-tests-0123456789',
    new Map([[84532, distributor]]),
    { forward: async (_chainId, body) => (forwarded.push(body), { result: 'ok' }) },
    async (_chainId, address) =>
      address.toLowerCase() === sender.toLowerCase() ? { amount: 10n, proof: [] } : undefined,
  )
})

// Smart wallets wrap calls in their own execute(), so the claim sits inside the callData.
const execute = parseAbi(['function execute(address target, uint256 value, bytes data)'])
function walletCallData(account = sender, amount = 10n) {
  const claim = encodeClaim(distributor, account, amount, []).data
  return encodeFunctionData({
    abi: execute,
    functionName: 'execute',
    args: [distributor, 0n, claim],
  })
}

const gas = {
  callGasLimit: '0x30d40',
  verificationGasLimit: '0x30d40',
  preVerificationGas: '0xc350',
  maxFeePerGas: '0x3b9aca00',
  maxPriorityFeePerGas: '0x3b9aca00',
}

function request(op: Record<string, unknown>, method = 'pm_getPaymasterStubData') {
  return { jsonrpc: '2.0', id: 1, method, params: [op, entryPoint, '0x14a34', {}] }
}

const claimOp = (overrides: Record<string, unknown> = {}) => ({
  sender,
  callData: walletCallData(),
  ...overrides,
})

describe('ERC-7677 paymaster proxy', () => {
  it('forwards the exact claim the server expects', async () => {
    const token = service.issueToken(sender, 84532)
    expect(await service.handle(84532, token, request(claimOp()))).toEqual({ result: 'ok' })
    expect(forwarded).toHaveLength(1)
  })

  it('refuses wallets with nothing to claim and claims with a different amount', async () => {
    const emptyToken = service.issueToken(empty, 84532)
    const emptyOp = { sender: empty, callData: walletCallData(empty) }
    expect(await service.handle(84532, emptyToken, request(emptyOp))).toMatchObject({
      error: { message: expect.stringMatching(/Nothing to claim/) },
    })

    const token = service.issueToken(sender, 84532)
    const inflated = claimOp({ callData: walletCallData(sender, 10_000n) })
    expect(await service.handle(84532, token, request(inflated))).toMatchObject({
      error: { message: expect.stringMatching(/Nothing to claim/) },
    })
  })

  it('refuses a sender that does not own the token', async () => {
    const token = service.issueToken(sender, 84532)
    const result = await service.handle(84532, token, request(claimOp({ sender: empty })))
    expect(result).toMatchObject({ error: { message: expect.stringMatching(/Sender/) } })
  })

  it('caps gas limits and fees, and requires them on the final request', async () => {
    const token = service.issueToken(sender, 84532)
    const tooMuchGas = { error: { message: expect.stringMatching(/Gas/) } }

    const gassy = request(claimOp({ ...gas, callGasLimit: '0x5f5e100' }))
    expect(await service.handle(84532, token, gassy)).toMatchObject(tooMuchGas)

    const pricey = request(claimOp({ ...gas, maxFeePerGas: '0x174876e800' }))
    expect(await service.handle(84532, token, pricey)).toMatchObject(tooMuchGas)

    const bare = request(claimOp(), 'pm_getPaymasterData')
    expect(await service.handle(84532, token, bare)).toMatchObject(tooMuchGas)
  })

  it('signs one sponsorship per wallet at a time', async () => {
    const token = service.issueToken(sender, 84532)
    const final = request(claimOp(gas), 'pm_getPaymasterData')
    expect(await service.handle(84532, token, final)).toEqual({ result: 'ok' })
    expect(await service.handle(84532, token, final)).toMatchObject({
      error: { message: expect.stringMatching(/already pending/) },
    })
  })

  it('refuses unknown account factories', async () => {
    const token = service.issueToken(sender, 84532)
    const op = claimOp({ factory: '0x000000000000000000000000000000000000dead' })
    expect(await service.handle(84532, token, request(op))).toMatchObject({
      error: { message: expect.stringMatching(/not supported/) },
    })
  })

  it('rejects forged, foreign-chain and expired tokens', async () => {
    const token = service.issueToken(sender, 84532)
    await expect(service.handle(84532, `${token}x`, request(claimOp()))).rejects.toThrow(/Invalid/)
    await expect(service.handle(11155111, token, request(claimOp()))).rejects.toThrow(
      /another chain/,
    )
    const old = service.issueToken(sender, 84532, Date.now() - 11 * 60_000)
    await expect(service.handle(84532, old, request(claimOp()))).rejects.toThrow(/expired/)
  })

  it('only proxies paymaster methods', async () => {
    const token = service.issueToken(sender, 84532)
    const result = await service.handle(84532, token, request(claimOp(), 'eth_sendUserOperation'))
    expect(result).toMatchObject({ error: { code: -32601 } })
  })
})
