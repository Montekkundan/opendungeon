import { createRng } from "../game/rng.js"
import type { WorldConfig, WorldContentPatch, WorldEntity, WorldEvent, WorldQuest, WorldSpriteAsset } from "./worldConfig.js"

export type AdminGenerationRequest = {
  worldId: string
  seed: number
  completedEventCount: number
  generation: number
  playerSummary: string
}

export function createAdminGenerationRequest(world: WorldConfig, playerSummary: string): AdminGenerationRequest {
  return {
    worldId: world.worldId,
    seed: world.seed,
    completedEventCount: world.events.filter((event) => event.status === "completed").length,
    generation: world.generation + 1,
    playerSummary,
  }
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
    const type = bossSlot ? "boss" : offset % 5 === 0 ? "quest" : offset % 3 === 0 ? "enemy" : offset % 3 === 1 ? "loot" : "interaction"
    const name = bossSlot && angryBoss ? "Goblin Bannerlord Rek" : generatedName(type, rng.int(0, 99), request.generation)
    entities.push({
      id: entityId,
      type: type === "boss" ? "boss" : type === "enemy" ? "enemy" : type === "loot" ? "loot" : "npc",
      name,
      description: `${name} was created by the AI admin from player history: ${request.playerSummary.slice(0, 120) || "early crawl"}.`,
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
      title: bossSlot && angryBoss ? "The goblin leader answers the slaughter" : `${name} changes the dungeon`,
      summary: `AI-admin generation ${request.generation} event at floor ${anchor.floor}, room ${anchor.roomIndex}.`,
      anchorId: anchor.id,
      entityIds: [entityId],
      trigger: offset < 5 ? { kind: "completed-events", value: request.completedEventCount } : { kind: "completed-events", value: request.completedEventCount + offset },
      consequences: ["Adds adaptive world state."],
    })
  }

  for (let questIndex = 0; questIndex < 5; questIndex++) {
    const questEvents = events.slice(questIndex * 5, questIndex * 5 + 4)
    quests.push({
      id: `quest-admin-${request.generation}-${questIndex}`,
      title: questIndex === 0 && angryBoss ? "Bannerlord's Anger" : `Admin Thread ${request.generation}.${questIndex}`,
      summary: `Quest generated from ${request.completedEventCount} completed events.`,
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
    memoryRefs: [`memory-${world.worldId}-${request.generation}`],
  }
}

function generatedName(type: string, salt: number, generation: number) {
  const roots = type === "enemy" ? ["Ash Ghoul", "Gate Wisp", "Bone Squire"] : type === "loot" ? ["Weathered Charm", "Rift Key", "Oath Coin"] : ["Hollow Witness", "Map-Maker", "Quiet Oracle"]
  return `${roots[salt % roots.length]} ${generation}`
}
