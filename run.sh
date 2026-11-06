#!/bin/sh
# ./run.sh [songs-per-guest]   e.g. ./run.sh 5   (default 3)
cd "$(dirname "$0")"
export LIMIT="${1:-3}" PORT="${PORT:-2727}"
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -q ytmusicapi; }
[ -d node_modules ] || bun install -q
if command -v cloudflared >/dev/null; then
  cloudflared tunnel --url "http://localhost:$PORT" >.tunnel.log 2>&1 & TUNNEL=$!
  trap 'kill $TUNNEL' EXIT INT TERM
  for i in $(seq 30); do
    PUBLIC_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' .tunnel.log | head -1)
    [ -n "$PUBLIC_URL" ] && break; sleep 1
  done
  export PUBLIC_URL
fi
bun server.ts
