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

  test("rejects duplicate signed-in player identities while allowing guests", () => {
    const lobby = new MultiplayerLobbyState({ mode: "coop", seed: 1234, now: () => 10 })
    lobby.join("guest-1", "Guest One")
    lobby.join("guest-2", "Guest Two")
    lobby.join("p1", "Mira", "player", {
      accountKey: "a".repeat(64),
      accountLabel: "github:mira",
      terminalApp: "Ghostty",
    })

    expect(() =>
      lobby.join("p2", "Mira Again", "player", {
        accountKey: "a".repeat(64),
        accountLabel: "github:mira",
        terminalApp: "Terminal",
      })
    ).toThrow("already in this lobby from Ghostty")

    lobby.join("p3", "Sol", "player", {
      accountKey: "b".repeat(64),
      accountLabel: "github:sol",
      terminalApp: "Terminal",
    })

    expect(lobby.snapshot().players.map((player) => player.name)).toEqual([
      "Guest One",
      "Guest Two",
      "Mira",
      "Sol",
    ])
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

  test("accepts typed player commands and mirrors them to the action log", () => {
    let now = 50
    const lobby = new MultiplayerLobbyState({ mode: "coop", seed: 1234, now: () => now++ })
    lobby.join("p1", "Mira")
    lobby.updateCoopState({ playerId: "p1", floor: 1, turn: 2, hp: 19, x: 5, y: 5, combatActive: false })

    const command = lobby.recordCommand({
      playerId: "p1",
      type: "move",
      label: "Moved east",
      floor: 1,
      turn: 2,
      hp: 19,
      x: 5,
      y: 5,
      payload: {
        direction: "east",
        ignored: { nested: true },
        unsafe: "<script>",
      },
      result: {
        accepted: true,
        combatActive: true,
        combatMessage: "Aimed Shot: d20 +2 DEX vs DC 12.",
        combatRound: 2,
        focus: 10,
        floor: 1,
        gold: 7,
        hub: {
          calendar: { day: 2, festival: "market-day", season: "summer", weather: "rain" },
          coins: 12,
          farm: { planted: 2, plots: 8, ready: 1, sprinklers: 1 },
          houses: [{ built: true, name: "Mira House<script>", playerId: "mira" }],
          lootSold: 3,
          preparedFood: ["Stew<script>"],
          stations: [{ built: true, id: "blacksmith", level: 1 }],
          unlocked: true,
          unlockedGear: ["Iron edge"],
          village: {
            permissions: { houses: "friends", shop: "everyone" },
            selectedLocation: "market",
            selectedPermission: "shop",
            shopLog: ["Sold relic<script>"],
          },
        },
        progress: {
          equipment: [
            {
              activeText: "Cuts true<script>",
              bonusDamage: 1,
              id: "iron-edge<script>",
              name: "Iron Edge<script>",
              rarity: "uncommon",
              slot: "weapon",
              statBonuses: { dexterity: 2, unsafe: "bad" },
            },
          ],
          knowledge: [
            {
              discoveredAtTurn: 3,
              floor: 1,
              id: "monster-slime<script>",
              kind: "monster",
              text: "Weak to fire<script>",
              title: "Slime<script>",
            },
          ],
          levelUp: {
            choices: [{ id: "pathfinder<script>", name: "Pathfinder<script>", text: "Read routes<script>" }],
            level: 2,
          },
          log: ["Line<script>"],
          statusEffects: [
            {
              id: "guarded",
              label: "Guarded<script>",
              magnitude: 1,
              remainingTurns: 2,
              source: "shield<script>",
              targetId: "player<script>",
            },
          ],
          talents: ["pathfinder", "<bad>"],
          toasts: [{ id: "toast<script>", text: "Book updated<script>", title: "Found<script>", tone: "success", turn: 3 }],
        },
        hp: 18,
        inventoryCount: 4,
        inventoryItems: ["Rusty blade", "Dew vial", "<bad>", "Ranger charm"],
        level: 2,
        maxFocus: 12,
        maxHp: 26,
        message: "Mira moved east.",
        status: "running",
        tutorialCompleted: false,
        tutorialReady: true,
        tutorialStage: "movement",
        turn: 3,
        x: 6,
        xp: 9,
        y: 5,
      },
    })
    const snapshot = lobby.snapshot()

    expect(command).toMatchObject({
      accepted: true,
      label: "Moved east",
      name: "Mira",
      sequence: 1,
      type: "move",
    })
    expect(command.result).toMatchObject({ accepted: true, message: "Mira moved east." })
    expect(command.payload).toMatchObject({ direction: "east", floor: 1, hp: 19, turn: 2, x: 5, y: 5 })
    expect(command.payload.unsafe).toBe("script")
    expect(snapshot.commands[0]).toMatchObject({ id: command.id, playerId: "p1" })
    expect(snapshot.actions[0]).toMatchObject({ label: "Moved east", name: "Mira", type: "move" })
    expect(snapshot.coopStates[0]).toMatchObject({
      focus: 10,
      gold: 7,
      hp: 18,
      inventoryCount: 4,
      level: 2,
      saveRevision: 3,
      tutorialReady: true,
      tutorialStage: "movement",
      turn: 3,
      x: 6,
      xp: 9,
      y: 5,
    })
    expect(command.result).toMatchObject({
      combatActive: true,
      combatMessage: "Aimed Shot: d20 +2 DEX vs DC 12.",
      combatRound: 2,
      hub: {
        coins: 12,
        lootSold: 3,
        preparedFood: ["Stewscript"],
        stations: [{ built: true, id: "blacksmith", level: 1 }],
        village: {
          permissions: { houses: "friends", shop: "everyone" },
          selectedLocation: "market",
          selectedPermission: "shop",
          shopLog: ["Sold relicscript"],
        },
      },
      inventoryItems: ["Rusty blade", "Dew vial", "bad", "Ranger charm"],
      maxFocus: 12,
      maxHp: 26,
      progress: {
        equipment: [
          {
            activeText: "Cuts truescript",
            bonusDamage: 1,
            id: "iron-edgescript",
            name: "Iron Edgescript",
            rarity: "uncommon",
            slot: "weapon",
            statBonuses: { dexterity: 2 },
          },
        ],
        knowledge: [
          {
            discoveredAtTurn: 3,
            floor: 1,
            id: "monster-slimescript",
            kind: "monster",
            text: "Weak to firescript",
            title: "Slimescript",
          },
        ],
        levelUp: {
          choices: [{ id: "pathfinderscript", name: "Pathfinderscript", text: "Read routesscript" }],
          level: 2,
        },
        log: ["Linescript"],
        statusEffects: [
          {
            id: "guarded",
            label: "Guardedscript",
            magnitude: 1,
            remainingTurns: 2,
            source: "shieldscript",
            targetId: "playerscript",
          },
        ],
        talents: ["pathfinder", "bad"],
        toasts: [{ id: "toastscript", text: "Book updatedscript", title: "Foundscript", tone: "success", turn: 3 }],
      },
    })
  })

  test("rolls co-op sync state back to the host result when a command is rejected", () => {
    let now = 60
    const lobby = new MultiplayerLobbyState({ mode: "coop", seed: 1234, now: () => now++ })
    lobby.join("p1", "Mira")
    lobby.updateCoopState({ playerId: "p1", floor: 1, turn: 4, hp: 19, x: 6, y: 5, combatActive: false })

    const command = lobby.recordCommand({
      playerId: "p1",
      type: "move",
      label: "Moved through closed gate",
      floor: 1,
      turn: 9,
      hp: 14,
      x: 99,
      y: 99,
      payload: {},
      result: {
        accepted: false,
        floor: 1,
        hp: 19,
        message: "Move command needs a direction.",
        status: "running",
        turn: 4,
        x: 6,
        y: 5,
      },
    })

    expect(command.accepted).toBe(false)
    expect(lobby.snapshot().coopStates[0]).toMatchObject({
      floor: 1,
      hp: 19,
      saveRevision: 4,
      turn: 4,
      x: 6,
      y: 5,
    })
  })

  test("exposes the latest host-owned authoritative command result", () => {
    let now = 70
    const lobby = new MultiplayerLobbyState({ mode: "coop", seed: 1234, now: () => now++ })
    lobby.join("p1", "Mira")

    const command = lobby.recordCommand({
      playerId: "p1",
      type: "move",
      label: "Moved east",
      payload: { floor: 1, hp: 19, turn: 2, x: 5, y: 5 },
      result: {
        accepted: true,
        floor: 1,
        hp: 18,
        message: "Mira moved east.",
        status: "running",
        turn: 3,
        x: 6,
        y: 5,
      },
    })

    lobby.updateAuthoritativeState({
      ...command.result,
      commandSequence: command.sequence,
      playerId: "p1",
    })

    expect(lobby.snapshot().hostState).toMatchObject({
      accepted: true,
      commandSequence: 1,
      hp: 18,
      name: "Mira",
      turn: 3,
      x: 6,
      y: 5,
    })
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
