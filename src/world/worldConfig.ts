import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { createRng } from "../game/rng.js"
import type { DungeonAnchor, Point } from "../game/dungeon.js"

export type WorldEventType = "interaction" | "enemy" | "loot" | "quest" | "boss" | "biome"
export type WorldEventStatus = "future" | "active" | "completed"
export type WorldEntityType = "npc" | "enemy" | "boss" | "loot" | "item"
export type WorldQuestStatus = "locked" | "active" | "completed"
export type WorldSpriteStatus = "planned" | "generated" | "sampled" | "failed"

export type WorldAnchor = {
  id: string
  floor: number
  roomIndex: number
  kind: "start" | "room" | "stairs"
  position: Point
  width: number
  height: number
  biome: string
}

export type WorldEntity = {
  id: string
  type: WorldEntityType
  name: string
  description: string
  anchorId: string
  spriteAssetId?: string
  tags: string[]
}

export type WorldEventTrigger = {
  kind: "seed" | "completed-events" | "kill-count" | "skill-check" | "quest-progress"
  value?: number
  tag?: string
}

export type WorldEvent = {
  id: string
  type: WorldEventType
  status: WorldEventStatus
  title: string
  summary: string
  anchorId: string
  entityIds: string[]
  trigger: WorldEventTrigger
  consequences: string[]
}

export type WorldQuest = {
  id: string
  title: string
  summary: string
  status: WorldQuestStatus
  objectiveEventIds: string[]
  rewardEntityIds: string[]
  triggerEventIds: string[]
}

export type WorldSpriteAsset = {
  id: string
  kind: WorldEntityType
  prompt: string
  model: string
  status: WorldSpriteStatus
  storagePath?: string
  sampledPath?: string
}

export type WorldConfig = {
  version: 1
  worldId: string
  seed: number
  generatedAt: string
  generation: number
  nextMilestoneAt: number
  anchors: WorldAnchor[]
  entities: WorldEntity[]
  events: WorldEvent[]
  quests: WorldQuest[]
  spriteAssets: WorldSpriteAsset[]
  memoryRefs: string[]
}

export type WorldLogEntry = {
  id: string
  worldId: string
  createdAt: string
  turn: number
  type: "world-created" | "event-completed" | "milestone-queued" | "admin-patch-applied" | "player-action"
  message: string
  eventId?: string
  metadata?: Record<string, string | number | boolean>
}

export type WorldContentPatch = {
  worldId: string
  generation: number
  events: WorldEvent[]
  quests: WorldQuest[]
  entities: WorldEntity[]
  spriteAssets: WorldSpriteAsset[]
  memoryRefs?: string[]
}

export const worldConfigJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "WorldConfig",
  type: "object",
  additionalProperties: false,
  required: ["version", "worldId", "seed", "generatedAt", "generation", "nextMilestoneAt", "anchors", "entities", "events", "quests", "spriteAssets", "memoryRefs"],
  properties: {
    version: { const: 1 },
    worldId: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" },
    seed: { type: "integer" },
    generatedAt: { type: "string" },
    generation: { type: "integer", minimum: 0 },
    nextMilestoneAt: { type: "integer", minimum: 1 },
    anchors: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "floor", "roomIndex", "kind", "position", "width", "height", "biome"],
        properties: {
          id: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" },
          floor: { type: "integer" },
          roomIndex: { type: "integer" },
          kind: { enum: ["start", "room", "stairs"] },
          position: { $ref: "#/$defs/point" },
          width: { type: "integer", minimum: 1 },
          height: { type: "integer", minimum: 1 },
          biome: { type: "string", minLength: 1 },
        },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "name", "description", "anchorId", "tags"],
        properties: {
          id: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" },
          type: { enum: ["npc", "enemy", "boss", "loot", "item"] },
          name: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          anchorId: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" },
          spriteAssetId: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "status", "title", "summary", "anchorId", "entityIds", "trigger", "consequences"],
        properties: {
          id: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" },
          type: { enum: ["interaction", "enemy", "loot", "quest", "boss", "biome"] },
          status: { enum: ["future", "active", "completed"] },
          title: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
          anchorId: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" },
          entityIds: { type: "array", items: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" } },
          trigger: { $ref: "#/$defs/trigger" },
          consequences: { type: "array", items: { type: "string" } },
        },
      },
    },
    quests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "summary", "status", "objectiveEventIds", "rewardEntityIds", "triggerEventIds"],
        properties: {
          id: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" },
          title: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
          status: { enum: ["locked", "active", "completed"] },
          objectiveEventIds: { type: "array", items: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" } },
          rewardEntityIds: { type: "array", items: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" } },
          triggerEventIds: { type: "array", items: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" } },
        },
      },
    },
    spriteAssets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "prompt", "model", "status"],
        properties: {
          id: { type: "string", pattern: "^[a-zA-Z0-9._:-]+$" },
          kind: { enum: ["npc", "enemy", "boss", "loot", "item"] },
          prompt: { type: "string", minLength: 1 },
          model: { type: "string", minLength: 1 },
          status: { enum: ["planned", "generated", "sampled", "failed"] },
          storagePath: { type: "string" },
          sampledPath: { type: "string" },
        },
      },
    },
    memoryRefs: { type: "array", items: { type: "string" } },
  },
  $defs: {
    point: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y"],
      properties: {
        x: { type: "integer" },
        y: { type: "integer" },
      },
    },
    trigger: {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: {
        kind: { enum: ["seed", "completed-events", "kill-count", "skill-check", "quest-progress"] },
        value: { type: "integer" },
        tag: { type: "string" },
      },
    },
  },
} as const

const eventTypes: WorldEventType[] = ["interaction", "enemy", "loot", "quest", "biome"]
const biomes = ["crypt", "moss vault", "iron shrine", "flooded archive", "ember jail"]
const questArchetypes = [
  {
    title: "Escort",
    summary: "Keep an NPC route safe across rooms and floors. Village outcome: safer co-op house routes and cartographer trust.",
    types: ["quest", "interaction", "biome", "quest"],
  },
  {
    title: "Rescue",
    summary: "Find a trapped villager or memory before the next floor claims it. Village outcome: wound-surgeon trust and a keepsake lead.",
    types: ["quest", "interaction", "loot", "quest"],
  },
  {
    title: "Timed Curse",
    summary: "Resolve cursed rooms quickly or accept a harsher floor modifier. Village outcome: curse warnings and safer preparation notes.",
    types: ["biome", "quest", "enemy", "loot"],
  },
  {
    title: "Shrine Repair",
    summary: "Recover shrine proof, keys, and relic fragments to repair a sealed reward. Village outcome: shrine blessings and final-gate clues.",
    types: ["loot", "quest", "interaction", "biome"],
  },
  {
    title: "Bounty",
    summary: "Hunt a named enemy chain and bring proof back to the village. Village outcome: guild trust, coins, and monster notes.",
    types: ["enemy", "enemy", "quest", "boss"],
  },
  {
    title: "Merchant Delivery",
    summary: "Carry goods between merchant, floor events, and village market. Village outcome: better price tests and shop reputation.",
    types: ["interaction", "loot", "quest", "loot"],
  },
  {
    title: "Final-Gate Keys",
    summary: "Assemble keys from people, relics, and fights before opening the road home. Village outcome: unlocks the next descent plan.",
    types: ["quest", "loot", "enemy", "boss"],
  },
] as const
const npcNames = ["Cartographer Venn", "Shrine Keeper Sol", "Wound Surgeon Iri", "Jailer Maro", "Ash Merchant Pell"]
const enemyNames = ["Grave Squire", "Rust Wisp", "Carrion Moth", "Crypt Mimic", "Root-Bound Ghoul"]
const lootNames = ["Moonlit Key", "Cinder Lens", "Archive Coin", "Bound Compass", "Quiet Relic"]

export function createInitialWorldConfig(seed: number, anchors: WorldAnchor[], eventCount = 50): WorldConfig {
  const rng = createRng(seed ^ 0xadc0ffee)
  const worldId = `world-${seed.toString(36)}`
  const safeAnchors = anchors.length ? anchors : fallbackAnchors()
  const events: WorldEvent[] = []
  const entities: WorldEntity[] = []
  const spriteAssets: WorldSpriteAsset[] = []

  for (let index = 0; index < eventCount; index++) {
    const anchor = safeAnchors[index % safeAnchors.length]
    const type = index === eventCount - 1 ? "boss" : eventTypes[index % eventTypes.length]
    const entityType = entityTypeForEvent(type)
    const name = entityName(entityType, rng.int(0, 999), index)
    const entityId = `entity-${index.toString().padStart(3, "0")}`
    const spriteAssetId = `sprite-${entityId}`
    entities.push({
      id: entityId,
      type: entityType,
      name,
      description: descriptionFor(entityType, name, anchor.biome),
      anchorId: anchor.id,
      spriteAssetId,
      tags: [type, anchor.biome.replace(/\s+/g, "-")],
    })
    spriteAssets.push({
      id: spriteAssetId,
      kind: entityType,
      prompt: spritePrompt(entityType, name, anchor.biome),
      model: "openai/gpt-image-2",
      status: "planned",
    })
    events.push({
      id: `event-${index.toString().padStart(3, "0")}`,
      type,
      status: index < 5 ? "active" : "future",
      title: eventTitle(type, name),
      summary: eventSummary(type, name, anchor),
      anchorId: anchor.id,
      entityIds: [entityId],
      trigger: index < 5 ? { kind: "seed", value: seed } : { kind: "completed-events", value: Math.max(1, index - 4) },
      consequences: [`Unlocks context for ${anchor.biome}.`],
    })
  }

  return {
    version: 1,
    worldId,
    seed,
    generatedAt: new Date(0).toISOString(),
    generation: 0,
    nextMilestoneAt: 20,
    anchors: safeAnchors,
    entities,
    events,
    quests: createInitialQuests(events, entities),
    spriteAssets,
    memoryRefs: [],
  }
}

export function worldAnchorsFromDungeonAnchors(anchors: DungeonAnchor[]): WorldAnchor[] {
  return anchors.map((anchor) => ({
    id: `f${anchor.floor}-${anchor.id}`,
    floor: anchor.floor,
    roomIndex: anchor.roomIndex,
    kind: anchor.kind,
    position: { ...anchor.position },
    width: anchor.width,
    height: anchor.height,
    biome: biomes[(anchor.floor + anchor.roomIndex) % biomes.length],
  }))
}

export function validateWorldConfig(config: unknown): string[] {
  const errors: string[] = []
  if (!config || typeof config !== "object") return ["World config must be an object."]
  const world = config as Partial<WorldConfig>
  if (world.version !== 1) errors.push("World config version must be 1.")
  if (!isSafeId(world.worldId)) errors.push("World id is invalid.")
  if (!Number.isInteger(world.seed)) errors.push("World seed must be an integer.")
  if (!Array.isArray(world.anchors) || world.anchors.length === 0) errors.push("World must include at least one anchor.")
  if (!Array.isArray(world.events)) errors.push("World events must be an array.")
  if (!Array.isArray(world.entities)) errors.push("World entities must be an array.")
  if (!Array.isArray(world.quests)) errors.push("World quests must be an array.")
  if (!Array.isArray(world.spriteAssets)) errors.push("World sprite assets must be an array.")

  const anchorIds = new Set<string>()
  for (const anchor of world.anchors ?? []) {
    if (!isAnchor(anchor)) errors.push("Invalid world anchor.")
    else if (anchorIds.has(anchor.id)) errors.push(`Duplicate anchor id: ${anchor.id}`)
    else anchorIds.add(anchor.id)
  }

  const entityIds = new Set<string>()
  for (const entity of world.entities ?? []) {
    if (!isEntity(entity)) errors.push("Invalid world entity.")
    else {
      if (entityIds.has(entity.id)) errors.push(`Duplicate entity id: ${entity.id}`)
      entityIds.add(entity.id)
      if (!anchorIds.has(entity.anchorId)) errors.push(`Entity ${entity.id} references missing anchor ${entity.anchorId}.`)
    }
  }

  const spriteIds = new Set<string>()
  for (const sprite of world.spriteAssets ?? []) {
    if (!isSprite(sprite)) errors.push("Invalid world sprite asset.")
    else if (spriteIds.has(sprite.id)) errors.push(`Duplicate sprite asset id: ${sprite.id}`)
    else spriteIds.add(sprite.id)
  }

  const eventIds = new Set<string>()
  for (const event of world.events ?? []) {
    if (!isEvent(event)) errors.push("Invalid world event.")
    else {
      if (eventIds.has(event.id)) errors.push(`Duplicate event id: ${event.id}`)
      eventIds.add(event.id)
      if (!anchorIds.has(event.anchorId)) errors.push(`Event ${event.id} references missing anchor ${event.anchorId}.`)
      for (const entityId of event.entityIds) {
        if (!entityIds.has(entityId)) errors.push(`Event ${event.id} references missing entity ${entityId}.`)
      }
    }
  }

  for (const quest of world.quests ?? []) {
    if (!isQuest(quest)) errors.push("Invalid world quest.")
    else {
      for (const eventId of [...quest.objectiveEventIds, ...quest.triggerEventIds]) {
        if (!eventIds.has(eventId)) errors.push(`Quest ${quest.id} references missing event ${eventId}.`)
      }
      for (const entityId of quest.rewardEntityIds) {
        if (!entityIds.has(entityId)) errors.push(`Quest ${quest.id} references missing entity ${entityId}.`)
      }
    }
  }

  return errors
}

export function applyWorldContentPatch(world: WorldConfig, patch: WorldContentPatch): WorldConfig {
  if (patch.worldId !== world.worldId) throw new Error(`Patch world mismatch: ${patch.worldId}`)
  const next: WorldConfig = {
    ...world,
    generation: Math.max(world.generation + 1, patch.generation),
    entities: mergeById(world.entities, patch.entities),
    events: mergeById(world.events, patch.events),
    quests: mergeById(world.quests, patch.quests),
    spriteAssets: mergeById(world.spriteAssets, patch.spriteAssets),
    memoryRefs: [...new Set([...world.memoryRefs, ...(patch.memoryRefs ?? [])])],
  }
  const errors = validateWorldConfig(next)
  if (errors.length) throw new Error(`Invalid world patch: ${errors.join(" ")}`)
  return next
}

export function completeFirstMatchingWorldEvent(world: WorldConfig, type: WorldEventType, anchorId?: string) {
  const event = world.events.find((candidate) => candidate.status !== "completed" && candidate.type === type && (!anchorId || candidate.anchorId === anchorId))
  if (!event) return null
  event.status = "completed"
  activateFutureEvents(world)
  return event
}

function worldConfigDirectory() {
  return process.env.OPENDUNGEON_WORLD_DIR || (process.env.OPENDUNGEON_SAVE_DIR ? join(process.env.OPENDUNGEON_SAVE_DIR, "..", "worlds") : join(homedir(), ".opendungeon", "worlds"))
}

export function worldBundleDirectory(worldId: string) {
  return join(worldConfigDirectory(), safeFileId(worldId))
}

export function writeWorldConfig(config: WorldConfig) {
  const errors = validateWorldConfig(config)
  if (errors.length) throw new Error(`Invalid world config: ${errors.join(" ")}`)
  mkdirSync(worldBundleDirectory(config.worldId), { recursive: true })
  writeFileSync(join(worldBundleDirectory(config.worldId), "world.config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

export function readWorldConfig(worldId: string): WorldConfig {
  const parsed = JSON.parse(readFileSync(join(worldBundleDirectory(worldId), "world.config.json"), "utf8")) as unknown
  const errors = validateWorldConfig(parsed)
  if (errors.length) throw new Error(`Invalid world config: ${errors.join(" ")}`)
  return parsed as WorldConfig
}

export function writeWorldLog(worldId: string, entries: WorldLogEntry[]) {
  mkdirSync(worldBundleDirectory(worldId), { recursive: true })
  const text = entries.map((entry) => JSON.stringify(entry)).join("\n")
  writeFileSync(join(worldBundleDirectory(worldId), "world.log.ndjson"), text ? `${text}\n` : "", "utf8")
}

export function createWorldLogEntry(worldId: string, turn: number, entry: Omit<WorldLogEntry, "id" | "worldId" | "createdAt" | "turn">): WorldLogEntry {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    worldId,
    createdAt: new Date().toISOString(),
    turn,
    ...entry,
  }
}

function createInitialQuests(events: WorldEvent[], entities: WorldEntity[]): WorldQuest[] {
  const quests: WorldQuest[] = []
  for (let index = 0; index < questArchetypes.length; index++) {
    const archetype = questArchetypes[index]
    const objectiveEventIds = questObjectiveEventIds(events, index, archetype.types)
    const rewardEntityIds = questRewardEntityIds(events, entities, objectiveEventIds)
    const route = questRouteLabel(events, objectiveEventIds)
    const previousTrigger = quests[index - 1]?.objectiveEventIds.at(-1)
    quests.push({
      id: `quest-${index.toString().padStart(2, "0")}`,
      title: `${archetype.title}: ${route}`,
      summary: archetype.summary,
      status: index === 0 ? "active" : "locked",
      objectiveEventIds,
      rewardEntityIds,
      triggerEventIds: index === 0 ? objectiveEventIds.slice(0, 1) : previousTrigger ? [previousTrigger] : objectiveEventIds.slice(0, 1),
    })
  }
  return quests
}

function questObjectiveEventIds(events: WorldEvent[], questIndex: number, preferredTypes: readonly WorldEventType[]) {
  const floors = [...new Set(events.map((event) => floorFromAnchorId(event.anchorId)))].filter((floor) => floor > 0).sort((left, right) => left - right)
  const selected: WorldEvent[] = []
  const floorOrder = floors.length ? floors : [0]
  for (let step = 0; step < Math.min(4, Math.max(3, floorOrder.length)); step++) {
    const floor = floorOrder[(questIndex + step) % floorOrder.length] ?? 0
    const type = preferredTypes[step % preferredTypes.length] ?? "quest"
    const candidates = events.filter((event) => (floor ? floorFromAnchorId(event.anchorId) === floor : true) && event.type === type)
    const fallback = events.filter((event) => (floor ? floorFromAnchorId(event.anchorId) === floor : true))
    const pool = candidates.length ? candidates : fallback.length ? fallback : events
    const event = pool[(questIndex + step) % Math.max(1, pool.length)]
    if (event && !selected.some((candidate) => candidate.id === event.id)) selected.push(event)
  }
  const preferredFallback = events.filter((event) => preferredTypes.includes(event.type))
  for (const event of [...preferredFallback, ...events]) {
    if (selected.length >= 4) break
    if (!selected.some((candidate) => candidate.id === event.id)) selected.push(event)
  }
  return selected.slice(0, 4).map((event) => event.id)
}

function questRewardEntityIds(events: WorldEvent[], entities: WorldEntity[], objectiveEventIds: string[]) {
  const ids = objectiveEventIds.flatMap((eventId) => events.find((event) => event.id === eventId)?.entityIds ?? [])
  const known = new Set(entities.map((entity) => entity.id))
  return [...new Set(ids.filter((id) => known.has(id)))].slice(-2)
}

function questRouteLabel(events: WorldEvent[], objectiveEventIds: string[]) {
  const floors = [...new Set(objectiveEventIds.map((eventId) => floorFromAnchorId(events.find((event) => event.id === eventId)?.anchorId ?? "")))].filter((floor) => floor > 0)
  if (!floors.length) return "unmapped route"
  const min = Math.min(...floors)
  const max = Math.max(...floors)
  return min === max ? `Floor ${min}` : `Floors ${min}-${max}`
}

function floorFromAnchorId(anchorId: string) {
  return Number(anchorId.match(/^f(\d+)-/)?.[1] ?? 0)
}

function activateFutureEvents(world: WorldConfig) {
  const completed = world.events.filter((event) => event.status === "completed").length
  for (const event of world.events) {
    if (event.status === "future" && event.trigger.kind === "completed-events" && (event.trigger.value ?? 0) <= completed) event.status = "active"
  }
  for (const quest of world.quests) {
    if (quest.status === "locked" && quest.triggerEventIds.every((eventId) => world.events.find((event) => event.id === eventId)?.status === "completed")) {
      quest.status = "active"
    }
    if (quest.status === "active" && quest.objectiveEventIds.every((eventId) => world.events.find((event) => event.id === eventId)?.status === "completed")) {
      quest.status = "completed"
    }
  }
}

function entityTypeForEvent(type: WorldEventType): WorldEntityType {
  if (type === "boss") return "boss"
  if (type === "enemy") return "enemy"
  if (type === "loot") return "loot"
  if (type === "quest") return "npc"
  return "npc"
}

function entityName(type: WorldEntityType, salt: number, index: number) {
  if (type === "enemy") return enemyNames[(salt + index) % enemyNames.length]
  if (type === "boss") return "Goblin King of the Broken Gate"
  if (type === "loot" || type === "item") return lootNames[(salt + index) % lootNames.length]
  return npcNames[(salt + index) % npcNames.length]
}

function descriptionFor(type: WorldEntityType, name: string, biome: string) {
  if (type === "boss") return `${name} commands the anger gathered in the ${biome}.`
  if (type === "enemy") return `${name} patrols the ${biome} and remembers crawler violence.`
  if (type === "loot" || type === "item") return `${name} is a strange reward hidden in the ${biome}.`
  return `${name} carries a rumor about the ${biome}.`
}

function eventTitle(type: WorldEventType, name: string) {
  if (type === "boss") return `${name} answers the crawl`
  if (type === "enemy") return `${name} blocks the room`
  if (type === "loot") return `${name} waits in a cache`
  if (type === "quest") return `${name} asks for proof`
  if (type === "biome") return "The room changes its weather"
  return `${name} has something to say`
}

function eventSummary(type: WorldEventType, name: string, anchor: WorldAnchor) {
  return `${type} event for ${name} at floor ${anchor.floor}, room ${anchor.roomIndex}, inside the ${anchor.biome}.`
}

function spritePrompt(type: WorldEntityType, name: string, biome: string) {
  return `Pixel art sprite sheet, transparent background, terminal roguelike ${type}, ${name}, ${biome}, readable silhouette, 4 directions, no text.`
}

function fallbackAnchors(): WorldAnchor[] {
  return [
    {
      id: "f1-start",
      floor: 1,
      roomIndex: 0,
      kind: "start",
      position: { x: 8, y: 8 },
      width: 12,
      height: 8,
      biome: "crypt",
    },
  ]
}

function mergeById<T extends { id: string }>(base: T[], incoming: T[]) {
  const merged = new Map(base.map((item) => [item.id, item]))
  for (const item of incoming) merged.set(item.id, item)
  return [...merged.values()]
}

function isAnchor(value: unknown): value is WorldAnchor {
  const anchor = value as WorldAnchor
  return (
    Boolean(anchor) &&
    isSafeId(anchor.id) &&
    Number.isInteger(anchor.floor) &&
    Number.isInteger(anchor.roomIndex) &&
    (anchor.kind === "start" || anchor.kind === "room" || anchor.kind === "stairs") &&
    isPoint(anchor.position) &&
    Number.isInteger(anchor.width) &&
    Number.isInteger(anchor.height) &&
    typeof anchor.biome === "string" &&
    anchor.biome.length > 0
  )
}

function isEntity(value: unknown): value is WorldEntity {
  const entity = value as WorldEntity
  return (
    Boolean(entity) &&
    isSafeId(entity.id) &&
    (entity.type === "npc" || entity.type === "enemy" || entity.type === "boss" || entity.type === "loot" || entity.type === "item") &&
    typeof entity.name === "string" &&
    entity.name.length > 0 &&
    typeof entity.description === "string" &&
    entity.description.length > 0 &&
    isSafeId(entity.anchorId) &&
    Array.isArray(entity.tags) &&
    entity.tags.every((tag) => typeof tag === "string")
  )
}

function isEvent(value: unknown): value is WorldEvent {
  const event = value as WorldEvent
  return (
    Boolean(event) &&
    isSafeId(event.id) &&
    (event.type === "interaction" || event.type === "enemy" || event.type === "loot" || event.type === "quest" || event.type === "boss" || event.type === "biome") &&
    (event.status === "future" || event.status === "active" || event.status === "completed") &&
    typeof event.title === "string" &&
    event.title.length > 0 &&
    typeof event.summary === "string" &&
    event.summary.length > 0 &&
    isSafeId(event.anchorId) &&
    Array.isArray(event.entityIds) &&
    event.entityIds.every(isSafeId) &&
    isTrigger(event.trigger) &&
    Array.isArray(event.consequences)
  )
}

function isTrigger(value: unknown): value is WorldEventTrigger {
  const trigger = value as WorldEventTrigger
  return (
    Boolean(trigger) &&
    (trigger.kind === "seed" || trigger.kind === "completed-events" || trigger.kind === "kill-count" || trigger.kind === "skill-check" || trigger.kind === "quest-progress") &&
    (trigger.value === undefined || Number.isInteger(trigger.value)) &&
    (trigger.tag === undefined || typeof trigger.tag === "string")
  )
}

function isQuest(value: unknown): value is WorldQuest {
  const quest = value as WorldQuest
  return (
    Boolean(quest) &&
    isSafeId(quest.id) &&
    typeof quest.title === "string" &&
    quest.title.length > 0 &&
    typeof quest.summary === "string" &&
    quest.summary.length > 0 &&
    (quest.status === "locked" || quest.status === "active" || quest.status === "completed") &&
    Array.isArray(quest.objectiveEventIds) &&
    quest.objectiveEventIds.every(isSafeId) &&
    Array.isArray(quest.rewardEntityIds) &&
    quest.rewardEntityIds.every(isSafeId) &&
    Array.isArray(quest.triggerEventIds) &&
    quest.triggerEventIds.every(isSafeId)
  )
}

function isSprite(value: unknown): value is WorldSpriteAsset {
  const sprite = value as WorldSpriteAsset
  return (
    Boolean(sprite) &&
    isSafeId(sprite.id) &&
    (sprite.kind === "npc" || sprite.kind === "enemy" || sprite.kind === "boss" || sprite.kind === "loot" || sprite.kind === "item") &&
    typeof sprite.prompt === "string" &&
    sprite.prompt.length > 0 &&
    typeof sprite.model === "string" &&
    sprite.model.length > 0 &&
    (sprite.status === "planned" || sprite.status === "generated" || sprite.status === "sampled" || sprite.status === "failed")
  )
}

function isPoint(value: unknown): value is Point {
  const point = value as Point
  return Boolean(point) && Number.isInteger(point.x) && Number.isInteger(point.y)
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9._:-]+$/.test(value)
}

function safeFileId(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "")
  if (!safe) throw new Error("Invalid world id")
  return safe
}
