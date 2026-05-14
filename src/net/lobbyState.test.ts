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

    lobby.updateCoopState({ playerId: "p1", classId: "cleric", floor: 2, turn: 15, hp: 18, x: 4, y: 8, combatActive: true, tutorialStage: "movement", tutorialReady: true })
    lobby.startCombatTurnOrder(["p2", "p1", "missing"])
    expect(lobby.snapshot().coopStates[0]).toMatchObject({ name: "Mira", classId: "cleric", floor: 2, combatActive: true, tutorialStage: "movement", tutorialReady: true, tutorialCompleted: false })
    expect(lobby.snapshot().combat).toMatchObject({ active: true, activePlayerId: "p2", round: 1 })

    lobby.advanceCombatTurn()
    expect(lobby.snapshot().combat.activePlayerId).toBe("p1")
    lobby.advanceCombatTurn()
    expect(lobby.snapshot().combat).toMatchObject({ activePlayerId: "p2", round: 2 })
  })

  test("queues approved GM patches for host delivery snapshots", () => {
    const lobby = new MultiplayerLobbyState({ mode: "coop", seed: 1234, now: () => 25 })

    const patch = lobby.deliverGmPatch({
      id: "gm-hard-room",
      title: "Make the shrine fight harder",
      difficulty: "harder",
      briefing: "More guards arrive, but the wounded path still works.",
      operations: [
        { path: "rules.enemyHpMultiplier", value: 1.25 },
        { path: "floors.2.encounterBudget", value: 5 },
      ],
    })

    expect(patch).toMatchObject({ id: "gm-hard-room", difficulty: "harder", operationCount: 2 })
    expect(lobby.snapshot().gmPatches[0]).toMatchObject({
      briefing: "More guards arrive, but the wounded path still works.",
      id: "gm-hard-room",
      operationCount: 2,
    })
    expect(lobby.snapshot().gmPatches[0]?.operations.map((operation) => operation.path)).toEqual(["rules.enemyHpMultiplier", "floors.2.encounterBudget"])
  })

  test("stress-tests larger co-op party state and combat turn order", () => {
    const lobby = new MultiplayerLobbyState({ mode: "coop", seed: 5678, now: () => 30 })
    for (const id of ["warden", "arcanist", "ranger", "cleric"]) lobby.join(id, id)
    lobby.join("observer", "Designer", "spectator")

    lobby.updateCoopState({ playerId: "warden", floor: 3, turn: 42, hp: 24, x: 10, y: 10, combatActive: true })
    lobby.updateCoopState({ playerId: "arcanist", floor: 3, turn: 41, hp: 12, x: 11, y: 10, combatActive: true })
    lobby.updateCoopState({ playerId: "ranger", floor: 3, turn: 42, hp: 18, x: 9, y: 10, combatActive: true })
    lobby.updateCoopState({ playerId: "cleric", floor: 3, turn: 40, hp: 20, x: 10, y: 11, combatActive: false })
    lobby.startCombatTurnOrder(["warden", "arcanist", "ranger", "cleric", "observer"])

    const snapshot = lobby.snapshot()
    expect(snapshot.players).toHaveLength(4)
    expect(snapshot.spectators).toHaveLength(1)
    expect(snapshot.coopStates).toHaveLength(4)
    expect(snapshot.combat.order).toEqual(["warden", "arcanist", "ranger", "cleric"])

    for (let index = 0; index < 4; index++) lobby.advanceCombatTurn()
    expect(lobby.snapshot().combat).toMatchObject({ activePlayerId: "warden", round: 2 })
  })

  test("tracks co-op stat, inventory, save conflict, disconnect, and race submission edge cases", () => {
    let now = 40
    const lobby = new MultiplayerLobbyState({ mode: "coop", seed: 9999, now: () => now++ })
    lobby.join("p1", "Warden")
    lobby.join("p2", "Arcanist")
    lobby.join("p3", "Ranger")
    lobby.join("spec", "Spectator", "spectator")

    lobby.updateCoopState({ playerId: "p1", floor: 4, turn: 100, hp: 21, level: 4, unspentStatPoints: 0, inventoryCount: 18, gold: 55, saveRevision: 7, x: 5, y: 6, combatActive: true })
    lobby.updateCoopState({ playerId: "p2", floor: 4, turn: 99, hp: 10, level: 4, unspentStatPoints: 2, inventoryCount: 27, gold: 12, saveRevision: 8, x: 6, y: 6, combatActive: true })
    lobby.updateCoopState({ playerId: "p3", floor: 3, turn: 96, hp: 16, level: 3, unspentStatPoints: 0, inventoryCount: 12, gold: 30, saveRevision: 7, x: 2, y: 2, combatActive: false })
    lobby.startCombatTurnOrder(["p1", "p2", "p3", "spec"])
    lobby.markDisconnected("p2")
    lobby.submitRaceResult({ name: "Warden", status: "victory", floor: 5, turns: 120, gold: 70, kills: 10, score: 160 })
    lobby.submitRaceResult({ name: "Ranger", status: "dead", floor: 4, turns: 80, gold: 35, kills: 5, score: 90 })

    const snapshot = lobby.snapshot()
    expect(snapshot.coopStates.find((state) => state.playerId === "p2")).toMatchObject({ connected: false, unspentStatPoints: 2, inventoryCount: 27, saveRevision: 8 })
    expect(snapshot.syncWarnings).toContain("Co-op players are split across floors.")
    expect(snapshot.syncWarnings).toContain("Save revisions differ across clients.")
    expect(snapshot.syncWarnings).toContain("At least one player is disconnected.")
    expect(snapshot.syncWarnings).toContain("A player has unspent stat points.")
    expect(snapshot.syncWarnings).toContain("A player inventory is over the expected sync size.")
    expect(snapshot.leaderboard.map((result) => result.name)).toEqual(["Warden", "Ranger"])
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
