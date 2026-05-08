import { existsSync, readFileSync } from "node:fs"
import {
  animatedSpriteIds,
  isAnimatedSprite,
  type AnimatedSpriteId,
  type PixelSpriteId,
} from "./opendungeonSprites.js"
import { characterMetadata } from "./spriteMetadata.js"
import { assetPath, sampleSourceFrame, type PixelSprite, type SourceSheet } from "./spriteSampler.js"
import { fillEllipse, fillPolygon, fillRect, makeVirtual, spriteFromVirtual } from "./virtualSprites.js"

export const portraitIds = [
  "portrait.hero-ranger",
  "portrait.hero-warden",
  "portrait.hero-arcanist",
  "portrait.npc-smith",
  "portrait.npc-oracle",
  "portrait.slime",
  "portrait.ghoul",
  "portrait.necromancer",
  "portrait.boss-forgemaster",
  "portrait.boss-lich",
  "portrait.boss-minotaur",
] as const

export type PortraitId = (typeof portraitIds)[number]

export type PortraitManifest = {
  version: 1
  sheet: {
    path: string
    frameWidth: number
    frameHeight: number
  }
  portraits: Record<PortraitId, { frame: number; uses: string[] }>
}

let cachedPortraitManifest: PortraitManifest | null = null

export function loadPortraitManifest(path = portraitManifestPath()): PortraitManifest {
  if (cachedPortraitManifest && path === portraitManifestPath()) return cachedPortraitManifest
  const parsed = JSON.parse(readFileSync(path, "utf8")) as PortraitManifest
  const errors = validatePortraitManifest(parsed)
  if (errors.length) throw new Error(`Invalid portrait manifest: ${errors.join(" ")}`)
  if (path === portraitManifestPath()) cachedPortraitManifest = parsed
  return parsed
}

export function portraitManifestPath() {
  return assetPath("opendungeon-assets", "runtime", "portraits", "portrait-manifest.json")
}

export function validatePortraitManifest(manifest: Partial<PortraitManifest> | undefined): string[] {
  const errors: string[] = []
  if (!manifest || manifest.version !== 1) errors.push("version must be 1.")
  if (!manifest?.sheet?.path || typeof manifest.sheet.path !== "string") errors.push("sheet path is required.")
  if (!positiveNumber(manifest?.sheet?.frameWidth)) errors.push("sheet frameWidth must be positive.")
  if (!positiveNumber(manifest?.sheet?.frameHeight)) errors.push("sheet frameHeight must be positive.")
  const portraits = (manifest?.portraits ?? {}) as Partial<PortraitManifest["portraits"]>
  portraitIds.forEach((id, index) => {
    const portrait = portraits[id]
    if (!portrait) {
      errors.push(`${id} is missing.`)
      return
    }
    if (!Number.isInteger(portrait.frame) || portrait.frame < 0) errors.push(`${id} needs a non-negative frame.`)
    if (portrait.frame !== index) errors.push(`${id} should use frame ${index}.`)
    if (!Array.isArray(portrait.uses) || portrait.uses.length === 0) errors.push(`${id} needs at least one use.`)
  })
  Object.keys(portraits).forEach((id) => {
    if (!(portraitIds as readonly string[]).includes(id)) errors.push(`${id} is not a known portrait id.`)
  })
  return errors
}

export function portraitIdForSprite(id: PixelSpriteId): PortraitId | null {
  if (!isAnimatedSprite(id)) return null
  const metadataId = characterMetadata(id)?.dialogPortraitId
  return isPortraitId(metadataId) ? metadataId : null
}

export function portraitSprite(id: PortraitId, width = 18, height = 9): PixelSprite {
  const manifest = loadPortraitManifest()
  const portrait = manifest.portraits[id]
  const sheetPath = assetPath("opendungeon-assets", "runtime", "portraits", manifest.sheet.path)
  if (portrait && existsSync(sheetPath)) {
    const source: SourceSheet = {
      path: sheetPath,
      frameWidth: manifest.sheet.frameWidth,
      frameHeight: manifest.sheet.frameHeight,
      frameCount: portraitIds.length,
    }
    return sampleSourceFrame(source, portrait.frame, width, height)
  }
  return fallbackPortraitSprite(id, width, height)
}

export function validatePortraitSpriteCoverage(manifest = loadPortraitManifest()): string[] {
  const errors = validatePortraitManifest(manifest)
  const metadataPortraits = new Set(animatedSpriteIds.map((id) => characterMetadata(id)?.dialogPortraitId))
  for (const id of portraitIds) if (!metadataPortraits.has(id)) errors.push(`${id} is not referenced by character metadata.`)
  return errors
}

function fallbackPortraitSprite(id: PortraitId, width: number, height: number): PixelSprite {
  const virtualWidth = Math.max(1, width)
  const virtualHeight = Math.max(1, height * 2)
  const pixels = makeVirtual(virtualWidth, virtualHeight)
  const palette = portraitPalette(id)
  const cx = virtualWidth / 2
  const faceY = virtualHeight * 0.38
  fillRect(pixels, virtualWidth, virtualHeight, 0, 0, virtualWidth, virtualHeight, palette.back)
  fillEllipse(pixels, virtualWidth, virtualHeight, cx, virtualHeight * 0.86, virtualWidth * 0.42, virtualHeight * 0.24, palette.shadow)
  fillPolygon(pixels, virtualWidth, virtualHeight, [[cx - virtualWidth * 0.33, virtualHeight * 0.42], [cx + virtualWidth * 0.33, virtualHeight * 0.42], [cx + virtualWidth * 0.44, virtualHeight], [cx - virtualWidth * 0.44, virtualHeight]], palette.body)
  fillEllipse(pixels, virtualWidth, virtualHeight, cx, faceY, virtualWidth * 0.19, virtualHeight * 0.17, palette.skin)
  fillPolygon(pixels, virtualWidth, virtualHeight, [[cx - virtualWidth * 0.25, faceY - virtualHeight * 0.08], [cx + virtualWidth * 0.25, faceY - virtualHeight * 0.08], [cx + virtualWidth * 0.15, faceY + virtualHeight * 0.14], [cx - virtualWidth * 0.15, faceY + virtualHeight * 0.14]], palette.trim)
  fillRect(pixels, virtualWidth, virtualHeight, cx - virtualWidth * 0.11, faceY, Math.max(1, virtualWidth * 0.04), Math.max(1, virtualHeight * 0.03), palette.light)
  fillRect(pixels, virtualWidth, virtualHeight, cx + virtualWidth * 0.07, faceY, Math.max(1, virtualWidth * 0.04), Math.max(1, virtualHeight * 0.03), palette.light)
  return spriteFromVirtual(pixels, virtualWidth, height)
}

function isPortraitId(value: unknown): value is PortraitId {
  return typeof value === "string" && (portraitIds as readonly string[]).includes(value)
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function portraitPalette(id: PortraitId) {
  if (id.includes("warden")) return { back: "#13212a", body: "#506b7d", trim: "#b7c7d5", skin: "#d5b58f", light: "#e8eef4", shadow: "#05090c" }
  if (id.includes("arcanist") || id.includes("necromancer") || id.includes("lich")) return { back: "#160f22", body: "#6c4a8f", trim: "#d65cff", skin: "#c9b8d8", light: "#a9fff4", shadow: "#05040a" }
  if (id.includes("smith") || id.includes("forgemaster")) return { back: "#1e1410", body: "#6d4a37", trim: "#ff8f4a", skin: "#d1a47d", light: "#ffd68b", shadow: "#070504" }
  if (id.includes("oracle")) return { back: "#111a25", body: "#d7d2bf", trim: "#6db7ff", skin: "#e0c19a", light: "#fff0a6", shadow: "#070a10" }
  if (id.includes("slime")) return { back: "#07170d", body: "#62c26f", trim: "#9cff9f", skin: "#62c26f", light: "#d8ff9e", shadow: "#030804" }
  if (id.includes("ghoul")) return { back: "#12140f", body: "#8a8f83", trim: "#9a6041", skin: "#c5ccb6", light: "#e8f0dc", shadow: "#050604" }
  if (id.includes("minotaur")) return { back: "#1b0f0e", body: "#75543d", trim: "#a33b46", skin: "#a48763", light: "#d6b77d", shadow: "#070403" }
  return { back: "#101b15", body: "#4d725b", trim: "#d6a85c", skin: "#d8b48e", light: "#f4d06f", shadow: "#050a07" }
}
