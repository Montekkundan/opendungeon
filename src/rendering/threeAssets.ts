import { SpriteResourceManager, type ResourceConfig, type SpriteDefinition } from "@opentui/three"
import { spriteSheetPaths } from "../assets/opendungeonSprites.js"

export type ThreeAssetManifest = {
  resources: Record<string, ResourceConfig>
}

export const opendungeonThreeAssets: ThreeAssetManifest = {
  resources: {
    terrain: {
      imagePath: spriteSheetPaths.terrain,
      sheetNumFrames: 1,
    },
    items: {
      imagePath: spriteSheetPaths.items,
      sheetNumFrames: 1,
    },
    actors: {
      imagePath: spriteSheetPaths.actors,
      sheetNumFrames: 1,
    },
  },
}

export async function createOpendungeonSpriteDefinitions(resourceManager: SpriteResourceManager): Promise<Record<string, SpriteDefinition>> {
  const terrainResource = await resourceManager.createResource(opendungeonThreeAssets.resources.terrain)
  const itemResource = await resourceManager.createResource(opendungeonThreeAssets.resources.items)
  const actorResource = await resourceManager.createResource(opendungeonThreeAssets.resources.actors)

  return {
    terrain: singleFrameSprite("opendungeon-terrain", terrainResource),
    items: singleFrameSprite("opendungeon-items", itemResource),
    actors: singleFrameSprite("opendungeon-actors", actorResource),
  }
}

export function shouldUseThreeRenderer() {
  return (process.env.OPENDUNGEON_RENDERER ?? process.env.DUNGEON_RENDERER) === "three"
}

function singleFrameSprite(id: string, resource: Awaited<ReturnType<SpriteResourceManager["createResource"]>>): SpriteDefinition {
  return {
    id,
    initialAnimation: "idle",
    animations: {
      idle: {
        resource,
        animNumFrames: 1,
        animFrameOffset: 0,
        frameDuration: 1000,
        loop: false,
      },
    },
    scale: 1,
  }
}
