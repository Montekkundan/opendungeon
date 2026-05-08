import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MultiplayerLobbyState, createInviteCode, loadRaceResults, saveRaceResults } from "./lobbyState.js"

describe("multiplayer lobby state", () => {
  test("creates stable invite codes and separates friends from spectators", () => {
    const lobby = new MultiplayerLobbyState({ mode: "coop", seed: 1234, now: () => 10 })
    lobby.join("p1", "Mira", "player")
    lobby.join("s1", "Work Friend", "spectator")

    const snapshot = lobby.snapshot()
    expect(snapshot.inviteCode).toBe(createInviteCode(1234, "coop"))
    expect(snapshot.players.map((player) => player.name)).toEqual(["Mira"])
    expect(snapshot.spectators.map((player) => player.name)).toEqual(["Work Friend"])
  })

  test("tracks live co-op state sync and combat turn coordination", () => {
    const lobby = new MultiplayerLobbyState({ mode: "coop", seed: 1234, now: () => 20 })
    lobby.join("p1", "Mira")
    lobby.join("p2", "Nyx")

    lobby.updateCoopState({ playerId: "p1", floor: 2, turn: 15, hp: 18, x: 4, y: 8, combatActive: true })
    lobby.startCombatTurnOrder(["p2", "p1", "missing"])
    expect(lobby.snapshot().coopStates[0]).toMatchObject({ name: "Mira", floor: 2, combatActive: true })
    expect(lobby.snapshot().combat).toMatchObject({ active: true, activePlayerId: "p2", round: 1 })

    lobby.advanceCombatTurn()
    expect(lobby.snapshot().combat.activePlayerId).toBe("p1")
    lobby.advanceCombatTurn()
    expect(lobby.snapshot().combat).toMatchObject({ activePlayerId: "p2", round: 2 })
  })

  test("persists race leaderboard results", () => {
    const root = mkdtempSync(join(tmpdir(), "opendungeon-lobby-"))
    try {
      const path = join(root, "leaderboard.json")
      saveRaceResults(path, [
        { name: "Slow", status: "dead", floor: 2, turns: 80, gold: 5, kills: 1, score: 30, submittedAt: 1 },
        { name: "Winner", status: "victory", floor: 5, turns: 60, gold: 20, kills: 6, score: 100, submittedAt: 2 },
      ])

      expect(JSON.parse(readFileSync(path, "utf8"))[0].name).toBe("Winner")
      expect(loadRaceResults(path).map((result) => result.name)).toEqual(["Winner", "Slow"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
