import { createRng } from "../game/rng.js"
import { loadSpriteGenerationSkill, spriteGenerationSkillAssetPath } from "../assets/spriteGenerationSkill.js"
import { applyWorldContentPatch, type WorldConfig, type WorldContentPatch, type WorldEntity, type WorldEntityType, type WorldEvent, type WorldEventStatus, type WorldEventType, type WorldQuest, type WorldQuestStatus, type WorldSpriteAsset, type WorldSpriteStatus } from "./worldConfig.js"

export type AdminGenerationRequest = {
  worldId: string
  seed: number
  completedEventCount: number
  generation: number
  playerSummary: string
}

export type AdminPatchModelRequest = {
  model: string
  system: string
  prompt: string
  temperature: number
  maxTokens: number
}

const eventTypeValues: WorldEventType[] = ["interaction", "enemy", "loot", "quest", "boss", "biome"]
const entityTypeValues: WorldEntityType[] = ["npc", "enemy", "boss", "loot", "item"]
const eventStatusValues: WorldEventStatus[] = ["future", "active", "completed"]
const questStatusValues: WorldQuestStatus[] = ["locked", "active", "completed"]
const spriteStatusValues: WorldSpriteStatus[] = ["planned", "generated", "sampled", "failed"]

export function createAdminGenerationRequest(world: WorldConfig, playerSummary: string): AdminGenerationRequest {
  return {
    worldId: world.worldId,
    seed: world.seed,
    completedEventCount: world.events.filter((event) => event.status === "completed").length,
    generation: world.generation + 1,
    playerSummary,
  }
}

export function createAdminPatchModelRequest(world: WorldConfig, request: AdminGenerationRequest): AdminPatchModelRequest {
  const anchorBudget = 40
  const context = {
    task: "Generate a WorldContentPatch for opendungeon. Return only one JSON object and no prose.",
    requiredPatchShape: ["worldId", "generation", "events", "quests", "entities", "spriteAssets", "memoryRefs"],
    constraints: [
      "worldId must exactly match the input worldId.",
      "generation must exactly match the requested generation.",
      "Use only anchor ids listed in anchors.",
      "Do not reuse existing ids.",
      "Every event entityId must reference either an existing entity or an entity in this patch.",
      "Every quest event/entity reference must point to an existing id or an id in this patch.",
      "Prefer 6 to 12 events, 2 to 4 quests, and a planned sprite asset for each new entity.",
      "The patch may remix local story arcs, village trust outcomes, boss motives, and alternate endings, but must keep cause and effect readable.",
      "Keep text short, game-facing, and safe for terminal display.",
    ],
    enums: {
      eventTypes: eventTypeValues,
      eventStatuses: eventStatusValues,
      entityTypes: entityTypeValues,
      questStatuses: questStatusValues,
      spriteStatuses: spriteStatusValues,
    },
    request,
    anchors: world.anchors.slice(0, anchorBudget).map((anchor) => ({
      id: anchor.id,
      floor: anchor.floor,
      roomIndex: anchor.roomIndex,
      kind: anchor.kind,
      biome: anchor.biome,
    })),
    activeEvents: world.events
      .filter((event) => event.status === "active")
      .slice(0, 12)
      .map((event) => ({ id: event.id, type: event.type, title: event.title, anchorId: event.anchorId })),
    recentlyCompletedEvents: world.events
      .filter((event) => event.status === "completed")
      .slice(-12)
      .map((event) => ({ id: event.id, type: event.type, title: event.title, anchorId: event.anchorId })),
    idPrefix: `admin-${request.generation}`,
    spriteGenerationSkill: {
      source: `assets/${spriteGenerationSkillAssetPath}`,
      instructions: loadSpriteGenerationSkill(),
    },
    existingIds: {
      entities: world.entities.map((entity) => entity.id).slice(-80),
      events: world.events.map((event) => event.id).slice(-80),
      quests: world.quests.map((quest) => quest.id).slice(-40),
      spriteAssets: world.spriteAssets.map((asset) => asset.id).slice(-80),
    },
  }

  return {
    model: process.env.OPENDUNGEON_AI_ADMIN_MODEL || "openai/gpt-5.4",
    system:
      "You are the opendungeon AI admin content model. Produce strict JSON for a validated roguelike WorldContentPatch. Use the embedded spriteGenerationSkill when writing every spriteAssets prompt. Do not include markdown, commentary, or tool-call text.",
    prompt: JSON.stringify(context, null, 2),
    temperature: 0.2,
    maxTokens: 6000,
  }
}

export function normalizeAdminModelPatch(world: WorldConfig, request: AdminGenerationRequest, rawPatch: unknown): WorldContentPatch {
  const input = objectRecord(rawPatch, "AI admin model patch")
  const worldId = safeId(input.worldId, "worldId")
  if (worldId !== world.worldId) throw new Error(`AI admin model returned patch for ${worldId}, expected ${world.worldId}.`)
  const generation = integer(input.generation, "generation")
  if (generation !== request.generation) throw new Error(`AI admin model returned generation ${generation}, expected ${request.generation}.`)

  const anchorIds = new Set(world.anchors.map((anchor) => anchor.id))
  const entityIds = new Set(world.entities.map((entity) => entity.id))
  const spriteIds = new Set(world.spriteAssets.map((sprite) => sprite.id))
  const eventIds = new Set(world.events.map((event) => event.id))
  const questIds = new Set(world.quests.map((quest) => quest.id))

  const entities = arrayInput(input.entities, "entities").map((value, index) => {
    const entity = objectRecord(value, `entities[${index}]`)
    const id = newPatchId(entity.id, `entities[${index}].id`, entityIds)
    const anchorId = anchorReference(entity.anchorId, `entities[${index}].anchorId`, anchorIds)
    const normalized: WorldEntity = {
      id,
      type: enumValue(entity.type, entityTypeValues, `entities[${index}].type`),
      name: text(entity.name, `entities[${index}].name`, 80),
      description: text(entity.description, `entities[${index}].description`, 240),
      anchorId,
      tags: textArray(entity.tags, `entities[${index}].tags`, false, ["ai-admin", `generation-${request.generation}`]),
    }
    const spriteAssetId = optionalSafeId(entity.spriteAssetId, `entities[${index}].spriteAssetId`)
    if (spriteAssetId) normalized.spriteAssetId = spriteAssetId
    entityIds.add(id)
    return normalized
  })

  const spriteAssets = arrayInput(input.spriteAssets, "spriteAssets").map((value, index) => {
    const sprite = objectRecord(value, `spriteAssets[${index}]`)
    const id = newPatchId(sprite.id, `spriteAssets[${index}].id`, spriteIds)
    const normalized: WorldSpriteAsset = {
      id,
      kind: enumValue(sprite.kind, entityTypeValues, `spriteAssets[${index}].kind`),
      prompt: text(sprite.prompt, `spriteAssets[${index}].prompt`, 500),
      model: text(sprite.model ?? "openai/gpt-image-2", `spriteAssets[${index}].model`, 80),
      status: enumValue(sprite.status ?? "planned", spriteStatusValues, `spriteAssets[${index}].status`),
    }
    const storagePath = optionalText(sprite.storagePath, `spriteAssets[${index}].storagePath`, 240)
    const sampledPath = optionalText(sprite.sampledPath, `spriteAssets[${index}].sampledPath`, 240)
    if (storagePath) normalized.storagePath = storagePath
    if (sampledPath) normalized.sampledPath = sampledPath
    spriteIds.add(id)
    return normalized
  })

  const events = arrayInput(input.events, "events").map((value, index) => {
    const event = objectRecord(value, `events[${index}]`)
    const id = newPatchId(event.id, `events[${index}].id`, eventIds)
    const normalized: WorldEvent = {
      id,
      type: enumValue(event.type, eventTypeValues, `events[${index}].type`),
      status: enumValue(event.status, eventStatusValues, `events[${index}].status`),
      title: text(event.title, `events[${index}].title`, 100),
      summary: text(event.summary, `events[${index}].summary`, 260),
      anchorId: anchorReference(event.anchorId, `events[${index}].anchorId`, anchorIds),
      entityIds: textArray(event.entityIds, `events[${index}].entityIds`, true).map((id) => entityReference(id, `events[${index}].entityIds`, entityIds)),
      trigger: trigger(event.trigger, `events[${index}].trigger`),
      consequences: textArray(event.consequences, `events[${index}].consequences`, true),
    }
    eventIds.add(id)
    return normalized
  })

  const quests = arrayInput(input.quests, "quests").map((value, index) => {
    const quest = objectRecord(value, `quests[${index}]`)
    const id = newPatchId(quest.id, `quests[${index}].id`, questIds)
    const normalized: WorldQuest = {
      id,
      title: text(quest.title, `quests[${index}].title`, 100),
      summary: text(quest.summary, `quests[${index}].summary`, 260),
      status: enumValue(quest.status, questStatusValues, `quests[${index}].status`),
      objectiveEventIds: textArray(quest.objectiveEventIds, `quests[${index}].objectiveEventIds`, true).map((id) => eventReference(id, `quests[${index}].objectiveEventIds`, eventIds)),
      rewardEntityIds: textArray(quest.rewardEntityIds, `quests[${index}].rewardEntityIds`, false).map((id) => entityReference(id, `quests[${index}].rewardEntityIds`, entityIds)),
      triggerEventIds: textArray(quest.triggerEventIds, `quests[${index}].triggerEventIds`, false).map((id) => eventReference(id, `quests[${index}].triggerEventIds`, eventIds)),
    }
    questIds.add(id)
    return normalized
  })

  if (!entities.length || !events.length) throw new Error("AI admin model patch must include at least one entity and one event.")
  const patch: WorldContentPatch = {
    worldId,
    generation,
    entities,
    events,
    quests,
    spriteAssets,
    memoryRefs: textArray(input.memoryRefs, "memoryRefs", false, [`memory-${world.worldId}-${request.generation}`]),
  }
  applyWorldContentPatch(world, patch)
  return patch
}

export function createProceduralAdminPatch(world: WorldConfig, request: AdminGenerationRequest, count = 50): WorldContentPatch {
  const rng = createRng(world.seed + request.generation * 8191 + request.completedEventCount * 131)
  const anchors = world.anchors.length ? world.anchors : []
  const entities: WorldEntity[] = []
  const events: WorldEvent[] = []
  const quests: WorldQuest[] = []
  const spriteAssets: WorldSpriteAsset[] = []
  const baseIndex = world.events.length
  const angryBoss = request.playerSummary.toLowerCase().includes("goblin") || request.completedEventCount >= 20

  for (let offset = 0; offset < count; offset++) {
    const index = baseIndex + offset
    const anchor = anchors[index % Math.max(1, anchors.length)]
    const entityId = `entity-${index.toString().padStart(3, "0")}`
    const spriteAssetId = `sprite-${entityId}`
    const bossSlot = offset === count - 1
    const villageSlot = offset % 11 === 0
    const type = bossSlot ? "boss" : villageSlot ? "quest" : offset % 5 === 0 ? "quest" : offset % 3 === 0 ? "enemy" : offset % 3 === 1 ? "loot" : "interaction"
    const name = bossSlot && angryBoss ? "Goblin Bannerlord Rek" : generatedName(type, rng.int(0, 99), request.generation)
    entities.push({
      id: entityId,
      type: type === "boss" ? "boss" : type === "enemy" ? "enemy" : type === "loot" ? "loot" : "npc",
      name,
      description: `${name} was created by the AI admin from player history: ${request.playerSummary.slice(0, 120) || "early crawl"}.${villageSlot ? " It can alter village trust, services, or route endings." : ""}`,
      anchorId: anchor.id,
      spriteAssetId,
      tags: ["ai-admin", type, `generation-${request.generation}`],
    })
    spriteAssets.push({
      id: spriteAssetId,
      kind: type === "boss" ? "boss" : type === "enemy" ? "enemy" : type === "loot" ? "loot" : "npc",
      prompt: `Pixel art terminal RPG ${type}, ${name}, generated from player history, transparent background, no text.`,
      model: "openai/gpt-image-2",
      status: "planned",
    })
    events.push({
      id: `event-${index.toString().padStart(3, "0")}`,
      type,
      status: offset < 5 ? "active" : "future",
      title: bossSlot && angryBoss ? "The goblin leader answers the slaughter" : villageSlot ? `${name} changes the village road` : `${name} changes the dungeon`,
      summary: bossSlot ? `AI-admin generation ${request.generation} can alter the boss motive and ending.` : villageSlot ? `AI-admin generation ${request.generation} village arc at floor ${anchor.floor}, room ${anchor.roomIndex}.` : `AI-admin generation ${request.generation} event at floor ${anchor.floor}, room ${anchor.roomIndex}.`,
      anchorId: anchor.id,
      entityIds: [entityId],
      trigger: offset < 5 ? { kind: "completed-events", value: request.completedEventCount } : { kind: "completed-events", value: request.completedEventCount + offset },
      consequences: villageSlot ? ["Adds adaptive village trust or hub outcome.", "May branch a later ending."] : bossSlot ? ["Adds adaptive boss motive.", "May branch the ending."] : ["Adds adaptive world state."],
    })
  }

  for (let questIndex = 0; questIndex < 5; questIndex++) {
    const questEvents = events.slice(questIndex * 5, questIndex * 5 + 4)
    quests.push({
      id: `quest-admin-${request.generation}-${questIndex}`,
      title: questIndex === 0 && angryBoss ? "Bannerlord's Anger" : questIndex === 1 ? `Village Remix ${request.generation}` : questIndex === 4 ? `Alternate Ending ${request.generation}` : `Admin Thread ${request.generation}.${questIndex}`,
      summary: questIndex === 1 ? `AI Admin village story arc generated from ${request.completedEventCount} completed events.` : questIndex === 4 ? `AI Admin alternate ending hook generated from local run history.` : `Quest generated from ${request.completedEventCount} completed events.`,
      status: questIndex === 0 ? "active" : "locked",
      objectiveEventIds: questEvents.map((event) => event.id),
      rewardEntityIds: events.slice(questIndex * 5 + 4, questIndex * 5 + 5).flatMap((event) => event.entityIds),
      triggerEventIds: questEvents.slice(0, 1).map((event) => event.id),
    })
  }

  return {
    worldId: world.worldId,
    generation: request.generation,
    events,
    quests,
    entities,
    spriteAssets,
    memoryRefs: [`memory-${world.worldId}-${request.generation}`, `ending-${world.worldId}-${request.generation}`, `village-${world.worldId}-${request.generation}`],
  }
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function arrayInput(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`)
  return value
}

function integer(value: unknown, label: string): number {
  const number = Number(value)
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer.`)
  return number
}

function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`)
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} cannot be empty.`)
  return trimmed.slice(0, maxLength)
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  return text(value, label, maxLength)
}

function textArray(value: unknown, label: string, required: boolean, fallback: string[] = []): string[] {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${label} must be an array.`)
    return fallback
  }
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`)
  if (required && value.length === 0) throw new Error(`${label} cannot be empty.`)
  return value.map((entry, index) => text(entry, `${label}[${index}]`, 160))
}

function safeId(value: unknown, label: string): string {
  const id = text(value, label, 120)
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) throw new Error(`${label} is not a safe id.`)
  return id
}

function optionalSafeId(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  return safeId(value, label)
}

function newPatchId(value: unknown, label: string, used: Set<string>): string {
  const id = safeId(value, label)
  if (used.has(id)) throw new Error(`${label} reuses existing id ${id}.`)
  return id
}

function anchorReference(value: unknown, label: string, anchorIds: Set<string>): string {
  const id = safeId(value, label)
  if (!anchorIds.has(id)) throw new Error(`${label} references missing anchor ${id}.`)
  return id
}

function entityReference(id: string, label: string, entityIds: Set<string>): string {
  if (!entityIds.has(id)) throw new Error(`${label} references missing entity ${id}.`)
  return id
}

function eventReference(id: string, label: string, eventIds: Set<string>): string {
  if (!eventIds.has(id)) throw new Error(`${label} references missing event ${id}.`)
  return id
}

function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${label} must be one of ${values.join(", ")}.`)
  return value as T
}

function trigger(value: unknown, label: string): WorldEvent["trigger"] {
  const input = objectRecord(value, label)
  const kind = enumValue(input.kind, ["seed", "completed-events", "kill-count", "skill-check", "quest-progress"] as const, `${label}.kind`)
  const result: WorldEvent["trigger"] = { kind }
  if (input.value !== undefined) result.value = integer(input.value, `${label}.value`)
  if (input.tag !== undefined) result.tag = text(input.tag, `${label}.tag`, 80)
  return result
}

function generatedName(type: string, salt: number, generation: number) {
  const roots = type === "enemy" ? ["Ash Ghoul", "Gate Wisp", "Bone Squire"] : type === "loot" ? ["Weathered Charm", "Rift Key", "Oath Coin"] : ["Hollow Witness", "Map-Maker", "Quiet Oracle"]
  return `${roots[salt % roots.length]} ${generation}`
}
