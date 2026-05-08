import { readFileSync } from "node:fs"
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
    | "set-hero-name"
    | "damage-player"
    | "login-local-test"
    | "render"
  assert?: ScenarioAssertion
  dx?: number
  dy?: number
  tile?: TileId
  id?: string
  kind?: "slime" | "ghoul" | "necromancer"
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
      { assert: { path: "session.inventory", contains: "Rope arrow" } },
      { assert: { path: "session.inventory.length", min: 3 } },
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
      { command: "login-local-test" },
      { assert: { path: "auth.loggedIn", equals: true } },
      { assert: { path: "auth.username", equals: "test" } },
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
  if (line.command === "set-hero-name") {
    env.setHeroName(line.name ?? "Mira")
    return { type: "setup", command: line.command }
  }
  if (line.command === "damage-player") {
    env.damagePlayer(number(line.damage ?? line.value))
    return { type: "setup", command: line.command }
  }
  if (line.command === "login-local-test") {
    env.saveLocalTestAuth("password")
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
