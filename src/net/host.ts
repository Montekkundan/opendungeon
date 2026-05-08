import { MultiplayerLobbyState, loadRaceResults, saveRaceResults, type LobbyRole } from "./lobbyState.js"

type LobbySocketData = {
  id: string
  name: string
  role: LobbyRole
}

const options = parseArgs(Bun.argv.slice(2))
const lobby = new MultiplayerLobbyState({
  mode: options.mode,
  seed: options.seed,
  inviteCode: options.inviteCode,
  initialResults: options.leaderboardPath ? loadRaceResults(options.leaderboardPath) : [],
})
const sockets = new Set<ServerWebSocket>()

const server = Bun.serve<LobbySocketData>({
  port: options.port,
  fetch(request, server) {
    const url = new URL(request.url)

    if (url.pathname === "/ws") {
      const role: LobbyRole = url.searchParams.get("role") === "spectator" ? "spectator" : "player"
      const name = url.searchParams.get("name")?.trim() || (role === "spectator" ? "Spectator" : "Crawler")
      const id = crypto.randomUUID()
      return server.upgrade(request, { data: { id, name, role } }) ? undefined : new Response("upgrade failed", { status: 400 })
    }

    if (url.pathname === "/leaderboard") return json(lobby.leaderboard())
    if (url.pathname === "/invite") return json(invitePayload(url.host))
    if (url.pathname === "/finish" && request.method === "POST") return submitResult(request)
    if (url.pathname === "/") return new Response(renderLobbyPage(url.host), { headers: { "content-type": "text/html; charset=utf-8" } })

    return new Response("Not found", { status: 404 })
  },
  websocket: {
    open(ws) {
      lobby.join(ws.data.id, ws.data.name, ws.data.role)
      sockets.add(ws)
      broadcastState()
    },
    close(ws) {
      lobby.leave(ws.data.id)
      sockets.delete(ws)
      broadcastState()
    },
    message(ws, message) {
      if (typeof message === "string") handleSocketMessage(ws, message)
    },
  },
})

console.log(`opendungeon lobby`)
console.log(`Mode: ${options.mode}`)
console.log(`Seed: ${options.seed}`)
console.log(`Invite: ${lobby.inviteCode}`)
console.log(`URL:  http://localhost:${server.port}`)
console.log(`Run:  ${lobbyCommand(`localhost:${server.port}`)}`)

type ServerWebSocket = Bun.ServerWebSocket<LobbySocketData>

function parseArgs(args: string[]) {
  const options = {
    port: 3737,
    seed: Math.floor(Math.random() * 9_000_000) + 1_000_000,
    mode: "race" as "race" | "coop",
    inviteCode: "",
    leaderboardPath: process.env.OPENDUNGEON_LOBBY_LEADERBOARD || "",
  }

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    const value = args[index + 1]
    if (arg === "--port" && value) options.port = Number(value)
    if (arg === "--seed" && value) options.seed = Number(value)
    if (arg === "--mode" && value && ["race", "coop"].includes(value)) options.mode = value as "race" | "coop"
    if (arg === "--invite" && value) options.inviteCode = value.replace(/[^\w-]/g, "").slice(0, 16)
    if (arg === "--leaderboard" && value) options.leaderboardPath = value
  }

  return options
}

function submitResult(request: Request) {
  return request
    .json()
    .then((body) => {
      const result = lobby.submitRaceResult(body)
      if (options.leaderboardPath) saveRaceResults(options.leaderboardPath, lobby.leaderboard())
      broadcastState()
      return json(result, 201)
    })
    .catch(() => json({ error: "invalid result payload" }, 400))
}

function invitePayload(host: string) {
  return {
    mode: options.mode,
    seed: options.seed,
    inviteCode: lobby.inviteCode,
    url: `http://${host}`,
    command: lobbyCommand(host),
  }
}

function handleSocketMessage(ws: ServerWebSocket, message: string) {
  if (message === "state") {
    ws.send(JSON.stringify(lobby.snapshot()))
    return
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(message) as Record<string, unknown>
  } catch {
    return
  }

  if (payload.type === "sync" && payload.state && typeof payload.state === "object") {
    const state = payload.state as Record<string, unknown>
    lobby.updateCoopState({
      playerId: ws.data.id,
      floor: state.floor as number,
      turn: state.turn as number,
      hp: state.hp as number,
      x: state.x as number,
      y: state.y as number,
      combatActive: Boolean(state.combatActive),
    })
    broadcastState()
  }
  if (payload.type === "combat-start" && Array.isArray(payload.order)) {
    lobby.startCombatTurnOrder(payload.order.map(String))
    broadcastState()
  }
  if (payload.type === "combat-next") {
    lobby.advanceCombatTurn()
    broadcastState()
  }
  if (payload.type === "combat-end") {
    lobby.endCombat()
    broadcastState()
  }
}

function broadcastState() {
  const payload = JSON.stringify(lobby.snapshot())
  for (const socket of sockets) socket.send(payload)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  })
}

function renderLobbyPage(host: string): string {
  const command = lobbyCommand(host)
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>opendungeon Lobby</title>
    <style>
      body { margin: 0; background: #05070a; color: #d8dee9; font: 16px ui-monospace, SFMono-Regular, Menlo, monospace; }
      main { max-width: 880px; margin: 0 auto; padding: 32px; }
      h1 { color: #d6a85c; font-size: 22px; }
      code, pre { background: #111820; color: #7dffb2; padding: 12px; display: block; overflow-x: auto; }
      code { display: inline; padding: 2px 5px; }
      section { border-top: 1px solid #303640; margin-top: 24px; padding-top: 20px; }
      li { margin: 8px 0; }
      .muted { color: #8f9ba8; }
    </style>
  </head>
  <body>
    <main>
      <h1>opendungeon Lobby</h1>
      <p>Mode <strong>${options.mode}</strong> · Seed <strong>${options.seed}</strong> · Invite <strong>${lobby.inviteCode}</strong></p>
      <pre>${command}</pre>
      <p class="muted">Share this URL and the command with friends on the same network.</p>
      <p class="muted">Spectators can open this page with <code>?role=spectator</code>.</p>
      <section>
        <h2>Players</h2>
        <ul id="players"><li class="muted">Waiting...</li></ul>
      </section>
      <section>
        <h2>Spectators</h2>
        <ul id="spectators"><li class="muted">None</li></ul>
      </section>
      <section>
        <h2>Co-op State</h2>
        <ul id="coop"><li class="muted">No sync packets yet.</li></ul>
        <p id="combat" class="muted">Combat turn coordination idle.</p>
      </section>
      <section>
        <h2>Leaderboard</h2>
        <ul id="leaderboard"><li class="muted">No results yet.</li></ul>
      </section>
    </main>
    <script>
      const params = new URLSearchParams(location.search);
      const role = params.get("role") === "spectator" ? "spectator" : "player";
      const name = params.get("name") || (role === "spectator" ? "Spectator" : "Crawler");
      const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws?name=" + encodeURIComponent(name) + "&role=" + role);
      ws.onmessage = (event) => {
        const state = JSON.parse(event.data);
        document.querySelector("#players").innerHTML = state.players.length
          ? state.players.map((player) => "<li>" + player.name + "</li>").join("")
          : '<li class="muted">Waiting...</li>';
        document.querySelector("#spectators").innerHTML = state.spectators.length
          ? state.spectators.map((player) => "<li>" + player.name + "</li>").join("")
          : '<li class="muted">None</li>';
        document.querySelector("#coop").innerHTML = state.coopStates.length
          ? state.coopStates.map((sync) => "<li>" + sync.name + " · floor " + sync.floor + " · turn " + sync.turn + " · hp " + sync.hp + " · (" + sync.x + "," + sync.y + ")</li>").join("")
          : '<li class="muted">No sync packets yet.</li>';
        document.querySelector("#combat").textContent = state.combat.active
          ? "Round " + state.combat.round + " · active player " + state.combat.activePlayerId
          : "Combat turn coordination idle.";
        document.querySelector("#leaderboard").innerHTML = state.leaderboard.length
          ? state.leaderboard.map((result) => "<li>" + result.name + " · " + result.status + " · score " + result.score + " · floor " + result.floor + " · " + result.turns + " turns</li>").join("")
          : '<li class="muted">No results yet.</li>';
      };
    </script>
  </body>
</html>`
}

function lobbyCommand(host: string) {
  return `OPENDUNGEON_MODE=${options.mode} OPENDUNGEON_SEED=${options.seed} OPENDUNGEON_LOBBY_URL=http://${host} bun run dev`
}
