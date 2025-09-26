import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
  toHex,
  pad,
} from 'viem'
import { describe, expect, it } from 'vitest'
import { encodeClaim } from '../src/infra/evm/calls.js'
import { isSponsorableClaim, usesKnownAccountCode } from '../src/services/paymaster-policy.js'

const distributor = '0x00000000000000000000000000000000000d1570'
const sender = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const stranger = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const claim = (account = sender) => encodeClaim(distributor, account, 10n, []).data

const abi = parseAbi([
  'function execute(address target, uint256 value, bytes data)',
  'function executeBatch((address target, uint256 value, bytes data)[] calls)',
  'function executeBatch(address[] dest, uint256[] value, bytes[] func)',
  'function execute(bytes32 mode, bytes executionCalldata)',
])

const single = (target: `0x${string}`, data: `0x${string}`, value = 0n) =>
  encodeFunctionData({ abi, functionName: 'execute', args: [target, value, data] })

describe('paymaster policy', () => {
  it('accepts a single execute() wrapping a claim for the sender', () => {
    expect(isSponsorableClaim(single(distributor, claim()), sender, distributor)).toBe(true)
  })

  it('rejects a claim for another account, a non-zero value or another target', () => {
    expect(isSponsorableClaim(single(distributor, claim(stranger)), sender, distributor)).toBe(
      false,
    )
    expect(isSponsorableClaim(single(distributor, claim(), 1n), sender, distributor)).toBe(false)
    expect(isSponsorableClaim(single(stranger, claim()), sender, distributor)).toBe(false)
  })

  it('rejects a batch that smuggles an extra call next to the claim', () => {
    const batch = encodeFunctionData({
      abi,
      functionName: 'executeBatch',
      args: [
        [
          { target: distributor, value: 0n, data: claim() },
          { target: stranger, value: 0n, data: '0x' },
        ],
      ],
    })
    expect(isSponsorableClaim(batch, sender, distributor)).toBe(false)
  })

  it('accepts the SimpleAccount v0.7 batch layout', () => {
    const batch = encodeFunctionData({
      abi,
      functionName: 'executeBatch',
      args: [[distributor], [], [claim()]],
    })
    expect(isSponsorableClaim(batch, sender, distributor)).toBe(true)
  })

  it('understands ERC-7579 single and batch modes and refuses delegatecall', () => {
    const singleMode = pad('0x00', { dir: 'right', size: 32 })
    const packed = concat([distributor, pad(toHex(0n), { size: 32 }), claim()])
    const execSingle = encodeFunctionData({
      abi,
      functionName: 'execute',
      args: [singleMode, packed],
    })
    expect(isSponsorableClaim(execSingle, sender, distributor)).toBe(true)

    const batchMode = pad('0x01', { dir: 'right', size: 32 })
    const executions = encodeAbiParameters(
      parseAbiParameters('(address target, uint256 value, bytes callData)[]'),
      [[{ target: distributor, value: 0n, callData: claim() }]],
    )
    const execBatch = encodeFunctionData({
      abi,
      functionName: 'execute',
      args: [batchMode, executions],
    })
    expect(isSponsorableClaim(execBatch, sender, distributor)).toBe(true)

    const delegateMode = pad('0xff', { dir: 'right', size: 32 })
    const execDelegate = encodeFunctionData({
      abi,
      functionName: 'execute',
      args: [delegateMode, packed],
    })
    expect(isSponsorableClaim(execDelegate, sender, distributor)).toBe(false)
  })

  it('fails closed on unknown wrappers', () => {
    expect(isSponsorableClaim(claim(), sender, distributor)).toBe(false)
    expect(isSponsorableClaim('0xdeadbeef', sender, distributor)).toBe(false)
  })

  it('accepts known account code and rejects the rest', () => {
    expect(usesKnownAccountCode({})).toBe(true)
    expect(usesKnownAccountCode({ factory: '0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a' })).toBe(
      true,
    )
    expect(usesKnownAccountCode({ factory: '0x000000000000000000000000000000000000dead' })).toBe(
      false,
    )
    expect(
      usesKnownAccountCode({
        factory: '0x7702',
        eip7702Auth: { address: '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B' },
      }),
    ).toBe(true)
    expect(
      usesKnownAccountCode({
        eip7702Auth: { address: '0x000000000000000000000000000000000000dead' },
      }),
    ).toBe(false)
    expect(usesKnownAccountCode({ factory: '0x7702' })).toBe(false)
    expect(
      usesKnownAccountCode({
        factory: '0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a',
        initCode: '0x000000000000000000000000000000000000dead00',
      }),
    ).toBe(false)
    expect(usesKnownAccountCode({ initCode: '0x000000000000000000000000000000000000dead00' })).toBe(
      false,
    )
  })
})
