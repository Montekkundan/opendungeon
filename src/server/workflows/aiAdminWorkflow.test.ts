import { describe, expect, test } from "bun:test"
import { createDungeon } from "../../game/dungeon.js"
import { createAdminGenerationRequest, createAdminPatchModelRequest, normalizeAdminModelPatch } from "../../world/adminGenerator.js"
import { applyWorldContentPatch, createInitialWorldConfig, validateWorldConfig, worldAnchorsFromDungeonAnchors } from "../../world/worldConfig.js"
import { generateAdminPatchWithModel } from "./aiAdminWorkflow.js"

describe("AI admin workflow model steps", () => {
  test("builds a constrained model request from current world state", () => {
    const world = createInitialWorldConfig(2468, worldAnchorsFromDungeonAnchors(createDungeon(2468, 1).anchors))
    world.events[0].status = "completed"
    const request = createAdminGenerationRequest(world, "the player spared the shrine keeper")
    const modelRequest = createAdminPatchModelRequest(world, request)
    const prompt = JSON.parse(modelRequest.prompt) as {
      request: { playerSummary: string }
      constraints: string[]
      anchors: Array<{ id: string }>
      spriteGenerationSkill: { source: string; instructions: string }
    }

    expect(modelRequest.model).toBeTruthy()
    expect(modelRequest.system).toContain("strict JSON")
    expect(modelRequest.system).toContain("spriteGenerationSkill")
    expect(prompt.request.playerSummary).toContain("shrine keeper")
    expect(prompt.spriteGenerationSkill.source).toBe("assets/opendungeon-assets/skills/ai-admin-sprite-generation.md")
    expect(prompt.spriteGenerationSkill.instructions).toContain("18x18")
    expect(prompt.spriteGenerationSkill.instructions).toContain("8x8")
    expect(prompt.constraints.join(" ")).toContain("Do not reuse existing ids")
    expect(prompt.anchors.some((anchor) => anchor.id === world.anchors[0].id)).toBe(true)
  })

  test("uses model JSON output instead of procedural fallback patches", async () => {
    const world = createInitialWorldConfig(7777, worldAnchorsFromDungeonAnchors(createDungeon(7777, 1).anchors))
    const request = createAdminGenerationRequest(world, "the crawler keeps opening cursed doors")
    const anchorId = world.anchors[0].id

    const patch = await generateAdminPatchWithModel(world, request, async (modelRequest) => {
      expect(modelRequest.prompt).toContain("cursed doors")
      return {
        worldId: world.worldId,
        generation: request.generation,
        entities: [
          {
            id: "admin-1-door-warden",
            type: "npc",
            name: "Door Warden Pell",
            description: "A wary keeper tracking every cursed threshold the crawler opens.",
            anchorId,
            spriteAssetId: "sprite-admin-1-door-warden",
            tags: ["ai-admin", "doors"],
          },
        ],
        events: [
          {
            id: "admin-1-cursed-door-warning",
            type: "quest",
            status: "active",
            title: "The door warden marks the next threshold",
            summary: "A new warning event appears near the latest cursed door route.",
            anchorId,
            entityIds: ["admin-1-door-warden"],
            trigger: { kind: "quest-progress", value: 1, tag: "cursed-doors" },
            consequences: ["Adds a door-focused admin quest hook."],
          },
        ],
        quests: [
          {
            id: "quest-admin-1-doors",
            title: "Threshold Warnings",
            summary: "Follow the warden's warnings before opening more cursed doors.",
            status: "active",
            objectiveEventIds: ["admin-1-cursed-door-warning"],
            rewardEntityIds: ["admin-1-door-warden"],
            triggerEventIds: ["admin-1-cursed-door-warning"],
          },
        ],
        spriteAssets: [
          {
            id: "sprite-admin-1-door-warden",
            kind: "npc",
            prompt: "Pixel art terminal RPG shrine door warden, readable silhouette, transparent background.",
            model: "openai/gpt-image-2",
            status: "planned",
          },
        ],
        memoryRefs: ["memory-door-warden"],
      }
    })
    const next = applyWorldContentPatch(world, patch)

    expect(validateWorldConfig(next)).toEqual([])
    expect(patch.events).toHaveLength(1)
    expect(patch.events[0].title).toContain("door warden")
    expect(next.entities.some((entity) => entity.id === "admin-1-door-warden")).toBe(true)
  })

  test("rejects model patches that collide with existing world ids", () => {
    const world = createInitialWorldConfig(8888, worldAnchorsFromDungeonAnchors(createDungeon(8888, 1).anchors))
    const request = createAdminGenerationRequest(world, "duplicate an existing entity")

    expect(() =>
      normalizeAdminModelPatch(world, request, {
        worldId: world.worldId,
        generation: request.generation,
        entities: [
          {
            id: world.entities[0].id,
            type: "npc",
            name: "Duplicate",
            description: "This should not be accepted.",
            anchorId: world.anchors[0].id,
            tags: ["ai-admin"],
          },
        ],
        events: [],
        quests: [],
        spriteAssets: [],
      }),
    ).toThrow("reuses existing id")
  })
})
