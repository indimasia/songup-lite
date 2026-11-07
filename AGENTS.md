# SongUp Lite – agent notes

Tiny party song queue. Guests add YouTube songs, host screen plays them.

## Layout
- `server.ts` – Bun server (SQLite `songup.db`, SSE, API). One fresh room per start; room code is internal only.
- `search.py` – ytmusicapi search. A pasted YouTube URL resolves to that single video (`list=` ignored).
- `public/room.html` – guest page (served at `/`). `public/host.html` – host player (served at `/host`). Both get `__CODE__` replaced by the server.
- `run.sh [songs-per-guest]` – creates `.venv`, installs deps, starts tunnel + server.

## Run
- Quick tunnel (random URL each start): `./run.sh`
- Custom domain: `TUNNEL_TOKEN=... PUBLIC_URL=https://your.domain ./run.sh` (named Cloudflare tunnel → `localhost:2727`)
- Console prints the guest URL and a secret `/host?key=...` link.

## Gotchas
- Host-only actions (next/shuffle/remove) need loopback OR the `host` cookie, set by visiting `/host?key=KEY`. KEY is random per start. Keep the link private.
- Cloudflare quick tunnels don't stream SSE (headers arrive, no body; padding doesn't help). `host.html` therefore also polls `/api/state` every 2s. Don't remove the poll.
- Browsers block autoplay: host must click **▶ Start** once per page load.
- Every start wipes rooms and queue.
- Test on a spare port (`PORT=2900 bun server.ts`) so a live session isn't disturbed.
