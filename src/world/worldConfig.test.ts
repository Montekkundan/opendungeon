import { describe, expect, test } from "bun:test"
import { createDungeon } from "../game/dungeon.js"
import { applyWorldContentPatch, createInitialWorldConfig, validateWorldConfig, worldAnchorsFromDungeonAnchors, worldConfigJsonSchema } from "./worldConfig.js"
import { createAdminGenerationRequest, createProceduralAdminPatch } from "./adminGenerator.js"

describe("world config", () => {
  test("exports a JSON schema contract for generated world files", () => {
    expect(worldConfigJsonSchema.title).toBe("WorldConfig")
    expect(worldConfigJsonSchema.required).toContain("events")
    expect(worldConfigJsonSchema.properties.events.type).toBe("array")
  })

  test("creates deterministic validated world content from dungeon anchors", () => {
    const anchors = worldAnchorsFromDungeonAnchors(createDungeon(1234, 1).anchors)
    const left = createInitialWorldConfig(1234, anchors)
    const right = createInitialWorldConfig(1234, anchors)

    expect(validateWorldConfig(left)).toEqual([])
    expect(left.events).toHaveLength(50)
    expect(left.events.map((event) => event.title)).toEqual(right.events.map((event) => event.title))
    expect(left.events.every((event) => anchors.some((anchor) => anchor.id === event.anchorId))).toBe(true)
  })

  test("rejects broken event references before they reach gameplay", () => {
    const world = createInitialWorldConfig(55, worldAnchorsFromDungeonAnchors(createDungeon(55, 1).anchors))
    world.events[0].anchorId = "missing-anchor"

    expect(validateWorldConfig(world).join(" ")).toContain("missing anchor")
  })

  test("applies an idempotent admin patch with valid quests and sprite plans", () => {
    const world = createInitialWorldConfig(9876, worldAnchorsFromDungeonAnchors(createDungeon(9876, 1).anchors))
    for (const event of world.events.slice(0, 20)) event.status = "completed"
    const request = createAdminGenerationRequest(world, "player killed many goblins")
    const patch = createProceduralAdminPatch(world, request, 50)
    const next = applyWorldContentPatch(world, patch)

    expect(validateWorldConfig(next)).toEqual([])
    expect(next.events).toHaveLength(100)
    expect(next.quests.some((quest) => quest.title.includes("Bannerlord"))).toBe(true)
    expect(next.spriteAssets.at(-1)?.model).toBe("openai/gpt-image-2")
  })
})
