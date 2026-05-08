import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  applyStatusEffect,
  attemptFlee,
  combatModifier,
  combatSkills,
  createSession,
  currentBiome,
  floorModifierFor,
  interactWithWorld,
  performCombatAction,
  rest,
  resolveSkillCheck,
  selectSkill,
  statusEffectMagnitude,
  statusEffectsFor,
  startingLoadout,
  tryMove,
  usePotion,
} from "./session.js"
import type { GameSession } from "./session.js"
import { createDungeon, setTile, tileAt } from "./dungeon.js"
import type { ActorId } from "./domainTypes.js"
import { listSaves, loadSave, saveSession } from "./saveStore.js"
import { defaultSettings, loadSettings, profilePath, saveSettings } from "./settingsStore.js"
import { draw } from "../ui/screens.js"
import { worldBundleDirectory } from "../world/worldConfig.js"

function addEnemyBesidePlayer(session: GameSession, id: string, kind: ActorId, hp: number, damage: number) {
  const target = { x: session.player.x + 1, y: session.player.y }
  setTile(session.dungeon, target, "floor")
  session.dungeon.actors.push({ id, kind, position: target, hp, damage })
  return target
}

function startTwoEnemyFight(session: GameSession) {
  addEnemyBesidePlayer(session, "initiative-slime", "slime", 20, 1)
  const second = { x: session.player.x, y: session.player.y + 1 }
  setTile(session.dungeon, second, "floor")
  session.dungeon.actors.push({ id: "initiative-ghoul", kind: "ghoul", position: second, hp: 20, damage: 1 })
  tryMove(session, 1, 0)
  return session.combat.initiative.map((entry) => ({ id: entry.id, roll: entry.roll, modifier: entry.modifier, total: entry.total }))
}

describe("game session", () => {
  test("creates a seeded dungeon with a reachable player start", () => {
    const session = createSession(1234, "solo", "ranger", "Nyx Prime")

    expect(session.dungeon.width).toBeGreaterThan(40)
    expect(session.dungeon.height).toBeGreaterThan(20)
    expect(session.dungeon.tiles[session.player.y][session.player.x]).toBe("floor")
    expect(session.dungeon.anchors[0].kind).toBe("start")
    expect(session.world.events).toHaveLength(50)
    expect(session.world.quests.length).toBeGreaterThan(0)
    expect(session.hero.name).toBe("Nyx Prime")
  })

  test("uses class-specific starting loadouts", () => {
    const warden = createSession(1234, "solo", "warden")
    const arcanist = createSession(1234, "solo", "arcanist")
    const ranger = createSession(1234, "solo", "ranger")
    const duelist = createSession(1234, "solo", "duelist")
    const cleric = createSession(1234, "solo", "cleric")
    const engineer = createSession(1234, "solo", "engineer")
    const witch = createSession(1234, "solo", "witch")
    const graveKnight = createSession(1234, "solo", "grave-knight")

    expect(warden.inventory).toContain("Stone buckler")
    expect(arcanist.inventory).toContain("Ash focus")
    expect(ranger.inventory).toContain("Rope arrow")
    expect(duelist.inventory).toContain("Needle rapier")
    expect(cleric.inventory).toContain("Shrine charm")
    expect(engineer.inventory).toContain("Tripwire kit")
    expect(witch.inventory).toContain("Hex pouch")
    expect(graveKnight.inventory).toContain("Grave blade")
    expect(startingLoadout("warden")).not.toEqual(startingLoadout("arcanist"))
    expect(startingLoadout("duelist")).not.toEqual(startingLoadout("ranger"))

    warden.inventory.push("Changed")
    expect(startingLoadout("warden")).not.toContain("Changed")
  })

  test("exposes the biome nearest to the current room as gameplay state", () => {
    const session = createSession(1234)
    const nearestStartAnchor = session.world.anchors.find((anchor) => anchor.floor === session.floor && anchor.roomIndex === 0)

    expect(nearestStartAnchor).toBeTruthy()
    expect(currentBiome(session)).toBe(nearestStartAnchor!.biome)

    const roomAnchor = session.world.anchors.find((anchor) => anchor.floor === session.floor && anchor.kind === "room")
    expect(roomAnchor).toBeTruthy()
    session.player = { ...roomAnchor!.position }

    expect(currentBiome(session)).toBe(roomAnchor!.biome)
  })

  test("applies deterministic floor modifiers to rules", () => {
    const focusDraft = createSession(1237)
    focusDraft.focus = 0
    rest(focusDraft)

    expect(focusDraft.floorModifier).toMatchObject(floorModifierFor(1237, 1))
    expect(focusDraft.floorModifier.id).toBe("focus-draft")
    expect(focusDraft.focus).toBe(2)

    const unstable = createSession(1236)
    const target = { x: unstable.player.x + 1, y: unstable.player.y }
    setTile(unstable.dungeon, target, "trap")
    tryMove(unstable, 1, 0)

    expect(unstable.floorModifier.id).toBe("unstable-ground")
    expect(unstable.hp).toBe(unstable.maxHp - 3)
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
    addEnemyBesidePlayer(session, "test-slime", "slime", 6, 1)

    tryMove(session, 1, 0)

    expect(session.combat.active).toBe(true)
    expect(session.combat.actorIds).toContain("test-slime")
    expect(session.log[0]).toContain("Combat starts")
  })

  test("spawns merchants, NPCs, and expanded enemies on legal dungeon tiles", () => {
    const dungeon = createDungeon(1234, 4)
    const kinds = new Set(dungeon.actors.map((actor) => actor.kind))

    expect(kinds).toContain("merchant")
    expect(["cartographer", "wound-surgeon", "shrine-keeper", "jailer"].some((kind) => kinds.has(kind as ActorId))).toBe(true)
    expect(["gallows-wisp", "rust-squire", "carrion-moth", "crypt-mimic"].some((kind) => kinds.has(kind as ActorId))).toBe(true)
    expect(dungeon.actors.every((actor) => tileAt(dungeon, actor.position) !== "wall")).toBe(true)
  })

  test("bumping a friendly NPC opens conversation instead of combat", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "test-cartographer", "cartographer", 1, 0)

    tryMove(session, 1, 0)

    expect(session.combat.active).toBe(false)
    expect(session.conversation?.kind).toBe("cartographer")
    expect(session.conversation?.speaker).toContain("Cartographer")
    expect(session.worldLog.length).toBeGreaterThan(1)
  })

  test("merchant interaction purchases a deterministic trade item", () => {
    const session = createSession(1234)
    session.gold = 20
    addEnemyBesidePlayer(session, "test-merchant", "merchant", 1, 0)

    tryMove(session, 1, 0)
    const conversation = interactWithWorld(session)

    expect(conversation?.trade?.purchased).toBe(true)
    expect(session.gold).toBe(8)
    expect(session.inventory[0]).toBe("Merchant salve")
    expect(session.log[0]).toContain("purchased")
  })

  test("rolls deterministic initiative order on combat start", () => {
    const left = createSession(1234)
    const right = createSession(1234)

    const leftOrder = startTwoEnemyFight(left)
    const rightOrder = startTwoEnemyFight(right)

    expect(leftOrder).toEqual(rightOrder)
    expect(left.combat.round).toBe(1)
    expect(left.combat.initiative.map((entry) => entry.id)).toContain("player")
    expect(left.combat.initiative.map((entry) => entry.id)).toContain("initiative-slime")
    expect(left.combat.initiative.map((entry) => entry.id)).toContain("initiative-ghoul")
    expect(left.combat.initiative.every((entry) => entry.roll >= 1 && entry.roll <= 20)).toBe(true)
    expect(left.log[0]).toContain("Initiative:")
  })

  test("combat action rolls d20 against selected target", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "test-ghoul", "ghoul", 20, 0)

    tryMove(session, 1, 0)
    selectSkill(session, 0)
    performCombatAction(session)

    expect(session.combat.lastRoll?.d20).toBeGreaterThanOrEqual(1)
    expect(session.combat.lastRoll?.d20).toBeLessThanOrEqual(20)
    expect(session.combat.lastRoll?.modifier).toBe(combatModifier(session, "strength"))
    expect(session.turn).toBe(1)
  })

  test("supports expanded combat skills beyond the original three slots", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "floor")
    session.stats.faith = 40
    session.focus = session.maxFocus
    session.dungeon.actors.push({
      id: "test-necromancer",
      kind: "necromancer",
      position: target,
      hp: 20,
      damage: 0,
    })

    tryMove(session, 1, 0)
    selectSkill(session, 3)
    performCombatAction(session)

    expect(combatSkills.length).toBeGreaterThanOrEqual(6)
    expect(session.combat.lastRoll?.skill).toBe("Smite")
    expect(session.combat.lastRoll?.modifier).toBe(combatModifier(session, "faith"))
  })

  test("uses area combat skills against all active targets", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "aoe-ghoul", "ghoul", 10, 0)
    const second = { x: session.player.x, y: session.player.y + 1 }
    setTile(session.dungeon, second, "floor")
    session.dungeon.actors.push({ id: "aoe-slime", kind: "slime", position: second, hp: 5, damage: 0 })
    session.stats.intelligence = 60
    session.focus = session.maxFocus

    tryMove(session, 1, 0)
    expect(session.combat.actorIds).toContain("aoe-ghoul")
    expect(session.combat.actorIds).toContain("aoe-slime")

    selectSkill(session, 2)
    performCombatAction(session)

    expect(session.combat.lastRoll?.skill).toBe("Arcane Burst")
    expect(session.kills).toBeGreaterThanOrEqual(2)
    expect(session.dungeon.actors.some((actor) => actor.id === "aoe-ghoul" || actor.id === "aoe-slime")).toBe(false)
  })

  test("advances necromancer bosses into a stronger second phase", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "phase-necromancer", "necromancer", 30, 3)
    const boss = session.dungeon.actors.find((actor) => actor.id === "phase-necromancer")!
    boss.maxHp = 30
    session.stats.strength = 60

    tryMove(session, 1, 0)
    selectSkill(session, 0)
    performCombatAction(session)

    expect(boss.phase).toBe(2)
    expect(boss.damage).toBe(5)
    expect(session.hp).toBe(session.maxHp - 5)
    expect(session.log.some((entry) => entry.includes("phase 2"))).toBe(true)
  })

  test("applies combat status effects, damage reduction, and expiry", () => {
    const session = createSession(1234)
    const target = addEnemyBesidePlayer(session, "test-necromancer", "necromancer", 80, 5)
    session.stats.mind = 60
    session.focus = session.maxFocus

    tryMove(session, 1, 0)
    selectSkill(session, 4)
    performCombatAction(session)

    expect(session.combat.lastRoll?.skill).toBe("Shadow Hex")
    expect(statusEffectMagnitude(session, "test-necromancer", "weakened")).toBe(2)
    expect(statusEffectsFor(session, "test-necromancer")[0]?.remainingTurns).toBe(1)
    expect(session.hp).toBe(session.maxHp - 3)

    setTile(session.dungeon, target, "floor")
    selectSkill(session, 0)
    performCombatAction(session)

    expect(statusEffectMagnitude(session, "test-necromancer", "weakened")).toBe(0)
    expect(session.hp).toBe(session.maxHp - 6)
  })

  test("blocks enemy damage and triggers riposte reactions", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "riposte-ghoul", "ghoul", 20, 5)
    applyStatusEffect(session, {
      id: "guarded",
      targetId: "player",
      label: "Guarded",
      remainingTurns: 2,
      magnitude: 2,
      source: "Lucky Riposte",
    })
    session.inventory.unshift("Deploy nerve potion")
    const actor = session.dungeon.actors.find((candidate) => candidate.id === "riposte-ghoul")!

    tryMove(session, 1, 0)
    usePotion(session)

    expect(session.hp).toBe(session.maxHp - 3)
    expect(actor.hp).toBe(19)
    expect(session.log.some((entry) => entry.includes("Block reaction absorbs 2"))).toBe(true)
    expect(session.log.some((entry) => entry.includes("Riposte reaction"))).toBe(true)
  })

  test("refreshes same-target status effect stacks without duplicating them", () => {
    const session = createSession(1234)

    applyStatusEffect(session, {
      id: "guarded",
      targetId: "player",
      label: "Guarded",
      remainingTurns: 1,
      magnitude: 1,
      source: "test",
    })
    applyStatusEffect(session, {
      id: "guarded",
      targetId: "player",
      label: "Guarded",
      remainingTurns: 3,
      magnitude: 2,
      source: "test",
    })

    expect(statusEffectsFor(session, "player")).toHaveLength(1)
    expect(statusEffectsFor(session, "player")[0]).toMatchObject({ remainingTurns: 3, magnitude: 2 })
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
    session.stats.dexterity = 30
    session.stats.luck = 30
    session.stats.endurance = 30
    addEnemyBesidePlayer(session, "test-slime", "slime", 6, 0)

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

  test("trap tiles damage the player and become safe floor", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "trap")

    tryMove(session, 1, 0)

    expect(session.player).toEqual(target)
    expect(session.hp).toBe(session.maxHp - 2)
    expect(session.dungeon.tiles[target.y][target.x]).toBe("floor")
    expect(session.log[0]).toContain("Trap sprung")
    expect(session.turn).toBe(1)
  })

  test("generates locked secret-room doors that can be discovered", () => {
    const session = createSession(1234)
    const secret = session.dungeon.secrets[0]
    expect(secret).toBeDefined()
    expect(tileAt(session.dungeon, secret.door)).toBe("door")

    const entry = cardinalNeighbors(secret.door).find((point) => tileAt(session.dungeon, point) === "floor")
    expect(entry).toBeDefined()
    session.player = { ...entry! }

    tryMove(session, secret.door.x - entry!.x, secret.door.y - entry!.y)

    expect(session.player).toEqual(secret.door)
    expect(secret.discovered).toBe(true)
    expect(tileAt(session.dungeon, secret.door)).toBe("floor")
    expect(session.log[0]).toContain("secret room")
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
        settingsTabIndex: 0,
        settingsIndex: 0,
        settingsReturnScreen: "start",
        inputMode: null,
        uiHidden: false,
        inventoryIndex: 0,
        inventoryDragIndex: null,
        questIndex: 0,
      },
      80,
      24,
    ).chunks

    expect(start.map((chunk) => chunk.text).join("")).toContain("OPENDUNGEON")

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
        settingsTabIndex: 0,
        settingsIndex: 0,
        settingsReturnScreen: "start",
        inputMode: null,
        uiHidden: false,
        inventoryIndex: 0,
        inventoryDragIndex: null,
        questIndex: 0,
      },
      120,
      40,
    ).chunks

    expect(game.map((chunk) => chunk.text).join("")).toContain("Talent Check")

    const settings = draw(
      {
        screen: "settings",
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
        settingsTabIndex: 3,
        settingsIndex: 0,
        settingsReturnScreen: "start",
        inputMode: null,
        uiHidden: false,
        inventoryIndex: 0,
        inventoryDragIndex: null,
        questIndex: 0,
      },
      120,
      40,
    ).chunks

    const settingsText = settings.map((chunk) => chunk.text).join("")
    expect(settingsText).toContain("Visuals")
    expect(settingsText).toContain("Camera FOV")
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
      expect(existsSync(worldBundleDirectory(session.world.worldId))).toBe(true)
      expect(saves).toHaveLength(1)
      expect(loaded.gold).toBe(42)
      expect(loaded.mode).toBe("race")
      expect(loaded.hero.classId).toBe("warden")
      expect(loaded.stats.strength).toBe(session.stats.strength)
      expect(loaded.visible.has("1,2")).toBe(true)
      expect(loaded.seen.has("3,4")).toBe(true)
      expect(loaded.dungeon.width).toBe(session.dungeon.width)
      expect(loaded.world.worldId).toBe(session.world.worldId)
      expect(loaded.worldLog[0].type).toBe("world-created")
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

function cardinalNeighbors(point: { x: number; y: number }) {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ]
}
