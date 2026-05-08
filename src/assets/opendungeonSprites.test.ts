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
    expect(activeAssetPack.previewPath).toContain(".asset-cache/opendungeon-assets/")
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

  test("runtime source no longer references old generated or vendor asset directories", () => {
    const oldVendorName = ["it", "ch"].join("")
    expect(existsSync("assets/opendungeon")).toBe(false)
    expect(existsSync(`assets/${oldVendorName}`)).toBe(false)
    expect(existsSync("assets/0x72")).toBe(false)
    expect(existsSync("assets/dawngeon")).toBe(false)
    expect(existsSync("assets/opengameart-d20")).toBe(false)

    const forbidden = [
      "assets/" + "opendungeon/",
      "assets/" + oldVendorName + "/",
      ".asset-cache/" + oldVendorName + "/",
      "assetPath(" + JSON.stringify(oldVendorName),
      "assets/" + "0x72",
      "assets/" + "dawn" + "geon",
      "assets/" + "opengame" + "art",
    ]
    const files = sourceFiles("src")
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      for (const value of forbidden) expect(text.includes(value), `${file} contains ${value}`).toBe(false)
    }

    const pixelSpriteSource = readFileSync("src/assets/pixelSprites.ts", "utf8")
    expect(pixelSpriteSource.includes("proceduralActorSprite")).toBe(false)
    expect(pixelSpriteSource.includes("sourceActorSprite(id, animation, frame, width, height) ?? emptySprite(width, height)")).toBe(true)
  })
})

function hasVisibleCells(sprite: PixelSprite) {
  return sprite.cells.flat().some((cell) => cell.ch !== " " || cell.bg)
}

function colorCount(sprite: PixelSprite) {
  return new Set(sprite.cells.flat().flatMap((cell) => [cell.fg, cell.bg].filter(Boolean))).size
}

function generatedPngs(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return generatedPngs(path)
    return entry.isFile() && path.endsWith(".png") ? [path] : []
  })
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : []
  })
}
