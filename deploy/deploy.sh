#!/usr/bin/env bash
# Ships the committed tree plus deployments/testnet.json to the server and rebuilds there, in a
# single SSH connection (the server bans bursts of connections).
#   bash deploy/deploy.sh <ssh-host> [/opt/multichain-claim-gate]
set -euo pipefail
host="${1:?usage: deploy.sh <ssh-host> [remote-dir]}"
dir="${2:-/opt/multichain-claim-gate}"
cd "$(dirname "$0")/.."

test -f deployments/testnet.json || { echo "deployments/testnet.json is missing"; exit 1; }

git archive --format=tar HEAD | ssh "$host" "
  set -e
  mkdir -p '$dir' && cd '$dir'
  tar -x
  test -f .env || { echo 'Create $dir/.env first (see docs/deploy.md)'; exit 1; }
  docker compose -f docker-compose.yml -f deploy/compose.prod.yaml up -d --build
  docker compose -f docker-compose.yml -f deploy/compose.prod.yaml ps
"
