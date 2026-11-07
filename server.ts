import { Database } from "bun:sqlite"
import QRCode from "qrcode"

const db = new Database("songup.db", { create: true })
db.run(`PRAGMA journal_mode=WAL`)
db.run(`CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, token TEXT, max INT, current TEXT, created INT)`)
db.run(`CREATE TABLE IF NOT EXISTS songs(id INTEGER PRIMARY KEY, room TEXT, uid TEXT, nick TEXT, vid TEXT, title TEXT, artist TEXT, ord REAL)`)

const PORT = Number(process.env.PORT ?? 2727)
const LIMIT = Math.max(1, Number(process.env.LIMIT) || 3) // songs per guest, set via ./run.sh <n>
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`

// The server is the host: one fresh room per start.
db.run("DELETE FROM rooms"); db.run("DELETE FROM songs")
const CODE = String(Math.floor(1000 + Math.random() * 9000))
db.run("INSERT INTO rooms VALUES(?,?,?,NULL,?)", [CODE, "", LIMIT, Date.now()])
const json = (d: unknown, status = 200) => Response.json(d, { status })
let shuffle = false // when on, next song is picked at random
const clients = new Map<string, Set<ReadableStreamDefaultController>>()
const enc = new TextEncoder()

const room = (code: string) => db.query("SELECT * FROM rooms WHERE code=?").get(code) as any
const state = (code: string) => {
    const r = room(code)
    if (!r) return null
    return {
        code, max: r.max, shuffle,
        current: r.current ? JSON.parse(r.current) : null,
        queue: db.query("SELECT id,uid,nick,vid,title,artist FROM songs WHERE room=? ORDER BY ord").all(code),
    }
}
function broadcast(code: string) {
    const msg = enc.encode(`data: ${JSON.stringify(state(code))}\n\n`)
    for (const c of clients.get(code) ?? []) try { c.enqueue(msg) } catch { clients.get(code)!.delete(c) }
}
// Host = request from this machine itself. Tunnel (cf-* header) and LAN guests are not host.
const isHost = (req: Request, srv: any) =>
    !req.headers.get("cf-connecting-ip") && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(srv.requestIP(req)?.address)
const setCurrent = (code: string, s: object | null) =>
    db.run("UPDATE rooms SET current=? WHERE code=?", [s && JSON.stringify(s), code])

function next(code: string) {
    const s = db.query(`SELECT * FROM songs WHERE room=? ORDER BY ${shuffle ? "RANDOM()" : "ord"} LIMIT 1`).get(code) as any
    if (!s) return setCurrent(code, null)
    db.run("DELETE FROM songs WHERE id=?", [s.id])
    setCurrent(code, { uid: s.uid, nick: s.nick, vid: s.vid, title: s.title, artist: s.artist })
}

Bun.serve({
    port: PORT,
    idleTimeout: 0, // SSE
    async fetch(req, srv) {
        const url = new URL(req.url)
        const p = url.pathname
        let m: RegExpMatchArray | null

        if (p === "/") return Response.redirect(`/room/${CODE}`)
        if (p === "/style.css") return new Response(Bun.file("public/style.css"))
        if (p === "/host") return Response.redirect(`/host/${CODE}`)
        if (p.startsWith("/host/")) return new Response(Bun.file("public/host.html"))
        if (p.startsWith("/room/")) return new Response(Bun.file("public/room.html"))
        if (p === "/api/info") return json({ code: CODE, url: `${PUBLIC_URL}/room/${CODE}` })
        if (p === "/qr.svg")
            return new Response(await QRCode.toString(`${PUBLIC_URL}/room/${CODE}`, { type: "svg", margin: 1 }), { headers: { "content-type": "image/svg+xml" } })

        if (p === "/api/search") {
            const q = url.searchParams.get("q")?.slice(0, 100)
            if (!q) return json([])
            const out = Bun.spawn([".venv/bin/python", "search.py", q], { stdout: "pipe", stderr: "ignore" })
            return new Response(out.stdout, { headers: { "content-type": "application/json" } })
        }

        if ((m = p.match(/^\/api\/(state|events|add|next|shuffle|remove)\/(\d+)(?:\/(\d+))?$/))) {
            const [, action, code, id] = m
            if (!room(code)) return json({ error: "no room" }, 404)

            if (action === "state") return json(state(code))
            if (action === "events") {
                let ctl: ReadableStreamDefaultController
                return new Response(new ReadableStream({
                    start(c) {
                        ctl = c
                        if (!clients.has(code)) clients.set(code, new Set())
                        clients.get(code)!.add(c)
                        c.enqueue(enc.encode(`data: ${JSON.stringify(state(code))}\n\n`))
                    },
                    cancel() { clients.get(code)?.delete(ctl) },
                }), { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } })
            }

            if (action === "add") {
                const b = await req.json()
                if (!b.uid || !b.vid || !b.title) return json({ error: "bad request" }, 400)
                const r = room(code)
                const mine = (db.query("SELECT COUNT(*) n FROM songs WHERE room=? AND uid=?").get(code, b.uid) as any).n
                if (mine >= r.max) return json({ error: "SONG_LIMIT_REACHED" }, 409)
                const dup = db.query("SELECT 1 FROM songs WHERE room=? AND vid=?").get(code, b.vid)
                if (dup || (r.current && JSON.parse(r.current).vid === b.vid)) return json({ error: "DUPLICATE_SONG" }, 409)
                const song = { uid: String(b.uid).slice(0, 40), nick: String(b.nick ?? "").slice(0, 30), vid: b.vid, title: String(b.title).slice(0, 200), artist: String(b.artist ?? "").slice(0, 200) }
                if (!r.current) setCurrent(code, song)
                else db.run("INSERT INTO songs(room,uid,nick,vid,title,artist,ord) VALUES(?,?,?,?,?,?,(SELECT COALESCE(MAX(ord),0)+1 FROM songs WHERE room=?))",
                    [code, song.uid, song.nick, song.vid, song.title, song.artist, code])
                broadcast(code)
                return json({ ok: true })
            }

            // host-only below
            if (!isHost(req, srv)) return json({ error: "not host" }, 403)
            if (action === "next") {
                // vid guard: ignore stale/double "ended" events
                const { vid } = await req.json().catch(() => ({}))
                const cur = room(code).current
                if (!vid || (cur && JSON.parse(cur).vid === vid)) next(code)
            }
            if (action === "shuffle") shuffle = !shuffle
            if (action === "remove") db.run("DELETE FROM songs WHERE id=? AND room=?", [id, code])
            broadcast(code)
            return json({ ok: true })
        }
        return new Response("not found", { status: 404 })
    },
})
console.log(`\nRoom ${CODE} | limit ${LIMIT} songs/guest\nHost screen: http://localhost:${PORT}/host\nGuests:      ${PUBLIC_URL}/room/${CODE}\n`)
