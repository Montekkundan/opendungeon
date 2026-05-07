import { OrthographicCamera, Scene, Vector3 } from "three"
import { SpriteAnimator, SpriteResourceManager } from "@opentui/three"
import { createDawngeonSpriteDefinitions } from "./threeAssets.js"

export type DawngeonThreeScene = {
  scene: Scene
  camera: OrthographicCamera
  animator: SpriteAnimator
  update(deltaMs: number): void
}

export async function createDawngeonThreeScene(): Promise<DawngeonThreeScene> {
  const scene = new Scene()
  const camera = new OrthographicCamera(-12, 12, 7, -7, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)

  const resourceManager = new SpriteResourceManager(scene)
  const animator = new SpriteAnimator(scene)
  const sprites = await createDawngeonSpriteDefinitions(resourceManager)
  const preview = await animator.createSprite(sprites.preview)
  preview.setPosition(new Vector3(-4.5, 0, 0))
  preview.setScale(new Vector3(7, 5.5, 1))
  const dungeonSheet = await animator.createSprite(sprites.dungeonSheet)
  dungeonSheet.setPosition(new Vector3(5.5, 0, 0))
  dungeonSheet.setScale(new Vector3(5, 5, 1))

  return {
    scene,
    camera,
    animator,
    update(deltaMs: number) {
      animator.update(deltaMs)
    },
  }
}
