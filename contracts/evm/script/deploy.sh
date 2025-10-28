#!/usr/bin/env bash
# Deploys token, distributor and pass to Sepolia and Base Sepolia, verifies the sources and
# writes the addresses to deployments/testnet.json.
#
# Needs DEPLOYER_PRIVATE_KEY, SPONSOR_PRIVATE_KEY, ETHERSCAN_API_KEY, SEPOLIA_RPC_URL and
# BASE_SEPOLIA_RPC_URL in the environment (see .env.example).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY}"
: "${SPONSOR_PRIVATE_KEY:?set SPONSOR_PRIVATE_KEY}"
: "${ETHERSCAN_API_KEY:?set ETHERSCAN_API_KEY}"
SPONSOR_ADDRESS="$(cast wallet address "$SPONSOR_PRIVATE_KEY")"
export SPONSOR_ADDRESS

echo "Sponsor (contract owner): $SPONSOR_ADDRESS"

forge script script/Deploy.s.sol \
  --rpc-url sepolia \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  --verify --etherscan-api-key "$ETHERSCAN_API_KEY"

# Basescan's API is paid-only for Base Sepolia, Blockscout verifies for free.
forge script script/Deploy.s.sol \
  --rpc-url base_sepolia \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  --verify --verifier blockscout --verifier-url https://base-sepolia.blockscout.com/api/

node ../../scripts/collect-deployments.mjs
