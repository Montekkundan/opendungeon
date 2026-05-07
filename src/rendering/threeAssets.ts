import type { SpriteResourceManager, ResourceConfig, SpriteDefinition } from "@opentui/three"

export type ThreeAssetManifest = {
  resources: Record<string, ResourceConfig>
}

export const opendungeonThreeAssets: ThreeAssetManifest = {
  resources: {},
}

export async function createOpendungeonSpriteDefinitions(_resourceManager: SpriteResourceManager): Promise<Record<string, SpriteDefinition>> {
  throw new Error("@opentui/three asset preview is disabled until the Itch source-cache adapter is added.")
}

export function shouldUseThreeRenderer() {
  return (process.env.OPENDUNGEON_RENDERER ?? process.env.DUNGEON_RENDERER) === "three"
}
