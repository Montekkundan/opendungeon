import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { d20FrameCount, d20RollSprite } from "./d20Sprites.js"
import { defaultDiceSkin } from "./diceSkins.js"
import { animatedSpriteIds, animationFrameCount, animationFramesForSprite, spriteAnimations, staticSpriteIds } from "./opendungeonSprites.js"
import { animatedPixelSprite, pixelSprite, type PixelSprite } from "./pixelSprites.js"
import { activeAssetPack } from "./packs.js"

describe("opendungeon runtime sprites", () => {
  test("uses runtime sprites instead of committed generated atlases", () => {
    expect(activeAssetPack.id).toBe("opendungeon")
    expect(activeAssetPack.tileSize).toBe(100)
    expect(activeAssetPack.sourceUrl).toContain("runtime://")
    expect(activeAssetPack.sourceUrl).toContain("opendungeon-assets")
    expect(activeAssetPack.previewPath).toContain("assets/opendungeon-assets/runtime/actors/")
    expect(animationFrameCount).toBe(4)
    expect(d20FrameCount()).toBe(12)
    expect(generatedPngs("assets/opendungeon")).toEqual([])
  })

  test("keeps the expected sprite ids and animation metadata", () => {
    expect(animatedSpriteIds).toContain("hero-ranger")
    expect(animatedSpriteIds).toContain("hero-warden")
    expect(animatedSpriteIds).toContain("slime")
    expect(staticSpriteIds).toContain("floor-a")
    expect(staticSpriteIds).toContain("sword")
    expect(spriteAnimations).toContain("attack-melee")
    expect(animationFramesForSprite("slime", "walk")).toBe(4)
    expect(animationFramesForSprite("coin", "walk")).toBe(1)
  })

  test("samples actor, terrain, item, and d20 sprites into terminal cells", () => {
    const hero = pixelSprite("hero-ranger", 18, 9)
    const walk = animatedPixelSprite("hero-ranger", "walk", 2, 18, 9)
    const slime = animatedPixelSprite("slime", "attack-melee", 2, 16, 8)
    const wall = pixelSprite("wall-a", 16, 8)
    const sword = pixelSprite("sword", 14, 7)
    const d20 = d20RollSprite(20, 11, 16, 8, defaultDiceSkin)

    expect(hasVisibleCells(hero)).toBe(true)
    expect(hasVisibleCells(walk)).toBe(true)
    expect(hasVisibleCells(slime)).toBe(true)
    expect(wall.cells.flat().every((cell) => cell.bg)).toBe(true)
    expect(hasVisibleCells(sword)).toBe(true)
    expect(hasVisibleCells(d20)).toBe(true)
    expect(colorCount(d20)).toBeGreaterThan(3)
  })

  test("keeps committed runtime assets to the sampler-owned set", () => {
    expect(runtimeAssetFiles()).toEqual([
      "assets/opendungeon-assets/licenses/warden-sprite-license.txt",
      "assets/opendungeon-assets/runtime/actors/crypt-orc/attack-melee.png",
      "assets/opendungeon-assets/runtime/actors/crypt-orc/attack-ranged.png",
      "assets/opendungeon-assets/runtime/actors/crypt-orc/death.png",
      "assets/opendungeon-assets/runtime/actors/crypt-orc/hurt.png",
      "assets/opendungeon-assets/runtime/actors/crypt-orc/idle.png",
      "assets/opendungeon-assets/runtime/actors/crypt-orc/walk.png",
      "assets/opendungeon-assets/runtime/actors/hero-soldier/attack-melee.png",
      "assets/opendungeon-assets/runtime/actors/hero-soldier/attack-ranged.png",
      "assets/opendungeon-assets/runtime/actors/hero-soldier/death.png",
      "assets/opendungeon-assets/runtime/actors/hero-soldier/hurt.png",
      "assets/opendungeon-assets/runtime/actors/hero-soldier/idle.png",
      "assets/opendungeon-assets/runtime/actors/hero-soldier/walk.png",
      "assets/opendungeon-assets/runtime/actors/mire-slime/attack.png",
      "assets/opendungeon-assets/runtime/actors/mire-slime/death.png",
      "assets/opendungeon-assets/runtime/actors/mire-slime/hurt.png",
      "assets/opendungeon-assets/runtime/actors/mire-slime/idle.png",
      "assets/opendungeon-assets/runtime/actors/mire-slime/shocked.png",
      "assets/opendungeon-assets/runtime/actors/mire-slime/walk.png",
      "assets/opendungeon-assets/runtime/actors/warden/attack.png",
      "assets/opendungeon-assets/runtime/actors/warden/hurt.png",
      "assets/opendungeon-assets/runtime/actors/warden/idle.png",
      "assets/opendungeon-assets/runtime/actors/warden/walk.png",
    ])
  })

  test("runtime source no longer references old generated or vendor asset directories", () => {
    const oldVendorName = ["it", "ch"].join("")
    expect(existsSync("assets/opendungeon")).toBe(false)
    expect(existsSync(`assets/${oldVendorName}`)).toBe(false)
    expect(existsSync("assets/0x72")).toBe(false)
    expect(existsSync("assets/dawngeon")).toBe(false)
    expect(existsSync("assets/opengameart-d20")).toBe(false)
    expect(existsSync("assets/opendungeon-assets/zerie")).toBe(false)
    expect(existsSync("assets/opendungeon-assets/samurai-free")).toBe(false)
    expect(existsSync("assets/opendungeon-assets/forest-monsters-free")).toBe(false)
    expect(existsSync("assets/opendungeon-assets/runtime/actors/hero-soldier/idle.png")).toBe(true)
    expect(existsSync("assets/opendungeon-assets/runtime/actors/crypt-orc/idle.png")).toBe(true)
    expect(existsSync("assets/opendungeon-assets/runtime/actors/mire-slime/idle.png")).toBe(true)
    expect(existsSync("assets/opendungeon-assets/runtime/actors/warden/idle.png")).toBe(true)

    const forbidden = [
      "assets/" + "opendungeon/",
      "assets/" + oldVendorName + "/",
      ".asset-cache/" + oldVendorName + "/",
      "assetPath(" + JSON.stringify(oldVendorName),
      "assets/" + "0x72",
      "assets/" + "dawn" + "geon",
      "assets/" + "opengame" + "art",
      "zerie",
      "samurai-free",
      "forest-monsters-free",
      "tiny-rpg-free",
    ]
    const files = sourceFiles("src")
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      for (const value of forbidden) expect(text.includes(value), `${file} contains ${value}`).toBe(false)
    }

    const pixelSpriteSource = readFileSync("src/assets/pixelSprites.ts", "utf8")
    expect(pixelSpriteSource.includes("proceduralActorSprite")).toBe(false)
    expect(pixelSpriteSource.includes("sourceActorSprite(id, animation, frame, width, height) ?? emptySprite(width, height)")).toBe(true)
    expect(existsSync("src/assets/spriteSampler.ts")).toBe(true)
    expect(pixelSpriteSource.includes("PNG.sync.read")).toBe(false)
  })
})

function hasVisibleCells(sprite: PixelSprite) {
  return sprite.cells.flat().some((cell) => cell.ch !== " " || cell.bg)
}

function colorCount(sprite: PixelSprite) {
  return new Set(sprite.cells.flat().flatMap((cell) => [cell.fg, cell.bg].filter(Boolean))).size
}

function generatedPngs(dir: string): string[] {
  return recursiveFiles(dir, (path) => path.endsWith(".png"))
}

function runtimeAssetFiles(dir = "assets/opendungeon-assets"): string[] {
  return recursiveFiles(dir).sort()
}

function recursiveFiles(dir: string, filter: (path: string) => boolean = () => true): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return recursiveFiles(path, filter)
      return entry.isFile() && filter(path) ? [path] : []
    })
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : []
  })
}
