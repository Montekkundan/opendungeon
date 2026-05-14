import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { WebSocketServer, type RawData, type WebSocket } from "ws"
import { advertisedLobbyUrls, hostListenErrorMessage, lobbyEnvCommand, lobbyJoinCommand, parseLobbyHostArgs, preferredAdvertisedLobbyUrl, requestLobbyUrl } from "./hostConfig.js"
import { HostCommandRelay } from "./hostCommandRelay.js"
import { MultiplayerLobbyState, loadRaceResults, saveRaceResults, type LobbyRole } from "./lobbyState.js"

type LobbySocketData = {
  id: string
  name: string
  role: LobbyRole
}

type LobbyWebSocket = WebSocket & { data: LobbySocketData }

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`opendungeon-host

Usage:
  opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737
  opendungeon-host --host 0.0.0.0 --public-url http://YOUR_SERVER_IP:3737

Options:
  --host <address>       Bind address. Use 0.0.0.0 for LAN/server hosting.
  --public-url <url>     Public URL printed in invites when behind a proxy or on a VPS.
  --port <port>          TCP port. Defaults to PORT or 3737.
  --mode <coop|race>     Multiplayer lobby variant. coop shares the authored story; race is a same-seed challenge.
  --seed <number>        Shared dungeon seed.
  --invite <code>        Optional stable invite code.
  --leaderboard <path>   Persist race leaderboard JSON.
`)
  process.exit(0)
}

const options = parseLobbyHostArgs(process.argv.slice(2))
const lobby = new MultiplayerLobbyState({
  mode: options.mode,
  seed: options.seed,
  inviteCode: options.inviteCode,
  initialResults: options.leaderboardPath ? loadRaceResults(options.leaderboardPath) : [],
})
const commandRelay = new HostCommandRelay({ mode: options.mode, seed: options.seed })
const sockets = new Set<LobbyWebSocket>()

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${options.port}`}`)
  const publicUrl = requestLobbyUrl(request.headers.host, options, request.headers["x-forwarded-proto"])

  if (url.pathname === "/health" || url.pathname === "/healthz") return sendJson(response, healthPayload())
  if (url.pathname === "/state") return sendJson(response, lobby.snapshot())
  if (url.pathname === "/leaderboard") return sendJson(response, lobby.leaderboard())
  if (url.pathname === "/actions") return sendJson(response, lobby.snapshot().actions)
  if (url.pathname === "/commands") return sendJson(response, lobby.snapshot().commands)
  if (url.pathname === "/invite") return sendJson(response, invitePayload(publicUrl))
  if (url.pathname === "/finish" && request.method === "POST") return void submitResult(request, response)
  if (url.pathname === "/gm/patches" && request.method === "GET") return sendJson(response, lobby.snapshot().gmPatches)
  if (url.pathname === "/gm/patches" && request.method === "POST") return void submitGmPatch(request, response)
  if (url.pathname === "/") return sendText(response, 200, renderLobbyPage(publicUrl), "text/html; charset=utf-8")

  sendText(response, 404, "Not found")
})
const websocketServer = new WebSocketServer({ noServer: true })

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${options.port}`}`)
  if (url.pathname !== "/ws") {
    socket.destroy()
    return
  }
  const role: LobbyRole = url.searchParams.get("role") === "spectator" ? "spectator" : "player"
  const name = url.searchParams.get("name")?.trim() || (role === "spectator" ? "Spectator" : "Crawler")
  const data: LobbySocketData = { id: cleanClientId(url.searchParams.get("clientId")) || crypto.randomUUID(), name, role }
  websocketServer.handleUpgrade(request, socket, head, (socket) => {
    const ws = socket as LobbyWebSocket
    ws.data = data
    websocketServer.emit("connection", ws, request)
  })
})

websocketServer.on("connection", (ws: LobbyWebSocket) => {
  lobby.join(ws.data.id, ws.data.name, ws.data.role)
  sockets.add(ws)
  broadcastState()
  ws.on("close", () => {
    lobby.leave(ws.data.id)
    sockets.delete(ws)
    broadcastState()
  })
  ws.on("message", (message) => handleSocketMessage(ws, message))
})

server.on("error", (error) => {
  console.error(hostListenErrorMessage(error, options))
  process.exit(1)
})
server.listen(options.port, options.bindHost, printStartup)

function submitResult(request: IncomingMessage, response: ServerResponse) {
  readJsonBody(request)
    .then((body) => {
      const result = lobby.submitRaceResult(body)
      if (options.leaderboardPath) saveRaceResults(options.leaderboardPath, lobby.leaderboard())
      broadcastState()
      sendJson(response, result, 201)
    })
    .catch(() => sendJson(response, { error: "invalid result payload" }, 400))
}

function submitGmPatch(request: IncomingMessage, response: ServerResponse) {
  readJsonBody(request)
    .then((body) => {
      const patch = lobby.deliverGmPatch({
        id: body.id as string,
        title: body.title as string,
        difficulty: body.difficulty as "easier" | "steady" | "harder" | "deadly",
        briefing: body.briefing as string,
        operationCount: body.operationCount as number,
        operations: Array.isArray(body.operations) ? body.operations : undefined,
      })
      broadcastState()
      sendJson(response, patch, 201)
    })
    .catch(() => sendJson(response, { error: "invalid GM patch payload" }, 400))
}

function healthPayload() {
  return {
    ok: true,
    mode: options.mode,
    seed: options.seed,
    inviteCode: lobby.inviteCode,
    players: lobby.snapshot().players.length,
    spectators: lobby.snapshot().spectators.length,
  }
}

function invitePayload(publicUrl: string) {
  return {
    mode: options.mode,
    seed: options.seed,
    inviteCode: lobby.inviteCode,
    url: publicUrl,
    command: lobbyJoinCommand(publicUrl),
    envCommand: lobbyEnvCommand(publicUrl, options),
  }
}

function handleSocketMessage(ws: LobbyWebSocket, message: RawData) {
  const text = message.toString("utf8")
  if (text === "state") {
    ws.send(JSON.stringify(lobby.snapshot()))
    return
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(text) as Record<string, unknown>
  } catch {
    return
  }

  if (payload.type === "sync" && payload.state && typeof payload.state === "object") {
    const state = payload.state as Record<string, unknown>
    lobby.updateCoopState({
      playerId: ws.data.id,
      classId: state.classId as string,
      floor: state.floor as number,
      turn: state.turn as number,
      hp: state.hp as number,
      level: state.level as number,
      unspentStatPoints: state.unspentStatPoints as number,
      inventoryCount: state.inventoryCount as number,
      gold: state.gold as number,
      saveRevision: state.saveRevision as number,
      x: state.x as number,
      y: state.y as number,
      combatActive: Boolean(state.combatActive),
      tutorialStage: state.tutorialStage as string,
      tutorialReady: Boolean(state.tutorialReady),
      tutorialCompleted: Boolean(state.tutorialCompleted),
    })
    broadcastState()
  }
  if (payload.type === "action") {
    lobby.recordAction({
      playerId: ws.data.id,
      type: payload.actionType,
      label: payload.label,
      floor: payload.floor,
      turn: payload.turn,
      hp: payload.hp,
      x: payload.x,
      y: payload.y,
    })
    broadcastState()
  }
  if (payload.type === "command") {
    const commandType = payload.commandType
    const label = payload.label
    const commandPayload = normalizeSocketCommandPayload(payload.payload, payload)
    const result = commandRelay.apply({
      label: typeof label === "string" ? label : "",
      name: ws.data.name,
      payload: commandPayload,
      playerId: ws.data.id,
      type: commandType === "move" || commandType === "combat" || commandType === "inventory" || commandType === "village" ? commandType : "interact",
    })
    lobby.recordCommand({
      playerId: ws.data.id,
      type: commandType,
      label,
      floor: payload.floor,
      turn: payload.turn,
      hp: payload.hp,
      x: payload.x,
      y: payload.y,
      payload: commandPayload,
      result,
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
  for (const socket of sockets) {
    if (socket.readyState === 1) socket.send(payload)
  }
}

function sendJson(response: ServerResponse, body: unknown, status = 200) {
  sendText(response, status, JSON.stringify(body, null, 2), "application/json; charset=utf-8")
}

function sendText(response: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "content-type": contentType })
  response.end(body)
}

function readJsonBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => {
      body += chunk
      if (body.length > 128_000) {
        request.destroy()
        reject(new Error("Payload too large."))
      }
    })
    request.on("error", reject)
    request.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}")
        resolve(typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {})
      } catch {
        reject(new Error("Invalid JSON."))
      }
    })
  })
}

function renderLobbyPage(publicUrl: string): string {
  const command = htmlEscape(lobbyJoinCommand(publicUrl))
  const legacyCommand = htmlEscape(lobbyEnvCommand(publicUrl, options))
  const mode = htmlEscape(options.mode)
  const inviteCode = htmlEscape(lobby.inviteCode)
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
      <p>Mode <strong>${mode}</strong> · Seed <strong>${options.seed}</strong> · Invite <strong>${inviteCode}</strong></p>
      <pre>${command}</pre>
      <p class="muted">Share this URL and join command with friends. Use a LAN IP for home networks or a public domain/IP for internet servers.</p>
      <p class="muted">Legacy env command:</p>
      <pre>${legacyCommand}</pre>
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
        <h2>Action Log</h2>
        <ul id="actions"><li class="muted">No player actions yet.</li></ul>
      </section>
      <section>
        <h2>Accepted Commands</h2>
        <ul id="commands"><li class="muted">No accepted commands yet.</li></ul>
      </section>
      <section>
        <h2>GM Patches</h2>
        <ul id="gm-patches"><li class="muted">No approved GM patches delivered yet.</li></ul>
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
          ? state.coopStates.map((sync) => "<li>" + sync.name + " · " + sync.classId + " · floor " + sync.floor + " · turn " + sync.turn + " · hp " + sync.hp + " · (" + sync.x + "," + sync.y + ") · tutorial " + sync.tutorialStage + (sync.tutorialReady ? " ready" : " waiting") + "</li>").join("")
          : '<li class="muted">No sync packets yet.</li>';
        document.querySelector("#combat").textContent = state.combat.active
          ? "Round " + state.combat.round + " · active player " + state.combat.activePlayerId
          : "Combat turn coordination idle.";
        document.querySelector("#actions").innerHTML = state.actions && state.actions.length
          ? state.actions.slice(0, 12).map((action) => "<li>" + action.name + " · " + action.type + " · F" + action.floor + " T" + action.turn + " · " + action.label + "</li>").join("")
          : '<li class="muted">No player actions yet.</li>';
        document.querySelector("#commands").innerHTML = state.commands && state.commands.length
          ? state.commands.slice(0, 12).map((command) => "<li>#" + command.sequence + " · " + command.name + " · " + command.type + " · " + command.label + " · " + command.result.message + "</li>").join("")
          : '<li class="muted">No accepted commands yet.</li>';
        document.querySelector("#gm-patches").innerHTML = state.gmPatches.length
          ? state.gmPatches.map((patch) => "<li>" + patch.title + " · " + patch.difficulty + " · " + patch.operationCount + " ops</li>").join("")
          : '<li class="muted">No approved GM patches delivered yet.</li>';
        document.querySelector("#leaderboard").innerHTML = state.leaderboard.length
          ? state.leaderboard.map((result) => "<li>" + result.name + " · " + result.status + " · score " + result.score + " · floor " + result.floor + " · " + result.turns + " turns</li>").join("")
          : '<li class="muted">No results yet.</li>';
      };
    </script>
  </body>
</html>`
}

function cleanClientId(value: string | null) {
  const id = value?.trim() ?? ""
  return /^[A-Za-z0-9_-]{4,80}$/.test(id) ? id : ""
}

function htmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function normalizeSocketCommandPayload(value: unknown, fallback: Record<string, unknown>) {
  const payload: Record<string, string | number | boolean> = {}
  if (value && typeof value === "object") {
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") payload[key] = raw
    }
  }
  for (const key of ["floor", "hp", "turn", "x", "y"]) {
    const raw = fallback[key]
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") payload[key] = raw
  }
  return payload
}

function printStartup() {
  const urls = advertisedLobbyUrls(options)
  const preferredUrl = preferredAdvertisedLobbyUrl(options, urls)
  console.log(`opendungeon lobby`)
  console.log(`Mode: ${options.mode}`)
  console.log(`Seed: ${options.seed}`)
  console.log(`Invite: ${lobby.inviteCode}`)
  console.log(`Bind: ${options.bindHost}:${options.port}`)
  console.log(`Health: ${preferredUrl}/health`)
  console.log(`Join: ${lobbyJoinCommand(preferredUrl)}`)
  console.log(`Legacy: ${lobbyEnvCommand(preferredUrl, options)}`)
  console.log(`URLs:`)
  for (const url of urls) console.log(`  ${url}`)
  if (options.bindHost === "127.0.0.1" || options.bindHost === "localhost") console.log(`LAN: use --host 0.0.0.0 to share from another device.`)
}
