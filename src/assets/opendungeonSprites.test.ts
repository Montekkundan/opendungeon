import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { d20FrameCount, d20RollSprite, d20SourceSheetPath } from "./d20Sprites.js"
import { defaultDiceSkin } from "./diceSkins.js"
import { animatedSpriteIds, animationFrameCount, animationFramesForSprite, spriteAnimations, staticSpriteIds } from "./opendungeonSprites.js"
import { animatedPixelSprite, pixelSprite, type PixelSprite } from "./pixelSprites.js"
import { loadPortraitManifest, portraitIds, portraitSprite, validatePortraitSpriteCoverage } from "./portraitSprites.js"
import {
  characterMetadata,
  frameTagsForAnimation,
  frameTagsForStaticSprite,
  loadSpriteMetadataManifest,
  requiredSpriteFrameTagIds,
  validateSpriteMetadataManifest,
} from "./spriteMetadata.js"
import { activeAssetPack } from "./packs.js"

describe("opendungeon runtime sprites", () => {
  test("uses runtime sprites instead of committed generated atlases", () => {
    expect(activeAssetPack.id).toBe("opendungeon")
    expect(activeAssetPack.tileSize).toBe(18)
    expect(activeAssetPack.sourceUrl).toContain("runtime://")
    expect(activeAssetPack.sourceUrl).toContain("opendungeon-assets")
    expect(activeAssetPack.previewPath).toContain("assets/opendungeon-assets/runtime/actors/tiny-ranger/")
    expect(animationFrameCount).toBe(4)
    expect(d20FrameCount()).toBe(12)
    expect(existsSync(d20SourceSheetPath())).toBe(true)
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

  test("validates frame tags and per-character metadata", () => {
    const manifest = loadSpriteMetadataManifest()
    const usedTags = new Set([
      ...Object.values(manifest.frameTags).flat(),
      ...Object.values(manifest.staticFrameTags).flat(),
    ])

    expect(validateSpriteMetadataManifest(manifest)).toEqual([])
    expect(validatePortraitSpriteCoverage(loadPortraitManifest())).toEqual([])
    expect(portraitIds).toContain("portrait.boss-minotaur")
    for (const tag of requiredSpriteFrameTagIds) expect(usedTags.has(tag)).toBe(true)
    expect(frameTagsForAnimation("attack-melee")).toEqual(["windup", "impact", "recover", "recover"])
    expect(frameTagsForAnimation("cast")).toContain("cast-loop")
    expect(frameTagsForStaticSprite("potion")).toContain("pickup")
    expect(frameTagsForStaticSprite("shield")).toContain("block")
    expect(frameTagsForStaticSprite("chest")).toContain("open")

    for (const id of animatedSpriteIds) {
      const metadata = characterMetadata(id)
      expect(metadata?.hitbox.width).toBeGreaterThan(0)
      expect(metadata?.paletteNotes.length).toBeGreaterThan(0)
      expect(metadata?.weaponSocket.x).toBeGreaterThanOrEqual(0)
      expect(metadata?.dialogPortraitId).toContain(`portrait.`)
    }
  })

  test("samples actor, terrain, item, and d20 sprites into terminal cells", () => {
    const hero = pixelSprite("hero-ranger", 18, 9)
    const walk = animatedPixelSprite("hero-ranger", "walk", 2, 18, 9)
    const slime = animatedPixelSprite("slime", "attack-melee", 2, 16, 8)
    const wall = pixelSprite("wall-a", 16, 8)
    const sword = pixelSprite("sword", 14, 7)
    const d20 = d20RollSprite(20, 11, 16, 8, defaultDiceSkin)
    const portrait = portraitSprite("portrait.boss-minotaur", 18, 9)

    expect(hasVisibleCells(hero)).toBe(true)
    expect(hasVisibleCells(walk)).toBe(true)
    expect(hasVisibleCells(slime)).toBe(true)
    expect(wall.cells.flat().every((cell) => cell.bg)).toBe(true)
    expect(hasVisibleCells(sword)).toBe(true)
    expect(hasVisibleCells(d20)).toBe(true)
    expect(hasVisibleCells(portrait)).toBe(true)
    expect(colorCount(d20)).toBeGreaterThan(3)
  })

  test("keeps terminal-sized runtime assets and downloaded source packs organized", () => {
    const files = runtimeAssetFiles()
    for (const file of [
      "assets/opendungeon-assets/licenses/project-owned-generated-assets.txt",
      "assets/opendungeon-assets/runtime/actors/tiny-ranger/walk.png",
      "assets/opendungeon-assets/runtime/actors/tiny-ranger/walk-left.png",
      "assets/opendungeon-assets/runtime/actors/tiny-ranger/walk-right.png",
      "assets/opendungeon-assets/runtime/actors/tiny-ranger/walk-up.png",
      "assets/opendungeon-assets/runtime/actors/tiny-warden/walk.png",
      "assets/opendungeon-assets/runtime/actors/tiny-arcanist/walk.png",
      "assets/opendungeon-assets/runtime/actors/tiny-ghoul/walk.png",
      "assets/opendungeon-assets/runtime/actors/tiny-necromancer/walk.png",
      "assets/opendungeon-assets/runtime/actors/tiny-boss/walk.png",
      "assets/opendungeon-assets/runtime/dice/d20-project-owned.png",
      "assets/opendungeon-assets/runtime/icons/kettoman-rpg-icons-16x16.png",
      "assets/opendungeon-assets/runtime/icons/opendungeon-terminal-icons-8x8.png",
      "assets/opendungeon-assets/runtime/icons/piiixl-terminal-icons-8x8.png",
      "assets/opendungeon-assets/runtime/portraits/portrait-manifest.json",
      "assets/opendungeon-assets/runtime/portraits/portraits-project-owned.png",
      "assets/opendungeon-assets/runtime/sprite-metadata.json",
      "assets/opendungeon-assets/runtime/tiles/terminal-terrain-8x8.png",
      "assets/opendungeon-assets/skills/ai-admin-sprite-generation.md",
    ]) {
      expect(files).toContain(file)
    }
    expect(files.some((file) => file.includes("/runtime/actors/hero-soldier/"))).toBe(false)
    expect(files.some((file) => file.includes("/runtime/actors/crypt-orc/"))).toBe(false)
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
    expect(existsSync("assets/opendungeon-assets/runtime/actors/tiny-ranger/idle.png")).toBe(true)
    expect(existsSync("assets/opendungeon-assets/runtime/actors/tiny-ghoul/idle.png")).toBe(true)
    expect(existsSync("assets/opendungeon-assets/runtime/tiles/terminal-terrain-8x8.png")).toBe(true)
    expect(existsSync("assets/opendungeon-assets/runtime/icons/kettoman-rpg-icons-16x16.png")).toBe(true)
    expect(existsSync("assets/opendungeon-assets/runtime/icons/opendungeon-terminal-icons-8x8.png")).toBe(true)
    expect(existsSync("assets/opendungeon-assets/runtime/icons/piiixl-terminal-icons-8x8.png")).toBe(true)

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
    expect(pixelSpriteSource.includes("fallbackActorSprite")).toBe(true)
    expect(pixelSpriteSource.includes("sourceActorSprite(id, animation, frame, width, height, direction) ?? fallbackActorSprite")).toBe(true)
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
