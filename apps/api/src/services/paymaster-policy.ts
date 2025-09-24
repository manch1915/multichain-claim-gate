import {
  decodeAbiParameters,
  decodeFunctionData,
  parseAbi,
  parseAbiParameters,
  slice,
  hexToBigInt,
  type Hex,
} from 'viem'

export interface InnerCall {
  target: Hex
  value: bigint
  data: Hex
}

const accountAbi = parseAbi([
  // Coinbase Smart Wallet, SimpleAccount, Simple7702Account
  'function execute(address target, uint256 value, bytes data)',
  'function executeBatch((address target, uint256 value, bytes data)[] calls)',
  // SimpleAccount v0.7
  'function executeBatch(address[] dest, uint256[] value, bytes[] func)',
  // ERC-7579 accounts (MetaMask smart accounts, Kernel, Safe 7579)
  'function execute(bytes32 mode, bytes executionCalldata)',
])

const distributorClaim = parseAbi([
  'function claim(address account, uint256 cumulativeAmount, bytes32[] proof)',
])

/**
 * Unwraps the calls a smart account will make from its user operation calldata. Returns undefined
 * for layouts we do not recognise, and for delegatecall or try modes, so the policy fails closed.
 */
export function extractCalls(callData: Hex): InnerCall[] | undefined {
  let decoded
  try {
    decoded = decodeFunctionData({ abi: accountAbi, data: callData })
  } catch {
    return undefined
  }

  if (decoded.functionName === 'execute' && decoded.args.length === 3) {
    const [target, value, data] = decoded.args
    return [{ target, value, data }]
  }
  if (decoded.functionName === 'executeBatch' && decoded.args.length === 1) {
    return decoded.args[0].map((call) => ({
      target: call.target,
      value: call.value,
      data: call.data,
    }))
  }
  if (decoded.functionName === 'executeBatch' && decoded.args.length === 3) {
    const [targets, values, datas] = decoded.args
    if (
      targets.length !== datas.length ||
      (values.length !== 0 && values.length !== targets.length)
    ) {
      return undefined
    }
    return targets.map((target, i) => ({ target, value: values[i] ?? 0n, data: datas[i] ?? '0x' }))
  }
  if (decoded.functionName === 'execute' && decoded.args.length === 2) {
    return decode7579(decoded.args[0], decoded.args[1])
  }
  return undefined
}

function decode7579(mode: Hex, executionCalldata: Hex): InnerCall[] | undefined {
  const callType = slice(mode, 0, 1)
  const execType = slice(mode, 1, 2)
  if (execType !== '0x00') return undefined
  if (callType === '0x00') {
    if ((executionCalldata.length - 2) / 2 < 52) return undefined
    return [
      {
        target: slice(executionCalldata, 0, 20),
        value: hexToBigInt(slice(executionCalldata, 20, 52)),
        data: slice(executionCalldata, 52),
      },
    ]
  }
  if (callType === '0x01') {
    const [calls] = decodeAbiParameters(
      parseAbiParameters('(address target, uint256 value, bytes callData)[]'),
      executionCalldata,
    )
    return calls.map((call) => ({ target: call.target, value: call.value, data: call.callData }))
  }
  return undefined
}

/** True when every call is a zero-value claim on our distributor for the operation's sender. */
export function isSponsorableClaim(callData: Hex, sender: string, distributor: string): boolean {
  const calls = extractCalls(callData)
  if (!calls || calls.length === 0) return false
  return calls.every((call) => {
    if (call.target.toLowerCase() !== distributor.toLowerCase() || call.value !== 0n) return false
    try {
      const claim = decodeFunctionData({ abi: distributorClaim, data: call.data })
      return claim.args[0].toLowerCase() === sender.toLowerCase()
    } catch {
      return false
    }
  })
}
