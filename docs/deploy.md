# Deploying the demo

The demo runs as three containers (Postgres, API, web) on a host that already has a Caddy container
serving other sites. Nothing is published on the host's ports: Caddy reaches the web app over a
shared Docker network, and the web app forwards `/api/*` to the API on the project's own network.

## Before the first deploy

1. Deploy the contracts and fill `deployments/testnet.json` (see the README). Commit the file, the
   addresses are public.
2. Point a DNS A record at the server, for example `claim.example.com`. Do this before touching
   Caddy: if Caddy sees the site first, the ACME challenge fails and it backs off for a long time.
3. On the server, create the project directory and its `.env` once. Generate secrets there and keep
   the file readable by root only:

   ```bash
   mkdir -p /opt/multichain-claim-gate && cd /opt/multichain-claim-gate
   umask 077
   cat > .env <<EOF
   POSTGRES_PASSWORD=$(openssl rand -hex 24)
   APP_SECRET=$(openssl rand -hex 32)
   PUBLIC_ORIGIN=https://claim.example.com
   NEXT_PUBLIC_SITE_URL=https://claim.example.com
   NEXT_PUBLIC_REOWN_PROJECT_ID=
   SPONSOR_PRIVATE_KEY=
   PIMLICO_API_KEY=
   SOLANA_FEE_PAYER_SECRET=
   ADMIN_ADDRESSES=
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_CHAT_ID=
   EOF
   ```

   Keep comments on their own lines. Compose's `env_file` does not strip inline comments.

## Deploy and update

From your machine:

```bash
bash deploy/deploy.sh <ssh-host>
```

The script streams `git archive HEAD` over one SSH connection, then runs
`docker compose -f docker-compose.yml -f deploy/compose.prod.yaml up -d --build` on the server. The
`.env` on the server is never overwritten. If the shared network is not called `infra_default`,
set `PROXY_NETWORK` in `.env`.

## Adding the site to the shared Caddy

Append the block from `deploy/Caddyfile.snippet` with your domain. The Caddyfile is shared with other
production sites, so only add to it and validate before reloading:

```bash
CF=/path/to/Caddyfile
cp "$CF" "$CF.bak-meridian-$(date +%Y%m%d%H%M%S)"
cat deploy/Caddyfile.snippet >> "$CF"         # appending keeps the same inode
docker exec <caddy> caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

Do not edit the Caddyfile with `sed -i` or an editor that saves through rename. When the file is
bind-mounted into the container on its own, a new inode means Caddy keeps reading the old one and
the reload silently applies the stale config. If that already happened, copy the file into the
container and reload from the copy:

```bash
docker cp "$CF" <caddy>:/tmp/Caddyfile.live
docker exec <caddy> caddy reload --config /tmp/Caddyfile.live --adapter caddyfile
```

## Checks

```bash
curl -s https://claim.example.com/api/health          # {"ok":true}
curl -s https://claim.example.com/api/campaigns/meridian-genesis | head -c 200
docker compose -f docker-compose.yml -f deploy/compose.prod.yaml logs api --since 5m
```

The API log prints which chains, which sponsor mode (user operations or plain transactions) and
whether Telegram invites are enabled when it starts.

## Backups

Allocations and claim records live in Postgres. A nightly dump is enough for a demo:

```bash
docker compose exec -T db pg_dump -U meridian meridian | gzip > backups/meridian-$(date +%F).sql.gz
```

Contract state is on-chain, so a lost database only loses the whitelist history. Re-importing the
CSV and letting the publisher run brings the roots back in line.
