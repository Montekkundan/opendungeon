type LobbyPlayer = {
  id: string
  name: string
  joinedAt: number
}

type RaceResult = {
  name: string
  status: string
  floor: number
  turns: number
  gold: number
  kills: number
  submittedAt: number
}

type LobbySocketData = {
  id: string
  name: string
}

const options = parseArgs(Bun.argv.slice(2))
const players = new Map<string, LobbyPlayer>()
const sockets = new Set<ServerWebSocket>()
const results: RaceResult[] = []

const server = Bun.serve<LobbySocketData>({
  port: options.port,
  fetch(request, server) {
    const url = new URL(request.url)

    if (url.pathname === "/ws") {
      const name = url.searchParams.get("name")?.trim() || "Crawler"
      const id = crypto.randomUUID()
      return server.upgrade(request, { data: { id, name } }) ? undefined : new Response("upgrade failed", { status: 400 })
    }

    if (url.pathname === "/leaderboard") return json(leaderboard())

    if (url.pathname === "/finish" && request.method === "POST") return submitResult(request)

    if (url.pathname === "/") {
      const body = renderLobbyPage(url.host)
      return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } })
    }

    return new Response("Not found", { status: 404 })
  },
  websocket: {
    open(ws) {
      const data = ws.data
      players.set(data.id, { id: data.id, name: data.name, joinedAt: Date.now() })
      sockets.add(ws)
      broadcastState()
    },
    close(ws) {
      const data = ws.data
      players.delete(data.id)
      sockets.delete(ws)
      broadcastState()
    },
    message(ws, message) {
      if (typeof message !== "string") return
      if (message === "state") ws.send(JSON.stringify(lobbyState()))
    },
  },
})

console.log(`Dungeon Dev Crawl lobby`)
console.log(`Mode: ${options.mode}`)
console.log(`Seed: ${options.seed}`)
console.log(`URL:  http://localhost:${server.port}`)
console.log(`Run:  DUNGEON_MODE=${options.mode} DUNGEON_SEED=${options.seed} DUNGEON_LOBBY_URL=http://localhost:${server.port} bun run dev`)

type ServerWebSocket = Bun.ServerWebSocket<LobbySocketData>

function parseArgs(args: string[]) {
  const options = {
    port: 3737,
    seed: Math.floor(Math.random() * 9_000_000) + 1_000_000,
    mode: "race",
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    const value = args[index + 1]
    if (arg === "--port" && value) options.port = Number(value)
    if (arg === "--seed" && value) options.seed = Number(value)
    if (arg === "--mode" && value && ["race", "coop"].includes(value)) options.mode = value
  }

  return options
}

function submitResult(request: Request) {
  return request
    .json()
    .then((body) => {
      const result = normalizeResult(body)
      results.push(result)
      broadcastState()
      return json(result, 201)
    })
    .catch(() => json({ error: "invalid result payload" }, 400))
}

function normalizeResult(body: unknown): RaceResult {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  return {
    name: String(input.name || "Crawler").slice(0, 32),
    status: String(input.status || "running").slice(0, 16),
    floor: toInt(input.floor),
    turns: toInt(input.turns),
    gold: toInt(input.gold),
    kills: toInt(input.kills),
    submittedAt: Date.now(),
  }
}

function toInt(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

function lobbyState() {
  return {
    mode: options.mode,
    seed: options.seed,
    players: [...players.values()].map((player) => ({
      name: player.name,
      joinedAt: player.joinedAt,
    })),
    leaderboard: leaderboard(),
  }
}

function leaderboard() {
  return [...results].sort((a, b) => {
    if (a.status === "victory" && b.status !== "victory") return -1
    if (a.status !== "victory" && b.status === "victory") return 1
    if (a.floor !== b.floor) return b.floor - a.floor
    if (a.turns !== b.turns) return a.turns - b.turns
    return b.gold - a.gold
  })
}

function broadcastState() {
  const payload = JSON.stringify(lobbyState())
  for (const socket of sockets) socket.send(payload)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}

function renderLobbyPage(host: string): string {
  const command = `DUNGEON_MODE=${options.mode} DUNGEON_SEED=${options.seed} DUNGEON_LOBBY_URL=http://${host} bun run dev`
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dungeon Dev Crawl Lobby</title>
    <style>
      body { margin: 0; background: #05070a; color: #d8dee9; font: 16px ui-monospace, SFMono-Regular, Menlo, monospace; }
      main { max-width: 880px; margin: 0 auto; padding: 32px; }
      h1 { color: #d6a85c; font-size: 22px; }
      code, pre { background: #111820; color: #7dffb2; padding: 12px; display: block; overflow-x: auto; }
      section { border-top: 1px solid #303640; margin-top: 24px; padding-top: 20px; }
      li { margin: 8px 0; }
      .muted { color: #8f9ba8; }
    </style>
  </head>
  <body>
    <main>
      <h1>Dungeon Dev Crawl Lobby</h1>
      <p>Mode <strong>${options.mode}</strong> · Seed <strong>${options.seed}</strong></p>
      <pre>${command}</pre>
      <p class="muted">Share this URL and the command with friends on the same network.</p>
      <section>
        <h2>Players</h2>
        <ul id="players"><li class="muted">Waiting...</li></ul>
      </section>
      <section>
        <h2>Leaderboard</h2>
        <ul id="leaderboard"><li class="muted">No results yet.</li></ul>
      </section>
    </main>
    <script>
      const name = new URLSearchParams(location.search).get("name") || "Spectator";
      const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws?name=" + encodeURIComponent(name));
      ws.onmessage = (event) => {
        const state = JSON.parse(event.data);
        document.querySelector("#players").innerHTML = state.players.length
          ? state.players.map((player) => "<li>" + player.name + "</li>").join("")
          : '<li class="muted">Waiting...</li>';
        document.querySelector("#leaderboard").innerHTML = state.leaderboard.length
          ? state.leaderboard.map((result) => "<li>" + result.name + " · " + result.status + " · floor " + result.floor + " · " + result.turns + " turns · " + result.gold + " gold</li>").join("")
          : '<li class="muted">No results yet.</li>';
      };
    </script>
  </body>
</html>`
}
