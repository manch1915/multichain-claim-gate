import { parseAbi } from 'viem'

export const distributorAbi = parseAbi([
  'function claim(address account, uint256 cumulativeAmount, bytes32[] proof) returns (uint256)',
  'function claimed(address account) view returns (uint256)',
  'function merkleRoot() view returns (bytes32)',
  'function paused() view returns (bool)',
  'function setMerkleRoot(bytes32 newRoot)',
  'function token() view returns (address)',
  'error InvalidProof()',
  'error NothingToClaim()',
  'error EnforcedPause()',
])

export const accessPassAbi = parseAbi([
  'function mint() returns (uint256)',
  'function mintTo(address to) returns (uint256)',
  'function hasMinted(address account) view returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'error AlreadyMinted(address account)',
])

export const erc20Abi = parseAbi(['function balanceOf(address owner) view returns (uint256)'])
