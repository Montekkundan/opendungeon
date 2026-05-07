import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSession, performCombatAction, selectSkill, tryMove, usePotion } from "./session.js"
import { setTile } from "./dungeon.js"
import { listSaves, loadSave, saveSession } from "./saveStore.js"
import { draw } from "../ui/screens.js"

describe("game session", () => {
  test("creates a seeded dungeon with a reachable player start", () => {
    const session = createSession(1234, "solo", "ranger")

    expect(session.dungeon.width).toBeGreaterThan(40)
    expect(session.dungeon.height).toBeGreaterThan(20)
    expect(session.dungeon.tiles[session.player.y][session.player.x]).toBe("floor")
  })

  test("collects loot into inventory", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "potion")

    tryMove(session, 1, 0)

    expect(session.inventory[0]).toBe("Deploy nerve potion")
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
      },
      80,
      24,
    ).chunks

    expect(start.map((chunk) => chunk.text).join("")).toContain("opendungeon")
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
      expect(loaded.visible.has("1,2")).toBe(true)
      expect(loaded.seen.has("3,4")).toBe(true)
      expect(loaded.dungeon.width).toBe(session.dungeon.width)
    } finally {
      if (previousSaveDir === undefined) delete process.env.OPENDUNGEON_SAVE_DIR
      else process.env.OPENDUNGEON_SAVE_DIR = previousSaveDir
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
