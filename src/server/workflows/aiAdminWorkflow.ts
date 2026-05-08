import { applyWorldContentPatch, readWorldConfig, writeWorldConfig, type WorldContentPatch } from "../../world/worldConfig.js"
import { createAdminGenerationRequest, createProceduralAdminPatch } from "../../world/adminGenerator.js"

export async function aiAdminWorkflow(worldId: string, playerSummary: string): Promise<WorldContentPatch> {
  "use workflow"
  const world = await loadWorldStep(worldId)
  const request = createAdminGenerationRequest(world, playerSummary)
  const patch = await generateAdminPatchStep(worldId, playerSummary, request.completedEventCount)
  const next = applyWorldContentPatch(world, patch)
  await saveWorldStep(next)
  return patch
}

async function loadWorldStep(worldId: string) {
  "use step"
  return readWorldConfig(worldId)
}

async function generateAdminPatchStep(worldId: string, playerSummary: string, completedEventCount: number) {
  "use step"
  const world = readWorldConfig(worldId)
  return createProceduralAdminPatch(world, createAdminGenerationRequest(world, playerSummary || `${completedEventCount} completed events`))
}

async function saveWorldStep(world: ReturnType<typeof readWorldConfig>) {
  "use step"
  writeWorldConfig(world)
}
