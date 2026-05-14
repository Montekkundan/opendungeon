import { describe, expect, test } from "bun:test"
import {
  chooseConversationOption,
  chooseLevelUpTalent,
  combatBalanceSnapshot,
  craftVillageRecipe,
  createNextDescentSession,
  createSession,
  currentBiome,
  equipmentComparisonText,
  enemyBehaviorText,
  floorModifierFor,
  fleeModifier,
  focusCostForSkill,
  grantXp,
  interactWithWorld,
  inventoryActionsForItem,
  inventoryItemDescription,
  normalizeSessionAfterLoad,
  performInventoryAction,
  performCombatAction,
  recordTutorialAction,
  rest,
  combatSkills,
  startingLoadout,
  tryMove,
  useInventoryItemAt,
  usePotion,
  addToast,
  applyChallengeRun,
  applyGmPatchOperations,
  applyOpeningStoryBranch,
  buildHubStation,
  cycleContentPack,
  cycleCoopVillagePermission,
  cycleSharedFarmPermission,
  completeVillageQuest,
  customizeVillageHouse,
  harvestFarm,
  moveVillagePlayer,
  plantCrop,
  playLocalCutscene,
  prepareFood,
  refreshBalanceDashboard,
  refreshVillageCalendar,
  recordChallengeResult,
  runVillageShopSale,
  sellLootToVillage,
  setTutorialCoopGateHold,
  talentEffectTextForSkill,
  toggleRunMutator,
  tutorialCoopCheckpoint,
  unlockHub,
  upgradeWeapon,
  visitVillageLocation,
} from "./session.js"
import type { GameSession } from "./session.js"
import { cardinalNeighbors, createDungeon, enemyAi, setTile, tileAt } from "./dungeon.js"
import { isEnemyActorId, type ActorId } from "./domainTypes.js"
import { defaultFinalFloor } from "./progression.js"
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

  test("rest visibly recovers resources and still passes time when already steady", () => {
    const wounded = createSession(1234)
    wounded.focus = Math.max(0, wounded.maxFocus - 3)
    wounded.hp = Math.max(1, wounded.maxHp - 2)
    const turn = wounded.turn

    rest(wounded)

    expect(wounded.turn).toBe(turn + 1)
    expect(wounded.focus).toBeGreaterThan(wounded.maxFocus - 3)
    expect(wounded.hp).toBe(wounded.maxHp - 1)
    expect(wounded.toasts[0]).toMatchObject({ title: "Rested", tone: "success" })

    wounded.focus = wounded.maxFocus
    wounded.hp = wounded.maxHp
    rest(wounded)

    expect(wounded.toasts[0]).toMatchObject({ title: "Rested", tone: "info" })
    expect(wounded.log[0]).toContain("Already steady")
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

  test("inventory item use explains passive and empty-slot choices", () => {
    const session = createSession(1234)
    session.inventory.unshift("Bound relic")

    const passive = performInventoryAction(session, 0, "use")
    const empty = useInventoryItemAt(session, 99)

    expect(passive.used).toBe(false)
    expect(passive.message).toContain("passive +1 to talent checks")
    expect(passive.message).not.toContain("No apply action")
    expect(empty.message).toBe("Empty slot selected.")
    expect(inventoryItemDescription("Dew vial")).toContain("Consumable")
  })

  test("inventory actions support equip stash sell and drop flows", () => {
    const session = createSession(1234)
    const actions = inventoryActionsForItem(session, 0)

    expect(actions.map((action) => action.id)).toEqual(["inspect", "use", "equip", "drop", "stash", "sell"])
    expect(performInventoryAction(session, 0, "equip")).toMatchObject({ used: true })
    expect(session.equipment.weapon?.name).toBe("Rusty blade")

    unlockHub(session)
    session.hub.coins = 80
    expect(buildHubStation(session, "storage")).toBe(true)
    session.inventory.unshift("Tool part bundle")
    expect(performInventoryAction(session, 0, "stash")).toMatchObject({ used: true })
    expect(session.hub.village.sharedFarm.storage[0]).toBe("Tool part bundle")

    session.inventory.unshift("Bound relic")
    const coins = session.hub.coins
    expect(performInventoryAction(session, 0, "sell")).toMatchObject({ used: true })
    expect(session.hub.coins).toBeGreaterThan(coins)

    session.inventory.unshift("Bent lockpick")
    expect(performInventoryAction(session, 0, "drop")).toMatchObject({ used: true })
    expect(session.inventory).not.toContain("Bent lockpick")
  })

  test("inventory tools create tactical item and gear decisions", () => {
    const session = createSession(1234)
    session.hp = session.maxHp - 1
    session.focus = Math.max(0, session.maxFocus - 1)
    const startingMaxHp = session.maxHp
    session.inventory.unshift("Travel rations")

    expect(performInventoryAction(session, 0, "use")).toMatchObject({ used: true })
    expect(session.maxHp).toBe(startingMaxHp + 1)
    expect(session.hp).toBe(session.maxHp)

    const gold = session.gold
    session.inventory.unshift("Cursed shard")
    expect(performInventoryAction(session, 0, "use")).toMatchObject({ used: true })
    expect(session.gold).toBe(gold + 14)
    expect(session.hp).toBeLessThan(session.maxHp)

    addEnemyBesidePlayer(session, "tool-slime", "slime", 3, 1)
    tryMove(session, 1, 0)
    expect(session.combat.active).toBe(true)
    session.inventory.unshift("Tripwire kit")

    expect(performInventoryAction(session, 0, "use")).toMatchObject({ used: true })
    expect(session.dungeon.actors.some((actor) => actor.id === "tool-slime")).toBe(false)
    expect(equipmentComparisonText(session, "Shrine charm")).toContain("Compare relic")
    expect(equipmentComparisonText(session, "Shrine charm")).toContain("FTH +1")
  })

  test("tracks Book knowledge and event toasts for the amnesia story", () => {
    const session = createSession(1234)

    expect(session.log[0]).toContain("no memory")
    expect(session.knowledge.map((entry) => entry.title)).toContain("Waking Cell")
    expect(session.knowledge.find((entry) => entry.id === "floor-1-the-waking-cell")?.text).toContain("Tactical purpose")
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

  test("applies validated GM patch operations to live enemy pressure", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "gm-slime", "slime", 4, 1)
    const enemy = session.dungeon.actors.find((actor) => actor.id === "gm-slime")
    expect(enemy).toBeDefined()
    const hp = enemy!.hp
    const damage = enemy!.damage

    const result = applyGmPatchOperations(session, [
      { path: "rules.enemyHpMultiplier", value: 1.5 },
      { path: "rules.enemyDamageBonus", value: 2 },
      { path: `floors.${session.floor}.encounterBudget`, value: 5 },
      { path: "lore.gmBriefing", value: "The GM adds pressure without changing the canonical story." },
    ])

    expect(result.applied).toBeGreaterThan(0)
    expect(enemy!.maxHp).toBeGreaterThan(hp)
    expect(enemy!.damage).toBe(damage + 2)
    expect(enemy!.ai?.alerted).toBe(true)
    expect(session.log[0]).toContain("GM patch applied")
    expect(session.toasts[0]?.title).toBe("GM rules applied")
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
    expect(session.hp).toBe(session.maxHp)
    expect(session.conversation?.status).toBe("completed")
    expect(session.worldLog.length).toBeGreaterThan(1)
  })

  test("completed quest chains apply village-facing outcomes", () => {
    const session = createSession(1234)
    const questEvent = session.world.events.find((event) => event.type === "quest")
    expect(questEvent).toBeTruthy()
    questEvent!.status = "active"
    session.world.quests.unshift({
      id: "quest-test-rescue",
      title: "Rescue: Floors 1-2",
      summary: "Find a trapped villager. Village outcome: trust and keepsake lead.",
      status: "active",
      objectiveEventIds: [questEvent!.id],
      rewardEntityIds: [],
      triggerEventIds: [],
    })

    applyOpeningStoryBranch(session, "follow-voice")

    expect(session.world.quests[0]?.status).toBe("completed")
    expect(session.inventory).toContain("Rescue keepsake")
    expect(session.knowledge.find((entry) => entry.id === "quest-outcome-quest-test-rescue")?.title).toContain("Quest Complete")
    expect(session.hub.relationshipLog[0]).toContain("Quest outcome")
    expect(session.toasts).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Quest complete" })]))
  })

  test("NPCs remember already-used choices for the current descent", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "repeat-merchant", "merchant", 1, 0)

    tryMove(session, 1, 0)
    const first = chooseConversationOption(session, 1)
    const xpAfterFirstRumor = session.xp
    interactWithWorld(session)
    tryMove(session, 1, 0)
    const repeated = chooseConversationOption(session, 1)

    expect(first?.text).toContain("pays best")
    expect(repeated?.text).toContain("already asked")
    expect(session.xp).toBe(xpAfterFirstRumor)
    expect(session.toasts[0].title).toBe("Already asked")
  })

  test("tutorial-off starts still focus the final-gate quest", () => {
    const session = createSession(1234, "solo", "ranger", "Mira", undefined, false, true)

    expect(session.tutorial.enabled).toBe(false)
    expect(session.tutorial.completed).toBe(true)
    expect(session.tutorial.gatePoints).toEqual([])
    expect(session.world.quests[0]?.title).toBe("Find the Final Gate")
    expect(session.toasts[0]).toMatchObject({ title: "Find the Final Gate", tone: "info" })
    expect(session.log[0]).toContain("Tutorial is off")
    expect(session.knowledge.find((entry) => entry.id === "tutorial-off-start")?.text).toContain("Find stairs")
  })

  test("tutorial gates three first-floor areas for movement, NPC checks, and combat", () => {
    const session = createSession(1234, "solo", "ranger", "Mira", undefined, true)
    const [gateOne, gateTwo] = session.tutorial.gatePoints
    expect(session.hp).toBe(session.maxHp - 6)
    expect(gateOne).toBeDefined()
    expect(gateTwo).toBeDefined()
    expect(tileAt(session.dungeon, gateOne!)).toBe("door")
    expect(tileAt(session.dungeon, gateTwo!)).toBe("door")

    session.player = { x: gateOne!.x - 1, y: gateOne!.y }
    tryMove(session, 1, 0)

    expect(session.floor).toBe(1)
    expect(session.player).toEqual({ x: gateOne!.x - 1, y: gateOne!.y })
    expect(session.log[0]).toContain("Area I gate is locked")

    recordTutorialAction(session, "move-up")
    recordTutorialAction(session, "move-down")
    recordTutorialAction(session, "move-left")
    recordTutorialAction(session, "move-right")
    recordTutorialAction(session, "inventory")
    recordTutorialAction(session, "quests")
    recordTutorialAction(session, "book")
    expect(session.tutorial.stage).toBe("npc-check")
    expect(tileAt(session.dungeon, gateOne!)).toBe("floor")

    const npc = session.dungeon.actors.find((actor) => actor.id === "tutorial-wound-surgeon")
    const enemy = session.dungeon.actors.find((actor) => actor.id === "tutorial-slime")
    expect(npc?.position.x).toBeGreaterThan(gateOne!.x)
    expect(npc?.position.x).toBeLessThan(gateTwo!.x)
    expect(enemy?.position.x).toBeGreaterThan(gateTwo!.x)

    recordTutorialAction(session, "npc")
    recordTutorialAction(session, "talent-check")
    expect(session.tutorial.stage).toBe("combat")
    expect(tileAt(session.dungeon, gateTwo!)).toBe("floor")

    recordTutorialAction(session, "combat-start")
    recordTutorialAction(session, "combat-end")
    expect(session.tutorial.completed).toBe(true)

    const stairs = session.dungeon.tiles.flatMap((row, y) => row.map((tile, x) => ({ tile, x, y }))).find((entry) => entry.tile === "stairs")
    expect(stairs).toBeDefined()
    session.player = { x: stairs!.x - 1, y: stairs!.y }
    tryMove(session, 1, 0)
    expect(session.floor).toBe(2)
    expect(session.tutorial.handoffShown).toBe(true)
    expect(session.log[0]).toContain("You are on your own now")
    expect(session.toasts[0].title).toBe("Find the Final Gate")
    expect(session.world.quests[0]?.title).toBe("Find the Final Gate")
  })

  test("co-op tutorial gates wait for party checkpoints before opening", () => {
    const session = createSession(1234, "coop", "ranger", "Mira", undefined, true)
    const [gateOne] = session.tutorial.gatePoints

    setTutorialCoopGateHold(session, "movement", ["Sol"])
    recordTutorialAction(session, "move-up")
    recordTutorialAction(session, "move-down")
    recordTutorialAction(session, "move-left")
    recordTutorialAction(session, "move-right")
    recordTutorialAction(session, "inventory")
    recordTutorialAction(session, "quests")
    recordTutorialAction(session, "book")

    expect(tutorialCoopCheckpoint(session)).toMatchObject({ stage: "movement", ready: true, completed: false })
    expect(session.tutorial.stage).toBe("movement")
    expect(tileAt(session.dungeon, gateOne!)).toBe("door")
    expect(session.log[0]).toContain("waits for Sol")

    setTutorialCoopGateHold(session, null, [])

    expect(session.tutorial.stage).toBe("npc-check")
    expect(tileAt(session.dungeon, gateOne!)).toBe("floor")
  })

  test("death increments the run counter and disables the current tutorial", () => {
    const session = createSession(1234, "solo", "ranger", "Mira", undefined, true)
    const trap = { x: session.player.x + 1, y: session.player.y }
    session.hp = 1
    setTile(session.dungeon, trap, "trap")

    tryMove(session, 1, 0)

    expect(session.status).toBe("dead")
    expect(session.deaths).toBe(1)
    expect(session.tutorial.enabled).toBe(false)
    expect(session.tutorial.disabledAfterDeath).toBe(true)
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

  test("ranger pathfinder talent is visible as an aimed-shot combat effect", () => {
    const session = createSession(1234, "solo", "ranger")
    grantXp(session, 10)
    chooseLevelUpTalent(session, 0)
    const aimedShot = combatSkills.find((skill) => skill.id === "aimed-shot")!

    expect(session.talents).toContain("pathfinder")
    expect(talentEffectTextForSkill(session, aimedShot)).toContain("Pathfinder +1 damage")
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

  test("combat balance snapshot exposes d20 odds, focus pressure, and monster notes", () => {
    const session = createSession(1234)
    addEnemyBesidePlayer(session, "balance-slime", "slime", 6, 2)

    tryMove(session, 1, 0)

    const snapshot = combatBalanceSnapshot(session)
    expect(snapshot.target).toContain("Slime")
    expect(snapshot.skill).toBeTruthy()
    expect(snapshot.hitChance).toBeGreaterThan(0)
    expect(snapshot.fleeChance).toBeGreaterThan(0)
    expect(snapshot.focusPressure).toBeGreaterThanOrEqual(0)
    expect(snapshot.deathRisk).toBeGreaterThanOrEqual(0)
    expect(snapshot.projectedClassWinRate).toBeGreaterThan(0)
    expect(snapshot.weaknessNote).toContain("Resists")
    expect(snapshot.focusNote).toContain("Focus pressure")
  })

  test("flee odds include equipment stat bonuses", () => {
    const session = createSession(1234)
    const before = fleeModifier(session)

    session.equipment.armor = {
      id: "runner-cloak",
      name: "Runner cloak",
      slot: "armor",
      rarity: "uncommon",
      bonusDamage: 0,
      statBonuses: { dexterity: 4, luck: 2 },
      activeText: "A light cloak for breaking from bad fights.",
    }

    expect(fleeModifier(session)).toBeGreaterThan(before)
  })

  test("boss phase telegraphs write Book notes before the fight ends", () => {
    const session = createSession(1234)
    session.stats.strength = 30
    const target = addEnemyBesidePlayer(session, "phase-root", "grave-root-boss", 18, 1)
    const boss = session.dungeon.actors.find((actor) => actor.id === "phase-root")!
    boss.maxHp = 34

    tryMove(session, target.x - session.player.x, target.y - session.player.y)
    for (let attempt = 0; attempt < 3 && (boss.phase ?? 1) < 2; attempt += 1) performCombatAction(session)

    expect(boss.phase).toBe(2)
    expect(session.log.some((line) => line.includes("Telegraph"))).toBe(true)
    expect(session.knowledge.some((entry) => entry.id === "boss-phase-grave-root-boss-floor-1-phase-2" && entry.text.includes("Holy and Arcane"))).toBe(true)
    expect(session.toasts).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Boss phase" })]))
  })

  test("boss defeats create village aftermath and market demand", () => {
    const session = createSession(1234)
    session.stats.strength = 30
    const target = addEnemyBesidePlayer(session, "aftermath-root", "grave-root-boss", 2, 1)

    tryMove(session, target.x - session.player.x, target.y - session.player.y)
    for (let attempt = 0; attempt < 3 && session.dungeon.actors.some((actor) => actor.id === "aftermath-root"); attempt += 1) performCombatAction(session)

    expect(session.dungeon.actors.some((actor) => actor.id === "aftermath-root")).toBe(false)
    expect(session.inventory[0]).toContain("memory")
    expect(session.hub.village.shopLog[0]).toContain("boss memories")
    expect(session.hub.village.customers.some((customer) => customer.taste === "memory")).toBe(true)
    expect(session.knowledge.some((entry) => entry.id === "boss-aftermath-grave-root-boss-floor-1" && entry.text.includes("village economy"))).toBe(true)
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

  test("village crafting combines loot crops and trust into run prep", () => {
    const session = createSession(1234, "solo", "ranger", "Mira")
    unlockHub(session)
    session.hub.coins = 200
    expect(buildHubStation(session, "kitchen")).toBe(true)
    expect(buildHubStation(session, "upgrade-bench")).toBe(true)

    session.inventory.unshift("Tool part bundle")
    const tool = craftVillageRecipe(session)
    expect(tool).toMatchObject({ kind: "tool", item: "Gate bomb" })
    expect(tool?.consumed).toContain("Tool part bundle")
    expect(session.inventory).toContain("Gate bomb")
    expect(session.inventory).not.toContain("Tool part bundle")

    session.hub.trust.cook.level = 1
    session.inventory.unshift("Friendship keepsake")
    const charm = craftVillageRecipe(session)
    expect(charm).toMatchObject({ kind: "charm", item: "Hearth charm" })
    expect(charm?.consumed).toContain("Friendship keepsake")
    expect(session.inventory).toContain("Hearth charm")
    expect(session.hub.unlockedGear).toContain("Hearth charm")

    session.hub.farm.ready = 1
    const food = craftVillageRecipe(session)
    expect(food).toBeTruthy()
    expect(food?.kind).toBe("food")
    expect(food?.consumed).toContain("village crop")
    expect(session.hub.farm.ready).toBe(0)
    expect(session.hub.preparedFood[0]).toBe(food!.item)
    expect(session.knowledge.some((entry) => entry.id === "craft-gate-bomb")).toBe(true)
  })

  test("next descent preserves village meta-progression and preparation", () => {
    const session = createSession(1234, "coop", "ranger", "Mira", undefined, true)
    unlockHub(session)
    session.hub.coins = 260
    expect(buildHubStation(session, "blacksmith")).toBe(true)
    expect(buildHubStation(session, "kitchen")).toBe(true)
    expect(prepareFood(session)).toBe("Travel rations")
    expect(upgradeWeapon(session)?.bonusDamage).toBe(1)
    expect(toggleRunMutator(session, "hard-mode")).toBe(true)
    expect(cycleContentPack(session).active).toBe("high-contrast")

    const next = createNextDescentSession(session, 9999)
    expect(next.seed).toBe(9999)
    expect(next.floor).toBe(1)
    expect(next.tutorial.enabled).toBe(false)
    expect(next.hub.unlocked).toBe(true)
    expect(next.hub.stations.blacksmith.built).toBe(true)
    expect(next.hub.stations.kitchen.built).toBe(true)
    expect(next.hub.activeMutators).toContain("hard-mode")
    expect(next.hub.contentPacks.active).toBe("high-contrast")
    expect(next.hub.coins).toBe(session.hub.coins)
    expect(next.hub.houses.length).toBe(session.hub.houses.length)
    expect(next.inventory).toContain("Travel rations")
    expect(next.equipment.weapon?.bonusDamage).toBe(1)
    expect(next.maxHp).toBeLessThanOrEqual(session.maxHp)
    expect(next.world.quests[0]?.title).toBe("Find the Final Gate")
    expect(next.toasts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Next descent", tone: "success" }),
        expect.objectContaining({ title: "Sharper descent", tone: "warning" }),
      ]),
    )
    expect(next.log[0]).toContain("Village preparations carried")
  })

  test("village-launched descents add strategic enemy pressure", () => {
    const session = createSession(1234, "coop", "ranger", "Mira")
    unlockHub(session)
    session.hub.coins = 260
    expect(buildHubStation(session, "blacksmith")).toBe(true)
    expect(toggleRunMutator(session, "hard-mode")).toBe(true)

    const base = createDungeon(9999, 1)
    const next = createNextDescentSession(session, 9999)
    const baseEnemy = base.actors.find((actor) => isEnemyActorId(actor.kind))
    expect(baseEnemy).toBeTruthy()
    const pressuredEnemy = next.dungeon.actors.find((actor) => actor.id === baseEnemy!.id)
    const baseAggro = baseEnemy?.ai?.aggroRadius ?? 0

    expect(pressuredEnemy?.hp).toBeGreaterThan(baseEnemy!.hp)
    expect(pressuredEnemy?.ai?.aggroRadius).toBeGreaterThan(baseAggro)
    expect(next.log.some((line) => line.includes("Strategic pressure tier"))).toBe(true)
  })

  test("challenge descents add fixed mutators and local replay leaderboard metadata", () => {
    const session = createSession(1234, "solo", "ranger", "Mira")
    unlockHub(session)
    const next = createNextDescentSession(session, 2_026_051)
    const active = applyChallengeRun(next, "weekly")

    expect(active.cadence).toBe("weekly")
    expect(active.seed).toBe(2_026_051)
    expect(active.mutators.length).toBeGreaterThan(1)
    expect(next.hub.activeMutators).toEqual(expect.arrayContaining(active.mutators))
    expect(next.knowledge.some((entry) => entry.id === "challenge-weekly-2026051")).toBe(true)

    next.status = "victory"
    next.floor = next.finalFloor
    next.kills = 6
    next.gold = 30
    const entry = recordChallengeResult(next)

    expect(entry?.replayKey).toBe(active.replayKey)
    expect(entry?.score).toBeGreaterThan(0)
    expect(next.hub.challengeBoard.activeRun).toBeNull()
    expect(next.hub.challengeBoard.leaderboard[0]?.name).toBe("Mira")
  })

  test("village calendar changes seasons and modifies the next descent", () => {
    const session = createSession(1234, "solo", "ranger", "Mira")
    unlockHub(session)
    session.turn = 144
    const calendar = refreshVillageCalendar(session)

    expect(calendar.day).toBe(13)
    expect(calendar.festival).toBe("final-gate-vigil")

    const next = createNextDescentSession(session, 8888)
    expect(next.hub.calendar.day).toBe(13)
    expect(next.inventory).toContain("Final-gate candle")
    expect(next.knowledge.some((entry) => entry.id === "village-calendar-day-13" && entry.text.includes("final gate vigil"))).toBe(true)
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
    expect(cycleCoopVillagePermission(session, "storage")).toMatchObject({ area: "storage", permission: "everyone" })
    expect(cycleCoopVillagePermission(session, "shop")).toMatchObject({ area: "shop", permission: "friends" })
    expect(cycleCoopVillagePermission(session, "upgrades")).toMatchObject({ area: "upgrades", permission: "friends" })
    expect(session.hub.village.permissions).toMatchObject({
      farm: "everyone",
      storage: "everyone",
      shop: "friends",
      upgrades: "friends",
    })
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

  test("first clear resolves on the default two-floor arc", () => {
    const session = createSession(1234)
    expect(session.finalFloor).toBe(defaultFinalFloor)

    session.floor = session.finalFloor
    session.dungeon = createDungeon(session.seed, session.floor)
    expect(session.dungeon.actors.some((actor) => actor.id === "final-guardian")).toBe(true)

    session.player = { ...session.dungeon.playerStart }
    session.dungeon.actors = session.dungeon.actors.filter((actor) => actor.id !== "final-guardian")
    const stairs = { x: session.player.x + 1, y: session.player.y }
    setTile(session.dungeon, stairs, "stairs")

    tryMove(session, 1, 0)

    expect(session.status).toBe("victory")
    expect(session.hub.unlocked).toBe(true)
    expect(session.knowledge.find((entry) => entry.id === "ending-first-clear")?.floor).toBe(defaultFinalFloor)
  })

})
