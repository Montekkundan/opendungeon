import { generateGatewayJson, type GatewayJsonRequest } from "../../cloud/aiGateway.js"
import { applyWorldContentPatch, readWorldConfig, writeWorldConfig, type WorldContentPatch } from "../../world/worldConfig.js"
import { createAdminGenerationRequest, createAdminPatchModelRequest, normalizeAdminModelPatch, type AdminGenerationRequest } from "../../world/adminGenerator.js"

export type AdminPatchJsonGenerator = (request: GatewayJsonRequest) => Promise<unknown>

export async function aiAdminWorkflow(worldId: string, playerSummary: string): Promise<WorldContentPatch> {
  "use workflow"
  const world = await loadWorldStep(worldId)
  const patch = await generateAdminPatchStep(worldId, playerSummary)
  const next = applyWorldContentPatch(world, patch)
  await saveWorldStep(next)
  return patch
}

async function loadWorldStep(worldId: string) {
  "use step"
  return readWorldConfig(worldId)
}

async function generateAdminPatchStep(worldId: string, playerSummary: string) {
  "use step"
  const world = readWorldConfig(worldId)
  const completedEventCount = world.events.filter((event) => event.status === "completed").length
  const request = createAdminGenerationRequest(world, playerSummary || `${completedEventCount} completed events`)
  return generateAdminPatchWithModel(world, request)
}

async function saveWorldStep(world: ReturnType<typeof readWorldConfig>) {
  "use step"
  writeWorldConfig(world)
}

export async function generateAdminPatchWithModel(world: ReturnType<typeof readWorldConfig>, request: AdminGenerationRequest, generateJson: AdminPatchJsonGenerator = generateGatewayJson): Promise<WorldContentPatch> {
  const modelRequest = createAdminPatchModelRequest(world, request)
  const rawPatch = await generateJson(modelRequest)
  return normalizeAdminModelPatch(world, request, rawPatch)
}
