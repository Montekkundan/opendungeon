import { SpriteResourceManager, type ResourceConfig, type SpriteDefinition } from "@opentui/three"

export type ThreeAssetManifest = {
  resources: Record<string, ResourceConfig>
}

export const dawngeonThreeAssets: ThreeAssetManifest = {
  resources: {
    preview: {
      imagePath: "assets/dawngeon/preview.png",
      sheetNumFrames: 1,
    },
    dungeonSheet: {
      imagePath: "assets/0x72/dungeon-tileset-v2.png",
      sheetNumFrames: 1,
    },
  },
}

export async function createDawngeonSpriteDefinitions(resourceManager: SpriteResourceManager): Promise<Record<string, SpriteDefinition>> {
  const previewResource = await resourceManager.createResource(dawngeonThreeAssets.resources.preview)
  const dungeonSheetResource = await resourceManager.createResource(dawngeonThreeAssets.resources.dungeonSheet)

  return {
    preview: {
      id: "dawngeon-preview",
      initialAnimation: "idle",
      animations: {
        idle: {
          resource: previewResource,
          animNumFrames: 1,
          animFrameOffset: 0,
          frameDuration: 1000,
          loop: false,
        },
      },
      scale: 1,
    },
    dungeonSheet: {
      id: "0x72-dungeon-sheet",
      initialAnimation: "idle",
      animations: {
        idle: {
          resource: dungeonSheetResource,
          animNumFrames: 1,
          animFrameOffset: 0,
          frameDuration: 1000,
          loop: false,
        },
      },
      scale: 1,
    },
  }
}

export function shouldUseThreeRenderer() {
  return (process.env.OPENDUNGEON_RENDERER ?? process.env.DUNGEON_RENDERER) === "three"
}
