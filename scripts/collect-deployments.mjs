// Merges the per-chain files written by contracts/evm/script/Deploy.s.sol into
// deployments/testnet.json, keeping the Solana section untouched.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'deployments/testnet.json')
const chains = ['11155111', '84532']

const deployments = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : { evm: {} }
deployments.evm ??= {}

for (const chainId of chains) {
  const file = resolve(root, `contracts/evm/deployments/${chainId}.json`)
  if (!existsSync(file)) continue
  const deployment = JSON.parse(readFileSync(file, 'utf8'))
  deployments.evm[chainId] = {
    chainId: Number(chainId),
    token: deployment.token,
    distributor: deployment.distributor,
    accessPass: deployment.accessPass,
    sponsor: deployment.sponsor,
  }
  console.log(`chain ${chainId}: distributor ${deployment.distributor}`)
}

writeFileSync(target, `${JSON.stringify(deployments, null, 2)}\n`)
console.log(`wrote ${target}`)
