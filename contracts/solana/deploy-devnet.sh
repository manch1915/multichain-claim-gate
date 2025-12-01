#!/usr/bin/env bash
# Deploys the program to devnet from the Anchor image. AUTHORITY_KEYPAIR is a solana-keygen JSON
# file that pays for the deployment and later signs root updates (the backend's fee payer).
set -euo pipefail
cd "$(dirname "$0")"
: "${AUTHORITY_KEYPAIR:?set AUTHORITY_KEYPAIR to a keypair file}"

docker run --rm \
  -v "$PWD":/work -v "$(dirname "$AUTHORITY_KEYPAIR")":/keys:ro -w /work \
  solanafoundation/anchor:v1.0.2 \
  solana program deploy target/deploy/merkle_distributor.so \
    --program-id target/deploy/merkle_distributor-keypair.json \
    --keypair "/keys/$(basename "$AUTHORITY_KEYPAIR")" \
    --url devnet
