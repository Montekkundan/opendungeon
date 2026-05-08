import { describe, expect, test } from "bun:test"
import { persistGeneratedWorldForUser } from "./worldPersistence.js"
import { createInitialWorldConfig, createWorldLogEntry, type WorldConfig } from "../world/worldConfig.js"

describe("world persistence", () => {
  test("skips persistence without a signed-in owner or client", async () => {
    const world = worldConfig()

    await expect(persistGeneratedWorldForUser(world, [], { ownerId: "user-1", client: null })).resolves.toMatchObject({
      skipped: true,
      reason: "supabase client not configured",
    })
    await expect(persistGeneratedWorldForUser(world, [], { client: fakeClient() as never })).resolves.toMatchObject({
      skipped: true,
      reason: "owner id not configured",
    })
  })

  test("persists generated world configs and event logs for an owner", async () => {
    const client = fakeClient()
    const world = worldConfig()
    const logs = [
      createWorldLogEntry(world.worldId, 1, {
        type: "admin-patch-applied",
        message: "Generated quest branch.",
        eventId: "event-001",
        metadata: { generation: 2 },
      }),
    ]

    const result = await persistGeneratedWorldForUser(world, logs, { ownerId: "user-1", client: client as never })

    expect(result).toMatchObject({ skipped: false, worldPersisted: true, logEntriesPersisted: 1 })
    expect(client.tables.opendungeon_worlds[0]).toMatchObject({ id: world.worldId, owner_id: "user-1", generation: world.generation })
    expect(client.tables.opendungeon_world_events[0]).toMatchObject({
      world_id: world.worldId,
      owner_id: "user-1",
      event_type: "admin-patch-applied",
      event_id: "event-001",
    })
  })
})

function worldConfig(): WorldConfig {
  return createInitialWorldConfig(1234, [
    {
      id: "f1-start",
      floor: 1,
      roomIndex: 0,
      kind: "start",
      position: { x: 1, y: 1 },
      width: 6,
      height: 6,
      biome: "crypt",
    },
  ])
}

function fakeClient() {
  const tables: Record<string, unknown[]> = {
    opendungeon_worlds: [],
    opendungeon_world_events: [],
  }
  return {
    tables,
    from(table: string) {
      return {
        async upsert(value: unknown) {
          tables[table].push(value)
          return { error: null }
        },
        async insert(value: unknown[]) {
          tables[table].push(...value)
          return { error: null }
        },
      }
    },
  }
}
