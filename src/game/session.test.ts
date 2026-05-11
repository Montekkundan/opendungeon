import { describe, expect, test } from "bun:test"
import {
  chooseConversationOption,
  chooseLevelUpTalent,
  createSession,
  currentBiome,
  enemyBehaviorText,
  floorModifierFor,
  focusCostForSkill,
  grantXp,
  interactWithWorld,
  normalizeSessionAfterLoad,
  performCombatAction,
  rest,
  combatSkills,
  startingLoadout,
  tryMove,
  usePotion,
  addToast,
  buildHubStation,
  cycleContentPack,
  cycleSharedFarmPermission,
  completeVillageQuest,
  customizeVillageHouse,
  harvestFarm,
  moveVillagePlayer,
  plantCrop,
  playLocalCutscene,
  prepareFood,
  refreshBalanceDashboard,
  runVillageShopSale,
  sellLootToVillage,
  toggleRunMutator,
  unlockHub,
  upgradeWeapon,
  visitVillageLocation,
} from "./session.js"
import type { GameSession } from "./session.js"
import { cardinalNeighbors, createDungeon, enemyAi, setTile, tileAt } from "./dungeon.js"
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
    expect(session.toasts[0].title).toBe("Potion used")
  })

  test("tracks Book knowledge and event toasts for the amnesia story", () => {
    const session = createSession(1234)

    expect(session.log[0]).toContain("no memory")
    expect(session.knowledge.map((entry) => entry.title)).toContain("Waking Cell")
    expect(session.knowledge.some((entry) => entry.kind === "hub")).toBe(true)

    addToast(session, "Test event", "The Book and toast rails are active.", "info")
    expect(session.toasts[0]).toMatchObject({ title: "Test event", tone: "info" })
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

  test("failed merchant trade closes on the next confirm instead of retrying", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "test-merchant", "merchant", 1, 0)

    tryMove(session, 1, 0)
    const failed = interactWithWorld(session)
    const toastCount = session.toasts.length

    expect(failed?.status).toBe("completed")
    expect(failed?.text).toContain("12 gold needed")
    expect(session.conversation).not.toBeNull()

    const closed = interactWithWorld(session)

    expect(closed).toBeNull()
    expect(session.conversation).toBeNull()
    expect(session.toasts.length).toBe(toastCount)
  })

  test("NPC conversations expose selectable run-affecting options", () => {
    const session = createSession(1234)
    session.hp = session.maxHp - 6
    addEnemyBesidePlayer(session, "test-surgeon", "wound-surgeon", 1, 0)

    tryMove(session, 1, 0)
    const conversation = chooseConversationOption(session, 0)

    expect(conversation?.options[0].label).toBe("Patch wounds")
    expect(session.hp).toBe(session.maxHp - 2)
    expect(session.conversation?.status).toBe("completed")
    expect(session.worldLog.length).toBeGreaterThan(1)
  })

  test("level-up talents create RPG build choices that affect later mechanics", () => {
    const session = createSession(1234, "solo", "arcanist")
    grantXp(session, 10)

    expect(session.level).toBe(2)
    expect(session.levelUp?.choices.map((choice) => choice.id)).toContain("ash-channel")

    chooseLevelUpTalent(session, 0)
    const arcaneBurst = combatSkills.find((skill) => skill.id === "arcane-burst")!

    expect(session.talents).toContain("ash-channel")
    expect(session.levelUp).toBeNull()
    expect(focusCostForSkill(session, arcaneBurst)).toBe(1)
  })

  test("skill trees offer later class and replayability branches", () => {
    const session = createSession(1234, "solo", "arcanist")
    grantXp(session, 10)
    chooseLevelUpTalent(session, 0)
    grantXp(session, 20)
    chooseLevelUpTalent(session, 0)
    grantXp(session, 30)

    const choices = session.levelUp?.choices.map((choice) => choice.id) ?? []
    expect(session.level).toBe(4)
    expect(choices).toContain("cinder-script")
    expect(choices).toContain("boss-breaker")
  })

  test("smarter enemies expose ranged, guard, ambush, and flee behavior", () => {
    const session = createSession(1234)
    const start = { ...session.player }
    session.dungeon.actors = []

    for (let x = start.x; x <= start.x + 5; x++) setTile(session.dungeon, { x, y: start.y }, "floor")
    const necromancer = {
      id: "ranged-necromancer",
      kind: "necromancer" as const,
      position: { x: start.x + 4, y: start.y },
      hp: 6,
      maxHp: 6,
      damage: 3,
      ai: enemyAi("necromancer", { x: start.x + 4, y: start.y }, 0, session.floor),
    }
    const guard = {
      id: "guard-squire",
      kind: "rust-squire" as const,
      position: { x: start.x + 5, y: start.y },
      hp: 5,
      maxHp: 5,
      damage: 2,
      ai: enemyAi("rust-squire", { x: start.x + 5, y: start.y }, 1, session.floor),
    }
    const ambusher = {
      id: "ambush-mimic",
      kind: "crypt-mimic" as const,
      position: { x: start.x + 8, y: start.y },
      hp: 5,
      maxHp: 5,
      damage: 3,
      ai: enemyAi("crypt-mimic", { x: start.x + 8, y: start.y }, 2, session.floor),
    }
    const skittish = {
      id: "flee-moth",
      kind: "carrion-moth" as const,
      position: { x: start.x + 9, y: start.y },
      hp: 1,
      maxHp: 4,
      damage: 1,
      ai: enemyAi("carrion-moth", { x: start.x + 9, y: start.y }, 3, session.floor),
    }
    session.dungeon.actors.push(necromancer, guard, ambusher, skittish)

    expect(enemyBehaviorText(necromancer)).toContain("Ranged")
    expect(enemyBehaviorText(guard)).toContain("Guarding")
    expect(enemyBehaviorText(ambusher)).toContain("Ambush")
    expect(enemyBehaviorText(skittish)).toContain("Skittish")

    tryMove(session, 1, 0)
    expect(session.combat.active).toBe(true)
    expect(session.combat.actorIds).toContain("ranged-necromancer")

    const beforeHp = session.hp
    performCombatAction(session)
    expect(session.hp).toBeLessThanOrEqual(beforeHp)
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

  test("note tiles add physical collectibles to the Book", () => {
    const session = createSession(1234)
    const target = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, target, "note")
    const before = session.knowledge.length

    tryMove(session, 1, 0)

    expect(tileAt(session.dungeon, target)).toBe("floor")
    expect(session.knowledge.length).toBe(before + 1)
    expect(session.knowledge[0].title).toContain("Recovered Note")
    expect(session.toasts[0].title).toBe("Recovered note found")
  })

  test("recipes, tool parts, and deeds add hub-facing Book entries", () => {
    const session = createSession(1234)
    const kinds = ["recipe", "tool", "deed"] as const
    for (const kind of kinds) {
      const target = { x: session.player.x + 1, y: session.player.y }
      setTile(session.dungeon, target, kind)
      tryMove(session, 1, 0)
    }

    expect(session.knowledge.map((entry) => entry.title).join("|")).toContain("Recovered Recipe")
    expect(session.knowledge.map((entry) => entry.title).join("|")).toContain("Recovered Tool Part")
    expect(session.knowledge.map((entry) => entry.title).join("|")).toContain("Village Deed")
  })

  test("rare collectibles feed Book and long-term hub/story state", () => {
    const session = createSession(1234)
    const kinds = ["fossil", "boss-memory", "keepsake", "story-relic"] as const
    for (const kind of kinds) {
      const target = { x: session.player.x + 1, y: session.player.y }
      setTile(session.dungeon, target, kind)
      tryMove(session, 1, 0)
    }

    const titles = session.knowledge.map((entry) => entry.title).join("|")
    expect(titles).toContain("Recovered Fossil")
    expect(titles).toContain("Boss Memory")
    expect(titles).toContain("Friendship Keepsake")
    expect(titles).toContain("AI Admin Story Relic")
    expect(session.pendingWorldGeneration).toBe(true)
  })

  test("hub economy supports stations, food, weapon upgrades, trust, farming, and mutators", () => {
    const session = createSession(1234, "coop", "ranger", "Mira")
    unlockHub(session)
    session.hub.coins = 240
    session.inventory.unshift("Bound relic", "Rollback scroll")

    expect(session.hub.unlocked).toBe(true)
    expect(session.hub.houses.length).toBeGreaterThan(1)
    expect(buildHubStation(session, "blacksmith")).toBe(true)
    expect(buildHubStation(session, "kitchen")).toBe(true)
    expect(buildHubStation(session, "farm")).toBe(true)
    expect(sellLootToVillage(session)).toBeGreaterThan(0)
    expect(prepareFood(session)).toBeTruthy()
    expect(upgradeWeapon(session)?.bonusDamage).toBeGreaterThan(0)
    expect(plantCrop(session)).toBe(true)
    expect(harvestFarm(session)).toBeGreaterThan(0)
    expect(completeVillageQuest(session).questsCompleted).toBeGreaterThan(0)
    expect(toggleRunMutator(session, "hard-mode")).toBe(true)
    expect(session.hub.activeMutators).toContain("hard-mode")
    expect(session.equipment.weapon?.name).toContain("+1")
    expect(session.hub.trust.blacksmith.level).toBeGreaterThanOrEqual(0)
  })

  test("village screen systems cover movement, schedules, shop pricing, co-op homes, content packs, cutscenes, and balance", () => {
    const session = createSession(1234, "coop", "ranger", "Mira")
    unlockHub(session)
    session.hub.coins = 160
    session.inventory.unshift("Boss memory shard", "Tool part bundle")

    const selected = moveVillagePlayer(session, 5, -2)
    expect(selected).toBeTruthy()
    expect(session.hub.village.schedules).toHaveLength(5)

    const sale = runVillageShopSale(session)
    expect(sale?.value).toBeGreaterThan(0)
    expect(session.hub.village.shopLog[0]).toContain("coins")

    const house = customizeVillageHouse(session, "player-2")
    expect(house.built).toBe(true)
    expect(cycleSharedFarmPermission(session)).toBe("everyone")
    expect(cycleContentPack(session).active).toBe("high-contrast")
    expect(refreshBalanceDashboard(session).classWinRate.ranger).toBeGreaterThan(0)

    const scene = playLocalCutscene(session, "ending-rooted")
    expect(scene.seen).toBe(true)
    expect(session.hub.lastCutsceneId).toBe("ending-rooted")
    expect(visitVillageLocation(session, "guildhall")).toContain("trust")
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
