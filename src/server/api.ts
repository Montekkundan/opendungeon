import { Hono } from "hono"
import { checkAiGatewayImageModel, generateSpriteImage } from "../cloud/aiGateway.js"
import { storeGeneratedSpriteAsset } from "../cloud/generatedAssets.js"
import { createSupabaseServiceClient, supabaseConfig } from "../cloud/supabase.js"
import { createDungeon } from "../game/dungeon.js"
import { createInitialWorldConfig, validateWorldConfig, worldAnchorsFromDungeonAnchors, writeWorldConfig } from "../world/worldConfig.js"
import { createAdminGenerationRequest, createProceduralAdminPatch } from "../world/adminGenerator.js"
import { aiAdminWorkflow } from "./workflows/aiAdminWorkflow.js"

const app = new Hono()

app.get("/health", async (c) => {
  const gateway = await checkAiGatewayImageModel()
  return c.json({
    ok: true,
    supabaseConfigured: Boolean(supabaseConfig()),
    aiGateway: gateway,
    multiplayer: "spacetimedb-phase-2",
  })
})

app.post("/worlds", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { seed?: unknown; finalFloor?: unknown }
  const seed = integer(body.seed, Math.floor(Math.random() * 9_000_000) + 1_000_000)
  const finalFloor = Math.max(1, Math.min(20, integer(body.finalFloor, 5)))
  const anchors = []
  for (let floor = 1; floor <= finalFloor; floor++) anchors.push(...worldAnchorsFromDungeonAnchors(createDungeon(seed, floor).anchors))
  const world = createInitialWorldConfig(seed, anchors)
  writeWorldConfig(world)
  await maybePersistWorld(world)
  return c.json({ world })
})

app.post("/worlds/:worldId/admin-patch", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { world?: unknown; playerSummary?: unknown }
  const world = body.world
  const errors = validateWorldConfig(world)
  if (errors.length) return c.json({ errors }, 400)
  const request = createAdminGenerationRequest(world as Parameters<typeof createAdminGenerationRequest>[0], String(body.playerSummary || ""))
  const patch = createProceduralAdminPatch(world as Parameters<typeof createAdminGenerationRequest>[0], request)
  return c.json({ patch })
})

app.post("/worlds/:worldId/admin-workflow", async (c) => {
  const worldId = c.req.param("worldId")
  const body = (await c.req.json().catch(() => ({}))) as { playerSummary?: unknown }
  const patch = await aiAdminWorkflow(worldId, String(body.playerSummary || ""))
  return c.json({ patch })
})

app.post("/assets/generated-sprites", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { assetId?: unknown; prompt?: unknown }
  const assetId = cleanId(body.assetId)
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (!assetId || !prompt) return c.json({ error: "assetId and prompt are required." }, 400)
  const image = await generateSpriteImage(prompt)
  const asset = await storeGeneratedSpriteAsset(assetId, image)
  return c.json({ asset })
})

async function maybePersistWorld(world: ReturnType<typeof createInitialWorldConfig>) {
  const client = createSupabaseServiceClient()
  const ownerId = process.env.OPENDUNGEON_SUPABASE_OWNER_ID
  if (!client || !ownerId) return
  await client.from("opendungeon_worlds").upsert({
    id: world.worldId,
    owner_id: ownerId,
    seed: world.seed,
    config: world,
    generation: world.generation,
  })
}

function integer(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : fallback
}

function cleanId(value: unknown) {
  if (typeof value !== "string") return ""
  return value.replace(/[^a-zA-Z0-9._-]/g, "").trim()
}

export default app
