import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PNG } from "pngjs"
import { d20FrameCount, d20RollSprite } from "./d20Sprites.js"
import {
  animatedSpriteIds,
  animationFrameCount,
  animationFramesForSprite,
  cropForSprite,
  sourceTileSize,
  spriteAnimations,
  spriteSheetPaths,
  staticSpriteCrops,
} from "./opendungeonSprites.js"
import { animatedPixelSprite, pixelSprite } from "./pixelSprites.js"
import { activeAssetPack } from "./packs.js"

describe("opendungeon owned sprites", () => {
  test("uses the owned 64x64 asset pack", () => {
    expect(activeAssetPack.id).toBe("opendungeon")
    expect(activeAssetPack.tileSize).toBe(64)
    expect(sourceTileSize).toBe(64)
    expect(animationFrameCount).toBe(4)
  })

  test("generated sheet dimensions match manifest crops", () => {
    const terrain = loadPng(spriteSheetPaths.terrain)
    const items = loadPng(spriteSheetPaths.items)
    const actors = loadPng(spriteSheetPaths.actors)
    const d20 = loadPng("assets/opendungeon/d20.png")

    expect(terrain.width).toBe(8 * sourceTileSize)
    expect(terrain.height).toBe(sourceTileSize)
    expect(items.width).toBe(8 * sourceTileSize)
    expect(items.height).toBe(3 * sourceTileSize)
    expect(actors.width).toBe(animationFrameCount * sourceTileSize)
    expect(actors.height).toBe(animatedSpriteIds.length * spriteAnimations.length * sourceTileSize)
    expect(d20.width).toBe(d20FrameCount() * sourceTileSize)
    expect(d20.height).toBe(20 * sourceTileSize)

    for (const crop of Object.values(staticSpriteCrops)) {
      const sheet = crop.sheet === "terrain" ? terrain : items
      expect((crop.tileX + 1) * sourceTileSize).toBeLessThanOrEqual(sheet.width)
      expect((crop.tileY + 1) * sourceTileSize).toBeLessThanOrEqual(sheet.height)
    }
  })

  test("samples static, animated, and d20 sprites into terminal cells", () => {
    const hero = pixelSprite("hero-ranger", 8, 4)
    const walk = animatedPixelSprite("hero-ranger", "walk", 2, 8, 4)
    const wall = pixelSprite("wall-a", 8, 4)
    const d20 = d20RollSprite(20, 11, 8, 4)

    expect(hero.cells.flat().some((cell) => cell.ch === "█")).toBe(true)
    expect(walk.cells.flat().some((cell) => cell.ch === "█")).toBe(true)
    expect(wall.cells.flat().every((cell) => cell.bg)).toBe(true)
    expect(d20.cells.flat().some((cell) => cell.ch === "█")).toBe(true)
  })

  test("animation crop math wraps frames and stays inside the actor sheet", () => {
    const actors = loadPng(spriteSheetPaths.actors)
    const crop = cropForSprite("slime", "walk", 99)

    expect(animationFramesForSprite("slime", "walk")).toBe(4)
    expect(crop.tileX).toBe(3)
    expect((crop.tileX + 1) * sourceTileSize).toBeLessThanOrEqual(actors.width)
    expect((crop.tileY + 1) * sourceTileSize).toBeLessThanOrEqual(actors.height)
  })

  test("runtime source no longer references external sprite packs", () => {
    expect(existsSync("assets/0x72")).toBe(false)
    expect(existsSync("assets/dawngeon")).toBe(false)
    expect(existsSync("assets/opengameart-d20")).toBe(false)

    const forbidden = ["assets/" + "0x72", "assets/" + "dawn" + "geon", "assets/" + "opengame" + "art", "0x" + "72", "opengame" + "art"]
    const files = sourceFiles("src")
    for (const file of files) {
      const text = readFileSync(file, "utf8")
      for (const value of forbidden) expect(text.includes(value), `${file} contains ${value}`).toBe(false)
    }
  })
})

function loadPng(path: string) {
  return PNG.sync.read(readFileSync(path))
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : []
  })
}
