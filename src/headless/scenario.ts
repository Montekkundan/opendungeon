import { readFileSync } from "node:fs"
import type { Actor } from "../game/dungeon.js"
import { type TileId } from "../game/domainTypes.js"
import { HeadlessGameEnv, type HeadlessActionInput, type HeadlessEnvOptions } from "./env.js"

export type ScenarioAssertion = {
  path: string
  equals?: unknown
  contains?: unknown
  min?: number
  max?: number
  truthy?: boolean
}

export type ScenarioLine = {
  action?: HeadlessActionInput
  command?:
    | "first-legal-move"
    | "check-invariants"
    | "set-relative-tile"
    | "place-relative-actor"
    | "add-item"
    | "set-stat"
    | "set-gold"
    | "set-hub-coins"
    | "add-xp"
    | "set-hero-name"
    | "damage-player"
    | "complete-tutorial"
    | "complete-first-clear"
    | "login-local-test"
    | "login-expired-test"
    | "render"
  assert?: ScenarioAssertion
  dx?: number
  dy?: number
  tile?: TileId
  id?: string
  kind?: Actor["kind"]
  hp?: number
  damage?: number
  item?: string
  stat?: keyof HeadlessGameEnv["session"]["stats"]
  value?: number
  name?: string
}

export type ScenarioResult = {
  name: string
  seed: number
  ok: boolean
  events: unknown[]
  failures: string[]
  finalSnapshot: ReturnType<HeadlessGameEnv["snapshot"]>
}

export function runScenario(name: string, lines: ScenarioLine[], options: HeadlessEnvOptions = {}): ScenarioResult {
  const env = new HeadlessGameEnv({ isolateStorage: true, ...options })
  const events: unknown[] = []
  const failures: string[] = []

  try {
    events.push({ type: "reset", observation: env.observeTest() })
    for (const [index, line] of lines.entries()) {
      try {
        const event = runScenarioLine(env, line)
        if (event) events.push({ index, ...event })
        if (line.assert) assertScenario(env.observeTest(), line.assert, failures, index)
      } catch (error) {
        failures.push(`line ${index + 1}: ${error instanceof Error ? error.message : "scenario command failed"}`)
      }
    }
    return {
      name,
      seed: env.session.seed,
      ok: failures.length === 0,
      events,
      failures,
      finalSnapshot: env.snapshot(),
    }
  } finally {
    env.close()
  }
}

export function loadScenarioFile(path: string): ScenarioLine[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line) as ScenarioLine)
}

export function builtinScenario(name: string): ScenarioLine[] | null {
  if (name === "smoke") {
    return [
      { assert: { path: "session.status", equals: "running" } },
      { command: "first-legal-move" },
      { action: "rest" },
      { assert: { path: "session.turn", min: 1 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "combat") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "floor" },
      { command: "place-relative-actor", id: "script-slime", kind: "slime", dx: 1, dy: 0, hp: 1, damage: 0 },
      { command: "set-stat", stat: "strength", value: 100 },
      { action: "move-east" },
      { assert: { path: "session.combat.active", equals: true } },
      { assert: { path: "session.combat.round", equals: 1 } },
      { assert: { path: "session.combat.initiative.length", min: 2 } },
      { action: "select-skill-0" },
      { action: "combat-roll" },
      { assert: { path: "session.kills", min: 1 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "combat-skills") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "floor" },
      { command: "place-relative-actor", id: "script-necromancer", kind: "necromancer", dx: 1, dy: 0, hp: 20, damage: 0 },
      { command: "set-stat", stat: "faith", value: 100 },
      { action: "move-east" },
      { action: "select-skill-3" },
      { action: "combat-roll" },
      { assert: { path: "session.combat.lastRoll.skill", equals: "Smite" } },
      { command: "check-invariants" },
    ]
  }

  if (name === "area-combat") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "floor" },
      { command: "set-relative-tile", dx: 0, dy: 1, tile: "floor" },
      { command: "place-relative-actor", id: "script-ghoul", kind: "ghoul", dx: 1, dy: 0, hp: 10, damage: 0 },
      { command: "place-relative-actor", id: "script-slime", kind: "slime", dx: 0, dy: 1, hp: 5, damage: 0 },
      { command: "set-stat", stat: "intelligence", value: 60 },
      { action: "move-east" },
      { action: "select-skill-2" },
      { action: "combat-roll" },
      { assert: { path: "session.combat.lastRoll.skill", equals: "Arcane Burst" } },
      { assert: { path: "session.kills", min: 2 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "boss-phase") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "floor" },
      { command: "place-relative-actor", id: "script-boss", kind: "necromancer", dx: 1, dy: 0, hp: 30, damage: 3 },
      { command: "set-stat", stat: "strength", value: 60 },
      { action: "move-east" },
      { action: "select-skill-0" },
      { action: "combat-roll" },
      { assert: { path: "session.combat.message", contains: "phase 2" } },
      { assert: { path: "session.hp", equals: 20 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "status-effects") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "floor" },
      { command: "place-relative-actor", id: "script-necromancer", kind: "necromancer", dx: 1, dy: 0, hp: 80, damage: 5 },
      { command: "set-stat", stat: "mind", value: 60 },
      { action: "move-east" },
      { action: "select-skill-4" },
      { action: "combat-roll" },
      { assert: { path: "session.combat.lastRoll.skill", equals: "Shadow Hex" } },
      { assert: { path: "statusEffects.0.id", equals: "weakened" } },
      { assert: { path: "statusEffects.0.remainingTurns", equals: 1 } },
      { assert: { path: "session.hp", equals: 22 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "reaction-block") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "floor" },
      { command: "place-relative-actor", id: "script-ghoul", kind: "ghoul", dx: 1, dy: 0, hp: 80, damage: 5 },
      { command: "set-stat", stat: "luck", value: 80 },
      { action: "move-east" },
      { action: "select-skill-5" },
      { action: "combat-roll" },
      { assert: { path: "session.combat.lastRoll.skill", equals: "Lucky Riposte" } },
      { assert: { path: "session.hp", equals: 22 } },
      { assert: { path: "session.log.0", contains: "Riposte reaction" } },
      { command: "check-invariants" },
    ]
  }

  if (name === "character-name") {
    return [
      { command: "set-hero-name", name: "Nyx Prime" },
      { assert: { path: "session.hero.name", equals: "Nyx Prime" } },
      { action: "save" },
      { assert: { path: "saves.0.heroName", equals: "Nyx Prime" } },
      { command: "check-invariants" },
    ]
  }

  if (name === "starting-loadout") {
    return [
      { assert: { path: "session.inventory.length", min: 3 } },
      { assert: { path: "session.inventory.0", truthy: true } },
      { action: "open-inventory" },
      { assert: { path: "panel", equals: "inventory" } },
      { command: "check-invariants" },
    ]
  }

  if (name === "biome") {
    return [
      { assert: { path: "biome", truthy: true } },
      { assert: { path: "snapshot.biome", truthy: true } },
      { command: "render" },
      { command: "check-invariants" },
    ]
  }

  if (name === "trap") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "trap" },
      { action: "move-east" },
      { assert: { path: "session.hp", equals: 23 } },
      { assert: { path: "session.log.0", contains: "Trap sprung" } },
      { command: "check-invariants" },
    ]
  }

  if (name === "secret-door") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "door" },
      { action: "move-east" },
      { assert: { path: "session.log.0", contains: "Locked door opens" } },
      { command: "check-invariants" },
    ]
  }

  if (name === "floor-modifier") {
    return [
      { assert: { path: "floorModifier.id", truthy: true } },
      { assert: { path: "floorModifier.name", truthy: true } },
      { assert: { path: "snapshot.floorModifier", truthy: true } },
      { command: "render" },
      { command: "check-invariants" },
    ]
  }

  if (name === "skill-check") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "potion" },
      { action: "move-east" },
      { assert: { path: "session.skillCheck.status", equals: "pending" } },
      { action: "resolve-skill-check" },
      { assert: { path: "session.skillCheck.status", equals: "resolved" } },
      { action: "dismiss-skill-check" },
      { assert: { path: "session.skillCheck", equals: null } },
      { command: "check-invariants" },
    ]
  }

  if (name === "note-collectible") {
    return [
      { assert: { path: "session.knowledge.length", min: 3 } },
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "note" },
      { action: "move-east" },
      { assert: { path: "session.log.0", contains: "Recovered note" } },
      { assert: { path: "session.knowledge.0.title", contains: "Recovered Note" } },
      { action: "open-book" },
      { assert: { path: "panel", equals: "book" } },
      { command: "check-invariants" },
    ]
  }

  if (name === "collectible-variety") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "recipe" },
      { action: "move-east" },
      { assert: { path: "session.knowledge.0.title", contains: "Recovered Recipe" } },
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "tool" },
      { action: "move-east" },
      { assert: { path: "session.knowledge.0.title", contains: "Recovered Tool Part" } },
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "deed" },
      { action: "move-east" },
      { assert: { path: "session.hub.unlocked", equals: true } },
      { assert: { path: "session.log.0", contains: "Village deed" } },
      { command: "check-invariants" },
    ]
  }

  if (name === "rare-collectibles") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "fossil" },
      { action: "move-east" },
      { assert: { path: "session.knowledge.0.title", contains: "Recovered Fossil" } },
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "boss-memory" },
      { action: "move-east" },
      { assert: { path: "session.knowledge.0.title", contains: "Boss Memory" } },
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "keepsake" },
      { action: "move-east" },
      { assert: { path: "session.knowledge.0.title", contains: "Friendship Keepsake" } },
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "story-relic" },
      { action: "move-east" },
      { assert: { path: "session.knowledge.0.title", contains: "AI Admin Story Relic" } },
      { assert: { path: "session.pendingWorldGeneration", equals: true } },
      { command: "check-invariants" },
    ]
  }

  if (name === "hub-economy") {
    return [
      { action: "unlock-hub" },
      { command: "set-hub-coins", value: 180 },
      { action: "build-blacksmith" },
      { assert: { path: "session.hub.stations.blacksmith.built", equals: true } },
      { action: "build-kitchen" },
      { assert: { path: "session.hub.stations.kitchen.built", equals: true } },
      { command: "add-item", item: "Bound relic" },
      { command: "add-item", item: "Rollback scroll" },
      { action: "sell-loot" },
      { assert: { path: "session.hub.lootSold", min: 2 } },
      { action: "prepare-food" },
      { assert: { path: "session.hub.preparedFood.0", truthy: true } },
      { action: "upgrade-weapon" },
      { assert: { path: "session.equipment.weapon.bonusDamage", min: 1 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "hub-farming") {
    return [
      { action: "unlock-hub" },
      { command: "set-hub-coins", value: 120 },
      { action: "build-farm" },
      { assert: { path: "session.hub.stations.farm.built", equals: true } },
      { action: "plant-crop" },
      { assert: { path: "session.hub.farm.planted", min: 1 } },
      { action: "harvest-farm" },
      { assert: { path: "session.hub.farm.planted", equals: 0 } },
      { assert: { path: "session.hub.coins", min: 1 } },
      { action: "complete-village-quest" },
      { assert: { path: "session.hub.trust.guildmaster.questsCompleted", min: 1 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "village-screen") {
    return [
      { action: "unlock-hub" },
      { action: "open-village" },
      { assert: { path: "panel", equals: "village" } },
      { action: "village-east" },
      { assert: { path: "session.hub.village.selectedLocation", truthy: true } },
      { action: "visit-village" },
      { assert: { path: "session.hub.village.schedules.length", min: 5 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "village-shop") {
    return [
      { action: "unlock-hub" },
      { command: "add-item", item: "Boss memory shard" },
      { action: "shop-price" },
      { assert: { path: "session.hub.village.shopLog.0", truthy: true } },
      { assert: { path: "session.hub.coins", min: 1 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "village-meta") {
    return [
      { action: "unlock-hub" },
      { action: "customize-house" },
      { assert: { path: "session.hub.houses.0.name", truthy: true } },
      { action: "cycle-farm-permission" },
      { assert: { path: "session.hub.village.sharedFarm.permissions", truthy: true } },
      { action: "cycle-content-pack" },
      { assert: { path: "session.hub.contentPacks.active", truthy: true } },
      { action: "refresh-balance-dashboard" },
      { assert: { path: "session.hub.balanceDashboard.runs", min: 1 } },
      { action: "play-cutscene" },
      { assert: { path: "session.hub.lastCutsceneId", truthy: true } },
      { command: "check-invariants" },
    ]
  }

  if (name === "first-clear-loop") {
    return [
      { command: "complete-tutorial" },
      { assert: { path: "session.floor", equals: 2 } },
      { assert: { path: "session.tutorial.handoffShown", equals: true } },
      { assert: { path: "session.world.quests.0.title", equals: "Find the Final Gate" } },
      { command: "add-item", item: "Boss memory shard" },
      { command: "add-item", item: "Recovered fossil" },
      { command: "add-item", item: "Bound relic" },
      { command: "add-item", item: "Village deed" },
      { command: "complete-first-clear" },
      { assert: { path: "session.status", equals: "victory" } },
      { assert: { path: "session.hub.unlocked", equals: true } },
      { action: "open-village" },
      { assert: { path: "panel", equals: "village" } },
      { action: "sell-loot" },
      { assert: { path: "session.hub.coins", min: 95 } },
      { action: "build-blacksmith" },
      { assert: { path: "session.hub.stations.blacksmith.built", equals: true } },
      { action: "build-kitchen" },
      { assert: { path: "session.hub.stations.kitchen.built", equals: true } },
      { action: "prepare-food" },
      { assert: { path: "session.inventory", contains: "Travel rations" } },
      { action: "start-next-descent" },
      { assert: { path: "session.status", equals: "running" } },
      { assert: { path: "session.floor", equals: 1 } },
      { assert: { path: "session.seed", min: 1 } },
      { assert: { path: "session.hub.unlocked", equals: true } },
      { assert: { path: "session.hub.stations.blacksmith.built", equals: true } },
      { assert: { path: "session.hub.stations.kitchen.built", equals: true } },
      { assert: { path: "session.inventory", contains: "Travel rations" } },
      { command: "check-invariants" },
    ]
  }

  if (name === "run-mutators") {
    return [
      { action: "unlock-hub" },
      { action: "toggle-hard-mode" },
      { assert: { path: "session.hub.activeMutators", contains: "hard-mode" } },
      { action: "toggle-cursed-floors" },
      { assert: { path: "session.hub.activeMutators", contains: "cursed-floors" } },
      { action: "toggle-boss-rush" },
      { assert: { path: "session.finalFloor", max: 3 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "save-load") {
    return [
      { command: "set-gold", value: 77 },
      { action: "save" },
      { assert: { path: "saves.length", min: 1 } },
      { command: "set-gold", value: 1 },
      { action: "load-latest-save" },
      { assert: { path: "session.gold", equals: 77 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "save-management") {
    return [
      { command: "set-gold", value: 88 },
      { action: "autosave" },
      { assert: { path: "saves.0.slot", equals: "autosave" } },
      { action: "rename-latest-save" },
      { assert: { path: "saves.0.name", equals: "Headless renamed save" } },
      { action: "check-latest-save" },
      { action: "export-latest-save" },
      { action: "import-last-export" },
      { assert: { path: "saves.length", min: 2 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "auth-local") {
    return [
      { assert: { path: "auth.loggedIn", equals: false } },
      { assert: { path: "auth.status", equals: "offline" } },
      { command: "login-local-test" },
      { assert: { path: "auth.loggedIn", equals: true } },
      { assert: { path: "auth.username", equals: "test" } },
      { assert: { path: "auth.status", equals: "active" } },
      { assert: { path: "auth.canRefresh", equals: true } },
      { assert: { path: "auth.syncAvailable", equals: true } },
    ]
  }

  if (name === "auth-expired") {
    return [
      { command: "login-expired-test" },
      { assert: { path: "auth.loggedIn", equals: true } },
      { assert: { path: "auth.status", equals: "expired" } },
      { assert: { path: "auth.canRefresh", equals: true } },
      { assert: { path: "auth.syncAvailable", equals: false } },
      { assert: { path: "auth.warnings.0", contains: "expired" } },
    ]
  }

  if (name === "map-generation") {
    return [
      { assert: { path: "session.dungeon.width", min: 40 } },
      { assert: { path: "worldValidationErrors.length", equals: 0 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "npc-event") {
    return [
      { assert: { path: "session.world.entities.length", min: 1 } },
      { assert: { path: "session.world.events.length", min: 50 } },
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "chest" },
      { action: "move-east" },
      { action: "resolve-skill-check" },
      { assert: { path: "session.worldLog.length", min: 2 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "npc-conversation") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "floor" },
      { command: "place-relative-actor", id: "script-cartographer", kind: "cartographer", dx: 1, dy: 0, hp: 1, damage: 0 },
      { action: "move-east" },
      { assert: { path: "session.combat.active", equals: false } },
      { assert: { path: "session.conversation.kind", equals: "cartographer" } },
      { assert: { path: "session.conversation.speaker", contains: "Cartographer" } },
      { assert: { path: "session.worldLog.length", min: 2 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "merchant") {
    return [
      { command: "set-gold", value: 20 },
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "floor" },
      { command: "place-relative-actor", id: "script-merchant", kind: "merchant", dx: 1, dy: 0, hp: 1, damage: 0 },
      { action: "move-east" },
      { assert: { path: "session.conversation.trade.item", equals: "Merchant salve" } },
      { action: "interact" },
      { assert: { path: "session.gold", equals: 8 } },
      { assert: { path: "session.inventory", contains: "Merchant salve" } },
      { assert: { path: "session.conversation.trade.purchased", equals: true } },
      { command: "check-invariants" },
    ]
  }

  if (name === "level-up-talent") {
    return [
      { command: "add-xp", value: 10 },
      { assert: { path: "session.level", equals: 2 } },
      { assert: { path: "session.levelUp.choices.length", min: 1 } },
      { action: "choose-levelup-0" },
      { assert: { path: "session.levelUp", equals: null } },
      { assert: { path: "session.talents.length", min: 1 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "dialogue-options") {
    return [
      { command: "set-relative-tile", dx: 1, dy: 0, tile: "floor" },
      { command: "place-relative-actor", id: "script-shrine", kind: "shrine-keeper", dx: 1, dy: 0, hp: 1, damage: 0 },
      { action: "move-east" },
      { assert: { path: "session.conversation.options.length", min: 3 } },
      { action: "choose-dialogue-0" },
      { assert: { path: "session.conversation.status", equals: "completed" } },
      { assert: { path: "session.focus", min: 1 } },
      { command: "check-invariants" },
    ]
  }

  if (name === "full-run") {
    return [
      { command: "first-legal-move" },
      { action: "rest" },
      { command: "first-legal-move" },
      { action: "open-inventory" },
      { assert: { path: "panel", equals: "inventory" } },
      { action: "close-panel" },
      { command: "check-invariants" },
    ]
  }

  return null
}

function runScenarioLine(env: HeadlessGameEnv, line: ScenarioLine) {
  if (line.action !== undefined) return { type: "step", result: env.step(line.action) }
  if (!line.command) return null

  if (line.command === "first-legal-move") {
    const action = env.legalActions().find((candidate) => candidate.startsWith("move-")) ?? "noop"
    return { type: "step", result: env.step(action) }
  }
  if (line.command === "check-invariants") {
    const errors = env.validateInvariants()
    if (errors.length) throw new Error(errors.join(" "))
    return { type: "invariants", errors }
  }
  if (line.command === "set-relative-tile") {
    env.setRelativeTile(number(line.dx), number(line.dy), line.tile ?? "floor")
    return { type: "setup", command: line.command }
  }
  if (line.command === "place-relative-actor") {
    env.placeRelativeActor({
      id: line.id ?? "script-actor",
      kind: line.kind ?? "slime",
      dx: number(line.dx),
      dy: number(line.dy),
      hp: line.hp,
      damage: line.damage,
    })
    return { type: "setup", command: line.command }
  }
  if (line.command === "add-item") {
    env.addItem(line.item ?? "Deploy nerve potion")
    return { type: "setup", command: line.command }
  }
  if (line.command === "set-stat") {
    if (!line.stat) throw new Error("set-stat requires stat")
    env.setStat(line.stat, number(line.value))
    return { type: "setup", command: line.command }
  }
  if (line.command === "set-gold") {
    env.setGold(number(line.value))
    return { type: "setup", command: line.command }
  }
  if (line.command === "set-hub-coins") {
    env.setHubCoins(number(line.value))
    return { type: "setup", command: line.command }
  }
  if (line.command === "add-xp") {
    env.addXp(number(line.value))
    return { type: "setup", command: line.command }
  }
  if (line.command === "set-hero-name") {
    env.setHeroName(line.name ?? "Mira")
    return { type: "setup", command: line.command }
  }
  if (line.command === "damage-player") {
    env.damagePlayer(number(line.damage ?? line.value))
    return { type: "setup", command: line.command }
  }
  if (line.command === "complete-tutorial") {
    env.completeTutorialAndReachFloor2()
    return { type: "setup", command: line.command }
  }
  if (line.command === "complete-first-clear") {
    env.completeFirstClear()
    return { type: "setup", command: line.command }
  }
  if (line.command === "login-local-test") {
    env.saveLocalTestAuth("password")
    return { type: "setup", command: line.command }
  }
  if (line.command === "login-expired-test") {
    env.saveExpiredTestAuth("password")
    return { type: "setup", command: line.command }
  }
  if (line.command === "render") return { type: "render", text: env.renderText() }

  throw new Error(`Unknown scenario command: ${line.command}`)
}

function assertScenario(observation: unknown, assertion: ScenarioAssertion, failures: string[], index: number) {
  const actual = valueAtPath(observation, assertion.path)
  const label = `line ${index + 1} assert ${assertion.path}`

  if ("equals" in assertion && !deepEqual(actual, assertion.equals)) {
    failures.push(`${label}: expected ${JSON.stringify(assertion.equals)}, got ${JSON.stringify(actual)}`)
  }
  if ("contains" in assertion) {
    const ok = Array.isArray(actual) ? actual.includes(assertion.contains) : String(actual).includes(String(assertion.contains))
    if (!ok) failures.push(`${label}: expected value to contain ${JSON.stringify(assertion.contains)}, got ${JSON.stringify(actual)}`)
  }
  if (typeof assertion.min === "number" && !(Number(actual) >= assertion.min)) {
    failures.push(`${label}: expected >= ${assertion.min}, got ${JSON.stringify(actual)}`)
  }
  if (typeof assertion.max === "number" && !(Number(actual) <= assertion.max)) {
    failures.push(`${label}: expected <= ${assertion.max}, got ${JSON.stringify(actual)}`)
  }
  if (assertion.truthy !== undefined && Boolean(actual) !== assertion.truthy) {
    failures.push(`${label}: expected truthy=${assertion.truthy}, got ${JSON.stringify(actual)}`)
  }
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce((current: unknown, part) => {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)]
    return (current as Record<string, unknown>)[part]
  }, value)
}

function deepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function number(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}
