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

    const mira = await openLobbySocket(`${baseUrl}/ws?name=Mira&clientId=mira`)
    const sol = await openLobbySocket(`${baseUrl}/ws?name=Sol&clientId=sol`)
    const spectator = await openLobbySocket(`${baseUrl}/ws?role=spectator&name=Observer&clientId=obs`)
    sockets.push(mira, sol, spectator)

    const joined = await waitForSnapshot(mira, (snapshot) => snapshot.players.length === 2 && snapshot.spectators.length === 1)
    expect(joined.players.map((player) => player.name).sort()).toEqual(["Mira", "Sol"])
    expect(joined.spectators[0]?.name).toBe("Observer")

    mira.send(JSON.stringify({ type: "sync", state: syncState("ranger", 1, 4, 5, "movement", true) }))
    sol.send(JSON.stringify({ type: "sync", state: syncState("cleric", 1, 5, 5, "movement", false) }))
    const synced = await waitForSnapshot(sol, (snapshot) => snapshot.coopStates.length === 2)
    expect(synced.coopStates.map((state) => state.name).sort()).toEqual(["Mira", "Sol"])
    expect(synced.coopStates.find((state) => state.name === "Mira")).toMatchObject({ x: 4, y: 5, tutorialReady: true })

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
