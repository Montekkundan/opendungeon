import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { attemptFlee, combatModifier, createSession, performCombatAction, resolveSkillCheck, selectSkill, tryMove, usePotion } from "./session.js"
import { setTile } from "./dungeon.js"
import { listSaves, loadSave, saveSession } from "./saveStore.js"
import { defaultSettings, loadSettings, profilePath, saveSettings } from "./settingsStore.js"
import { draw } from "../ui/screens.js"

describe("game session", () => {
  test("creates a seeded dungeon with a reachable player start", () => {
    const session = createSession(1234, "solo", "ranger")

    expect(session.dungeon.width).toBeGreaterThan(40)
    expect(session.dungeon.height).toBeGreaterThan(20)
    expect(session.dungeon.tiles[session.player.y][session.player.x]).toBe("floor")
  })

  test("resolves loot checks into inventory consequences", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "potion")

    tryMove(session, 1, 0)
    expect(session.skillCheck?.status).toBe("pending")

    resolveSkillCheck(session)

    expect(session.inventory[0]).not.toBe("Rusty blade")
    expect(session.dungeon.tiles[target.y][target.x]).toBe("floor")
  })

  test("uses potion to heal", () => {
    const session = createSession(1234)
    session.inventory.unshift("Deploy nerve potion")
    session.hp = 2

    usePotion(session)

    expect(session.hp).toBe(7)
    expect(session.inventory).not.toContain("Deploy nerve potion")
  })

  test("bumping an enemy enters d20 combat", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "floor")
    session.dungeon.actors.push({
      id: "test-slime",
      kind: "slime",
      position: target,
      hp: 6,
      damage: 1,
    })

    tryMove(session, 1, 0)

    expect(session.combat.active).toBe(true)
    expect(session.combat.actorIds).toContain("test-slime")
    expect(session.log[0]).toContain("Combat starts")
  })

  test("combat action rolls d20 against selected target", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "floor")
    session.dungeon.actors.push({
      id: "test-ghoul",
      kind: "ghoul",
      position: target,
      hp: 20,
      damage: 0,
    })

    tryMove(session, 1, 0)
    selectSkill(session, 0)
    performCombatAction(session)

    expect(session.combat.lastRoll?.d20).toBeGreaterThanOrEqual(1)
    expect(session.combat.lastRoll?.d20).toBeLessThanOrEqual(20)
    expect(session.combat.lastRoll?.modifier).toBe(combatModifier(session, "strength"))
    expect(session.turn).toBe(1)
  })

  test("enemies patrol until the player enters their aggro radius", () => {
    const session = createSession(1234)
    const start = { ...session.player }
    session.dungeon.actors = []

    for (let x = start.x; x <= start.x + 8; x++) setTile(session.dungeon, { x, y: start.y }, "floor")
    setTile(session.dungeon, { x: start.x, y: start.y + 1 }, "floor")

    session.dungeon.actors.push({
      id: "sentinel-ghoul",
      kind: "ghoul",
      position: { x: start.x + 7, y: start.y },
      hp: 8,
      damage: 0,
      ai: {
        pattern: "sentinel",
        origin: { x: start.x + 7, y: start.y },
        aggroRadius: 3,
        leashRadius: 6,
        direction: 1,
        alerted: false,
      },
    })

    tryMove(session, 0, 1)
    expect(session.combat.active).toBe(false)
    expect(session.dungeon.actors[0].position).toEqual({ x: start.x + 7, y: start.y })

    session.player = { x: start.x + 4, y: start.y }
    tryMove(session, 1, 0)

    expect(session.combat.active).toBe(true)
    expect(session.combat.actorIds).toContain("sentinel-ghoul")
  })

  test("flee rolls d20 against dexterity luck and endurance pressure", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "floor")
    session.stats.dexterity = 30
    session.stats.luck = 30
    session.stats.endurance = 30
    session.dungeon.actors.push({
      id: "test-slime",
      kind: "slime",
      position: target,
      hp: 6,
      damage: 0,
    })

    tryMove(session, 1, 0)
    const roll = attemptFlee(session)

    expect(roll?.skill).toBe("Flee")
    expect(roll?.hit).toBe(true)
    expect(session.combat.active).toBe(false)
    expect(session.turn).toBe(1)
  })

  test("loot tiles trigger stat checks with consequences", () => {
    const session = createSession(1234, "solo", "ranger")
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "chest")

    tryMove(session, 1, 0)

    expect(session.skillCheck?.status).toBe("pending")
    expect(session.skillCheck?.stat).toBe("dexterity")
    expect(session.player).toEqual(target)

    const roll = resolveSkillCheck(session)

    expect(roll?.d20).toBeGreaterThanOrEqual(1)
    expect(roll?.d20).toBeLessThanOrEqual(20)
    expect(session.skillCheck?.status).toBe("resolved")
    expect(session.skillCheck?.roll?.total).toBe((roll?.d20 ?? 0) + (roll?.modifier ?? 0))
    expect(session.dungeon.tiles[target.y][target.x]).toBe("floor")
    expect(session.turn).toBe(1)
  })

  test("locks final stairs until the guardian is defeated", () => {
    const session = createSession(1234)
    session.floor = session.finalFloor
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "stairs")
    session.dungeon.actors.push({
      id: "final-guardian",
      kind: "necromancer",
      position: { x: target.x + 1, y: target.y },
      hp: 10,
      damage: 4,
    })

    tryMove(session, 1, 0)

    expect(session.status).toBe("running")
    expect(session.log[0]).toContain("sealed")
  })

  test("renders start and game screens to a full terminal-sized surface", () => {
    const session = createSession()
    const start = draw(
      {
        screen: "start",
        dialog: null,
        menuIndex: 0,
        classIndex: 2,
        modeIndex: 0,
        seed: 2423368,
        session,
        message: "",
        saves: [],
        saveIndex: 0,
        saveStatus: "",
        debugView: false,
        rendererBackend: "terminal",
        settings: defaultSettings,
        settingsIndex: 0,
        settingsReturnScreen: "start",
        inputMode: null,
        uiHidden: false,
      },
      80,
      24,
    ).chunks

    expect(start.map((chunk) => chunk.text).join("")).toContain("opendungeon")

    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "relic")
    tryMove(session, 1, 0)
    const game = draw(
      {
        screen: "game",
        dialog: null,
        menuIndex: 0,
        classIndex: 2,
        modeIndex: 0,
        seed: 2423368,
        session,
        message: "",
        saves: [],
        saveIndex: 0,
        saveStatus: "",
        debugView: false,
        rendererBackend: "terminal",
        settings: defaultSettings,
        settingsIndex: 0,
        settingsReturnScreen: "start",
        inputMode: null,
        uiHidden: false,
      },
      120,
      40,
    ).chunks

    expect(game.map((chunk) => chunk.text).join("")).toContain("Talent Check")
  })

  test("persists local saves and rehydrates fog of war sets", () => {
    const previousSaveDir = process.env.OPENDUNGEON_SAVE_DIR
    const dir = mkdtempSync(join(tmpdir(), "opendungeon-save-test-"))
    process.env.OPENDUNGEON_SAVE_DIR = dir

    try {
      const session = createSession(4321, "race", "warden")
      session.gold = 42
      session.visible.add("1,2")
      session.seen.add("3,4")

      const summary = saveSession(session, "Test save")
      const saves = listSaves()
      const loaded = loadSave(summary.id)

      expect(summary.path.startsWith(dir)).toBe(true)
      expect(saves).toHaveLength(1)
      expect(loaded.gold).toBe(42)
      expect(loaded.mode).toBe("race")
      expect(loaded.hero.classId).toBe("warden")
      expect(loaded.stats.strength).toBe(session.stats.strength)
      expect(loaded.visible.has("1,2")).toBe(true)
      expect(loaded.seen.has("3,4")).toBe(true)
      expect(loaded.dungeon.width).toBe(session.dungeon.width)
    } finally {
      if (previousSaveDir === undefined) delete process.env.OPENDUNGEON_SAVE_DIR
      else process.env.OPENDUNGEON_SAVE_DIR = previousSaveDir
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("persists local profile settings separately from saves", () => {
    const previousProfileDir = process.env.OPENDUNGEON_PROFILE_DIR
    const dir = mkdtempSync(join(tmpdir(), "opendungeon-profile-test-"))
    process.env.OPENDUNGEON_PROFILE_DIR = dir

    try {
      saveSettings({
        ...defaultSettings,
        username: "dev-runner",
        githubUsername: "terminal-host",
        cloudProvider: "github",
        highContrast: true,
        reduceMotion: true,
        controlScheme: "vim",
      })

      const loaded = loadSettings()

      expect(profilePath().startsWith(dir)).toBe(true)
      expect(loaded.username).toBe("dev-runner")
      expect(loaded.githubUsername).toBe("terminal-host")
      expect(loaded.cloudProvider).toBe("github")
      expect(loaded.highContrast).toBe(true)
      expect(loaded.controlScheme).toBe("vim")
    } finally {
      if (previousProfileDir === undefined) delete process.env.OPENDUNGEON_PROFILE_DIR
      else process.env.OPENDUNGEON_PROFILE_DIR = previousProfileDir
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
