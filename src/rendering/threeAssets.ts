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
  },
}

export async function createDawngeonSpriteDefinitions(resourceManager: SpriteResourceManager): Promise<Record<string, SpriteDefinition>> {
  const previewResource = await resourceManager.createResource(dawngeonThreeAssets.resources.preview)

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
  }
}

export function shouldUseThreeRenderer() {
  return process.env.DUNGEON_RENDERER === "three"
}
