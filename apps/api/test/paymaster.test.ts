import { encodeFunctionData, parseAbi } from 'viem'
import { describe, expect, it } from 'vitest'
import { PaymasterService } from '../src/services/paymaster-service.js'
import { encodeClaim } from '../src/infra/evm/calls.js'

const distributor = '0x00000000000000000000000000000000000d1570'
const sender = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const forwarded: unknown[] = []
const service = new PaymasterService(
  'paymaster-secret-for-tests-0123456789',
  new Map([[84532, distributor]]),
  { forward: async (_chainId, body) => (forwarded.push(body), { result: 'ok' }) },
)

// Smart wallets wrap calls in their own execute(), so the claim shows up inside the callData.
const execute = parseAbi(['function execute(address target, uint256 value, bytes data)'])
function walletCallData(data: `0x${string}`, target: `0x${string}` = distributor) {
  return encodeFunctionData({ abi: execute, functionName: 'execute', args: [target, 0n, data] })
}
const claimData = encodeClaim(distributor, sender, 10n, []).data

function request(callData: string, from = sender) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'pm_getPaymasterStubData',
    params: [
      { sender: from, callData },
      '0x4337084d9e255ff0702461cf8895ce9e3b5ff108',
      '0x14a34',
      {},
    ],
  }
}

describe('ERC-7677 paymaster proxy', () => {
  it('forwards a claim from the token owner', async () => {
    const token = service.issueToken(sender, 84532)
    const result = await service.handle(84532, token, request(walletCallData(claimData)))
    expect(result).toEqual({ result: 'ok' })
    expect(forwarded).toHaveLength(1)
  })

  it('refuses calls that are not claims', async () => {
    const token = service.issueToken(sender, 84532)
    const transfer = encodeFunctionData({
      abi: parseAbi(['function transfer(address to, uint256 amount)']),
      functionName: 'transfer',
      args: [sender, 1n],
    })
    const result = await service.handle(84532, token, request(walletCallData(transfer)))
    expect(result).toMatchObject({ error: { message: 'Only airdrop claims are sponsored' } })
  })

  it('refuses a sender that does not own the token', async () => {
    const token = service.issueToken(sender, 84532)
    const result = await service.handle(
      84532,
      token,
      request(walletCallData(claimData), '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'),
    )
    expect(result).toMatchObject({ error: { code: -32602 } })
  })

  it('rejects forged, foreign-chain and expired tokens', async () => {
    const token = service.issueToken(sender, 84532)
    await expect(service.handle(84532, `${token}x`, request(claimData))).rejects.toThrow(/Invalid/)
    await expect(service.handle(11155111, token, request(claimData))).rejects.toThrow(
      /another chain/,
    )
    const old = service.issueToken(sender, 84532, Date.now() - 11 * 60_000)
    await expect(service.handle(84532, old, request(claimData))).rejects.toThrow(/expired/)
  })

  it('only proxies paymaster methods', async () => {
    const token = service.issueToken(sender, 84532)
    const result = await service.handle(84532, token, {
      ...request(claimData),
      method: 'eth_sendUserOperation',
    })
    expect(result).toMatchObject({ error: { code: -32601 } })
  })
})
