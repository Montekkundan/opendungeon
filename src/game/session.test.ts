import { describe, expect, test } from "bun:test"
import {
  createSession,
  currentBiome,
  floorModifierFor,
  interactWithWorld,
  normalizeSessionAfterLoad,
  rest,
  startingLoadout,
  tryMove,
  usePotion,
} from "./session.js"
import type { GameSession } from "./session.js"
import { cardinalNeighbors, createDungeon, setTile, tileAt } from "./dungeon.js"
import type { ActorId } from "./domainTypes.js"
import { addEnemyBesidePlayer } from "./testHelpers.test.js"

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

  test("keeps class appearance variants normalized and save-ready", () => {
    const session = createSession(1234, "solo", "duelist", "Nyx", {
      portraitVariantId: "scarred",
      cosmeticPaletteId: "moonlit",
      weaponSpriteId: "staff",
      animationSetId: "warden",
    })

    expect(session.hero.appearance).toEqual({
      portraitVariantId: "scarred",
      cosmeticPaletteId: "moonlit",
      weaponSpriteId: "staff",
      animationSetId: "warden",
    })

    session.hero.appearance.weaponSpriteId = "bad" as never
    expect(normalizeSessionAfterLoad(session).hero.appearance.weaponSpriteId).toBe("dagger")
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

  test("uses potion to heal", () => {
    const session = createSession(1234)
    session.inventory.unshift("Deploy nerve potion")
    session.hp = 2

    usePotion(session)

    expect(session.hp).toBe(7)
    expect(session.inventory).not.toContain("Deploy nerve potion")
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

})
