import { expect, test } from "bun:test"
import { once } from "node:events"
import { createServer } from "node:net"
import type { AddressInfo } from "node:net"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { WebSocket } from "ws"
import type { RawData } from "ws"
import type { LobbySnapshot } from "./lobbyState.js"

test("host starts, accepts two players plus a spectator, syncs state, disconnects, and records race results", async () => {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const host = spawn(process.execPath, ["run", "src/net/host.ts", "--host", "127.0.0.1", "--mode", "coop", "--seed", "2423368", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: "1" },
  })
  drain(host)

  const sockets: WebSocket[] = []
  try {
    await waitForHealth(baseUrl)
    const health = (await fetchJson(`${baseUrl}/health`)) as { ok: boolean; seed: number; players: number }
    expect(health).toMatchObject({ ok: true, seed: 2423368, players: 0 })

    const signedInKey = "a".repeat(64)
    const mira = await openLobbySocket(`${baseUrl}/ws?name=Mira&clientId=mira&accountKey=${signedInKey}&accountLabel=github:mira&terminalApp=Ghostty`)
    const sol = await openLobbySocket(`${baseUrl}/ws?name=Sol&clientId=sol`)
    const spectator = await openLobbySocket(`${baseUrl}/ws?role=spectator&name=Observer&clientId=obs`)
    sockets.push(mira, sol, spectator)

    const joined = await waitForSnapshot(mira, (snapshot) => snapshot.players.length === 2 && snapshot.spectators.length === 1)
    expect(joined.players.map((player) => player.name).sort()).toEqual(["Mira", "Sol"])
    expect(joined.spectators[0]?.name).toBe("Observer")

    const duplicate = await openLobbySocketExpectError(`${baseUrl}/ws?name=Mira2&clientId=mira2&accountKey=${signedInKey}&accountLabel=github:mira&terminalApp=Terminal`)
    sockets.push(duplicate.socket)
    expect(duplicate.message).toContain("already in this lobby from Ghostty")

    mira.send(JSON.stringify({ type: "sync", state: syncState("ranger", 1, 4, 5, "movement", true) }))
    sol.send(JSON.stringify({ type: "sync", state: syncState("cleric", 1, 5, 5, "movement", false) }))
    const synced = await waitForSnapshot(sol, (snapshot) => snapshot.coopStates.length === 2)
    expect(synced.coopStates.map((state) => state.name).sort()).toEqual(["Mira", "Sol"])
    expect(synced.coopStates.find((state) => state.name === "Mira")).toMatchObject({ x: 4, y: 5, tutorialReady: true })

    mira.send(JSON.stringify({ type: "command", commandType: "move", label: "Moved east", floor: 1, turn: 2, hp: 19, x: 5, y: 5, payload: { direction: "east" } }))
    sol.send(JSON.stringify({ type: "command", commandType: "interact", label: "Opened Book", floor: 1, turn: 3, hp: 19, x: 5, y: 5, payload: { target: "book" } }))
    const actionState = await waitForSnapshot(spectator, (snapshot) => snapshot.actions.length === 2 && snapshot.commands.length === 2)
    expect(actionState.actions.map((action) => action.name).sort()).toEqual(["Mira", "Sol"])
    expect(actionState.actions).toContainEqual(expect.objectContaining({ label: "Opened Book", type: "interact" }))
    expect(actionState.commands.map((command) => command.sequence).sort()).toEqual([1, 2])
    expect(actionState.commands).toContainEqual(expect.objectContaining({ accepted: true, label: "Opened Book", type: "interact" }))
    expect(actionState.commands.find((command) => command.label === "Opened Book")?.result.message).toBeTruthy()
    const actions = (await fetchJson(`${baseUrl}/actions`)) as Array<{ label: string }>
    expect(actions.map((action) => action.label)).toContain("Moved east")
    const commands = (await fetchJson(`${baseUrl}/commands`)) as Array<{ label: string; payload: Record<string, string>; result: { accepted: boolean } }>
    expect(commands.map((command) => command.label)).toContain("Moved east")
    expect(commands.find((command) => command.label === "Moved east")?.payload.direction).toBe("east")
    expect(commands.find((command) => command.label === "Moved east")?.result.accepted).toBe(true)

    const state = (await fetchJson(`${baseUrl}/state`)) as LobbySnapshot
    expect(state.coopStates.map((sync) => sync.name).sort()).toEqual(["Mira", "Sol"])

    const gmPatch = await fetchJson(`${baseUrl}/gm/patches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "gm-hard-room",
        title: "Make Floor 2 harder",
        difficulty: "harder",
        briefing: "The GM adds guards but leaves a clever route.",
        operations: [
          { path: "rules.enemyHpMultiplier", value: 1.25 },
          { path: "floors.2.encounterBudget", value: 5 },
        ],
      }),
    })
    expect(gmPatch).toMatchObject({ id: "gm-hard-room", difficulty: "harder", operationCount: 2 })
    const patches = (await fetchJson(`${baseUrl}/gm/patches`)) as Array<{ id: string }>
    expect(patches[0]?.id).toBe("gm-hard-room")

    sol.close()
    const disconnected = await waitForSnapshot(mira, (snapshot) => snapshot.players.length === 1 && snapshot.coopStates.length === 1)
    expect(disconnected.players.map((player) => player.name)).toEqual(["Mira"])

    const result = await fetchJson(`${baseUrl}/finish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Mira", status: "victory", floor: 5, turns: 120, gold: 70, kills: 8, score: 180 }),
    })
    expect(result).toMatchObject({ name: "Mira", status: "victory", floor: 5 })
    const leaderboard = (await fetchJson(`${baseUrl}/leaderboard`)) as Array<{ name: string }>
    expect(leaderboard[0]?.name).toBe("Mira")
  } finally {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close()
    }
    await stopHost(host)
  }
}, 10_000)

test("host keeps co-op tutorial movement streams smooth per player", async () => {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const host = spawn(process.execPath, ["run", "src/net/host.ts", "--host", "127.0.0.1", "--mode", "coop", "--seed", "2423368", "--port", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NO_COLOR: "1" },
  })
  drain(host)

  const sockets: WebSocket[] = []
  try {
    await waitForHealth(baseUrl)
    const mira = await openLobbySocket(`${baseUrl}/ws?name=Mira&clientId=mira`)
    const sol = await openLobbySocket(`${baseUrl}/ws?name=Sol&clientId=sol`)
    sockets.push(mira, sol)

    mira.send(JSON.stringify({ type: "sync", state: syncState("ranger", 1, 10, 10, "movement", false) }))
    sol.send(JSON.stringify({ type: "sync", state: syncState("ranger", 1, 12, 10, "movement", false) }))
    await waitForSnapshot(mira, (snapshot) => snapshot.coopStates.length === 2)

    const tutorialPayload = { classId: "ranger", direction: "east", tutorialEnabled: true, tutorialStage: "movement" }
    mira.send(JSON.stringify({ type: "command", commandType: "move", label: "Moved east", floor: 1, turn: 1, hp: 19, x: 10, y: 10, payload: tutorialPayload }))
    mira.send(JSON.stringify({ type: "command", commandType: "move", label: "Moved east", floor: 1, turn: 2, hp: 19, x: 11, y: 10, payload: tutorialPayload }))
    sol.send(JSON.stringify({ type: "command", commandType: "move", label: "Moved east", floor: 1, turn: 1, hp: 19, x: 12, y: 10, payload: tutorialPayload }))

    const moved = await waitForSnapshot(sol, (snapshot) => snapshot.commands.length >= 3)
    const commands = moved.commands.slice().sort((left, right) => left.sequence - right.sequence)
    const miraFirst = commands[0]?.result
    const miraSecond = commands[1]?.result
    const solFirst = commands[2]?.result
    expect(miraFirst?.accepted).toBe(true)
    expect(miraSecond?.x).toBeGreaterThan(miraFirst?.x ?? 0)
    expect(solFirst).toMatchObject({ accepted: true, x: 13, y: 10 })
    expect(moved.coopStates.find((state) => state.name === "Mira")).toMatchObject({ x: miraSecond?.x, y: 10 })
    expect(moved.coopStates.find((state) => state.name === "Sol")).toMatchObject({ x: 13, y: 10 })

    mira.send(JSON.stringify({ type: "command", commandType: "move", label: "Moved nowhere", floor: 1, turn: 3, hp: 19, x: 10, y: 10, payload: {} }))
    const rejected = await waitForSnapshot(sol, (snapshot) => snapshot.commands.some((command) => command.label === "Moved nowhere"))
    expect(rejected.commands.find((command) => command.label === "Moved nowhere")?.result.accepted).toBe(false)
    expect(rejected.coopStates.find((state) => state.name === "Mira")).toMatchObject({ x: miraSecond?.x, y: miraSecond?.y })
  } finally {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close()
    }
    await stopHost(host)
  }
}, 10_000)

async function freePort() {
  const server = createServer()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = (server.address() as AddressInfo).port
  server.close()
  await once(server, "close")
  return port
}

function drain(host: ChildProcessWithoutNullStreams) {
  host.stdout.resume()
  host.stderr.resume()
}

async function waitForHealth(baseUrl: string) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error(`Lobby host did not become healthy at ${baseUrl}.`)
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.json()
}

function openLobbySocket(url: string) {
  const wsUrl = url.replace(/^http:/, "ws:")
  const socket = new WebSocket(wsUrl)
  return new Promise<WebSocket>((resolve, reject) => {
    const fail = setTimeout(() => reject(new Error(`Timed out opening ${wsUrl}`)), 3_000)
    socket.once("open", () => {
      clearTimeout(fail)
      resolve(socket)
    })
    socket.once("error", reject)
  })
}

function openLobbySocketExpectError(url: string) {
  const wsUrl = url.replace(/^http:/, "ws:")
  const socket = new WebSocket(wsUrl)
  return new Promise<{ message: string; socket: WebSocket }>((resolve, reject) => {
    const fail = setTimeout(() => reject(new Error(`Timed out waiting for ${wsUrl} to reject`)), 3_000)
    socket.once("error", reject)
    socket.on("message", (message) => {
      try {
        const payload = JSON.parse(message.toString()) as { message?: string; type?: string }
        if (payload.type === "error" && payload.message) {
          clearTimeout(fail)
          resolve({ message: payload.message, socket })
        }
      } catch {
        // Ignore non-error frames.
      }
    })
  })
}

function waitForSnapshot(socket: WebSocket, predicate: (snapshot: LobbySnapshot) => boolean) {
  return new Promise<LobbySnapshot>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error("Timed out waiting for lobby snapshot."))
    }, 5_000)
    const poll = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send("state")
    }, 50)
    const onMessage = (message: RawData) => {
      try {
        const snapshot = JSON.parse(message.toString()) as LobbySnapshot
        if (predicate(snapshot)) {
          cleanup()
          resolve(snapshot)
        }
      } catch {
        // Ignore malformed frames; the host only sends snapshots here.
      }
    }
    const cleanup = () => {
      clearTimeout(timeout)
      clearInterval(poll)
      socket.off("message", onMessage)
    }
    socket.on("message", onMessage)
    if (socket.readyState === WebSocket.OPEN) socket.send("state")
  })
}

function syncState(classId: string, floor: number, x: number, y: number, tutorialStage: string, tutorialReady: boolean) {
  return {
    classId,
    floor,
    turn: 1,
    hp: 19,
    level: 1,
    unspentStatPoints: 0,
    inventoryCount: 3,
    gold: 0,
    saveRevision: 1,
    x,
    y,
    combatActive: false,
    tutorialStage,
    tutorialReady,
    tutorialCompleted: false,
  }
}

async function stopHost(host: ChildProcessWithoutNullStreams) {
  if (host.exitCode !== null || host.killed) return
  host.kill("SIGTERM")
  await Promise.race([once(host, "exit"), new Promise((resolve) => setTimeout(resolve, 1_000))])
  if (host.exitCode === null && !host.killed) host.kill("SIGKILL")
}
