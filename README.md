# SongUp Lite

    ./run.sh [songs-per-guest]

Server is the host: makes one room, opens a cloudflared tunnel, prints guest URL and a secret host link (`/host?key=...`).
Host screen: http://localhost:2727/host (shows QR). Skip/shuffle need that machine or the host link.
Custom domain: `TUNNEL_TOKEN=... PUBLIC_URL=https://your.domain ./run.sh`. See AGENTS.md.
