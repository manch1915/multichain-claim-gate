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

/**
 * Returns the claim arguments when the operation makes exactly one zero-value claim on our
 * distributor for its own sender, and undefined for anything else.
 */
export function decodeSponsorableClaim(
  callData: Hex,
  sender: string,
  distributor: string,
): { amount: bigint; proof: Hex[] } | undefined {
  const calls = extractCalls(callData)
  if (!calls || calls.length !== 1) return undefined
  const [call] = calls as [InnerCall]
  if (call.target.toLowerCase() !== distributor.toLowerCase() || call.value !== 0n) return undefined
  try {
    const claim = decodeFunctionData({ abi: distributorClaim, data: call.data })
    const [account, amount, proof] = claim.args
    return account.toLowerCase() === sender.toLowerCase()
      ? { amount, proof: [...proof] }
      : undefined
  } catch {
    return undefined
  }
}

export function isSponsorableClaim(callData: Hex, sender: string, distributor: string): boolean {
  return decodeSponsorableClaim(callData, sender, distributor) !== undefined
}

// Account code we are willing to sponsor when an operation deploys or delegates an account.
const KNOWN_FACTORIES = new Set([
  '0x0ba5ed0c6aa8c49038f819e587e2633c4a9f428a', // Coinbase Smart Wallet v1
  '0xba5ed110efdba3d005bfc882d75358acbbb85842', // Coinbase Smart Wallet v1.1
])
const KNOWN_7702_DELEGATES = new Set([
  '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b', // MetaMask EIP7702StatelessDeleGator
  '0xe6cae83bde06e4c305530e199d7217f42808555b', // Simple7702Account (EntryPoint 0.8)
])
// EntryPoint 0.8 marks 7702 operations with this factory value.
const EIP7702_FACTORY_MARKER = /^0x7702(0+)?$/i

/** Rejects operations that deploy or delegate to account code we do not know. */
export function usesKnownAccountCode(userOp: Record<string, unknown>): boolean {
  const auth = userOp['eip7702Auth'] as { address?: unknown } | undefined | null
  const hasAuth = auth !== undefined && auth !== null
  if (hasAuth) {
    if (typeof auth.address !== 'string' || !KNOWN_7702_DELEGATES.has(auth.address.toLowerCase())) {
      return false
    }
  }

  // EntryPoint 0.6 sends initCode, 0.7+ sends factory. Check each one that is present on its own.
  const factory = presentHex(userOp['factory'])
  const initCode = presentHex(userOp['initCode'])
  if (factory === false || initCode === false) return false
  const initFactory = initCode ? initCode.slice(0, 42) : undefined
  if (factory && initFactory && factory.toLowerCase() !== initFactory.toLowerCase()) return false

  for (const candidate of [factory, initFactory]) {
    if (!candidate) continue
    if (EIP7702_FACTORY_MARKER.test(candidate)) {
      if (!hasAuth) return false
    } else if (!KNOWN_FACTORIES.has(candidate.toLowerCase())) {
      return false
    }
  }
  return true
}

/** undefined when the field is absent or empty, false when it is malformed. */
function presentHex(value: unknown): string | undefined | false {
  if (value === undefined || value === null || value === '0x' || value === '') return undefined
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) return false
  if (value.length < 6) return false
  return value
}
