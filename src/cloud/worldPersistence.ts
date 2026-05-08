import type { SupabaseClient } from "@supabase/supabase-js"
import type { WorldConfig, WorldLogEntry } from "../world/worldConfig.js"
import { createSupabaseServiceClient } from "./supabase.js"

type PersistenceClient = Pick<SupabaseClient, "from">

export type WorldPersistenceResult = {
  skipped: boolean
  worldId: string
  worldPersisted: boolean
  logEntriesPersisted: number
  reason?: string
}

export async function persistGeneratedWorldForUser(
  world: WorldConfig,
  logs: WorldLogEntry[] = [],
  options: {
    ownerId?: string
    client?: PersistenceClient | null
  } = {},
): Promise<WorldPersistenceResult> {
  const ownerId = options.ownerId ?? process.env.OPENDUNGEON_SUPABASE_OWNER_ID
  const client = options.client === undefined ? createSupabaseServiceClient() : options.client
  if (!client) return skipped(world.worldId, "supabase client not configured")
  if (!ownerId) return skipped(world.worldId, "owner id not configured")

  const { error: worldError } = await client.from("opendungeon_worlds").upsert({
    id: world.worldId,
    owner_id: ownerId,
    seed: world.seed,
    config: world,
    generation: world.generation,
    updated_at: new Date().toISOString(),
  })
  if (worldError) throw new Error(`World persistence failed: ${worldError.message}`)

  if (logs.length) {
    const { error: logError } = await client.from("opendungeon_world_events").insert(
      logs.map((entry) => ({
        world_id: world.worldId,
        owner_id: ownerId,
        event_type: entry.type,
        event_id: entry.eventId ?? null,
        message: entry.message,
        metadata: {
          logId: entry.id,
          turn: entry.turn,
          createdAt: entry.createdAt,
          ...(entry.metadata ?? {}),
        },
        created_at: entry.createdAt,
      })),
    )
    if (logError) throw new Error(`World log persistence failed: ${logError.message}`)
  }

  return {
    skipped: false,
    worldId: world.worldId,
    worldPersisted: true,
    logEntriesPersisted: logs.length,
  }
}

function skipped(worldId: string, reason: string): WorldPersistenceResult {
  return {
    skipped: true,
    worldId,
    worldPersisted: false,
    logEntriesPersisted: 0,
    reason,
  }
}
