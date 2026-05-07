import type { AnimationDefinition, ResourceConfig, SpriteDefinition } from "@opentui/three"

export type ThreeAssetManifest = {
  resources: Record<string, ResourceConfig>
  sprites: Record<string, SpriteDefinition>
}

const dawngeonPreviewResource: ResourceConfig = {
  imagePath: "assets/dawngeon/preview.png",
  sheetNumFrames: 1,
}

const previewAnimation: AnimationDefinition = {
  resource: dawngeonPreviewResource as never,
  animNumFrames: 1,
  animFrameOffset: 0,
  frameDuration: 1000,
  loop: false,
}

export const dawngeonThreeAssets: ThreeAssetManifest = {
  resources: {
    preview: dawngeonPreviewResource,
  },
  sprites: {
    preview: {
      initialAnimation: "idle",
      animations: {
        idle: previewAnimation,
      },
      scale: 1,
    },
  },
}

export function shouldUseThreeRenderer() {
  return process.env.DUNGEON_RENDERER === "three"
}
