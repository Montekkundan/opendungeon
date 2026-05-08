import { existsSync, readFileSync } from "node:fs"
import {
  animatedSpriteIds,
  animationFrameCount,
  spriteAnimations,
  staticSpriteIds,
  type AnimatedSpriteId,
  type SpriteAnimationId,
  type StaticSpriteId,
} from "./opendungeonSprites.js"
import { assetPath } from "./spriteSampler.js"

export const requiredSpriteFrameTagIds = ["windup", "impact", "recover", "cast-loop", "pickup", "block", "open"] as const

export const spriteFrameTagIds = [
  "idle",
  "stride",
  "windup",
  "impact",
  "recover",
  "release",
  "cast-loop",
  "pickup",
  "block",
  "open",
  "talk",
  "down",
] as const

export type SpriteFrameTagId = (typeof spriteFrameTagIds)[number]

export type SpriteHitbox = {
  x: number
  y: number
  width: number
  height: number
}

export type SpriteSocket = {
  x: number
  y: number
}

export type CharacterSpriteMetadata = {
  hitbox: SpriteHitbox
  paletteNotes: string[]
  weaponSocket: SpriteSocket
  dialogPortraitId: string
}

export type SpriteMetadataManifest = {
  version: 1
  frameTags: Record<SpriteAnimationId, SpriteFrameTagId[]>
  staticFrameTags: Partial<Record<StaticSpriteId, SpriteFrameTagId[]>>
  characters: Record<AnimatedSpriteId, CharacterSpriteMetadata>
}

let cachedManifest: SpriteMetadataManifest | null = null

export function loadSpriteMetadataManifest(path = spriteMetadataPath()): SpriteMetadataManifest {
  if (cachedManifest && path === spriteMetadataPath()) return cachedManifest
  if (!existsSync(path)) throw new Error(`Sprite metadata manifest missing: ${path}`)
  const parsed = JSON.parse(readFileSync(path, "utf8")) as SpriteMetadataManifest
  const errors = validateSpriteMetadataManifest(parsed)
  if (errors.length) throw new Error(`Invalid sprite metadata manifest: ${errors.join(" ")}`)
  if (path === spriteMetadataPath()) cachedManifest = parsed
  return parsed
}

export function spriteMetadataPath() {
  return assetPath("opendungeon-assets", "runtime", "sprite-metadata.json")
}

export function frameTagsForAnimation(animation: SpriteAnimationId, manifest = loadSpriteMetadataManifest()) {
  return [...manifest.frameTags[animation]]
}

export function frameTagsForStaticSprite(id: StaticSpriteId, manifest = loadSpriteMetadataManifest()) {
  return [...(manifest.staticFrameTags[id] ?? [])]
}

export function characterMetadata(id: AnimatedSpriteId, manifest = loadSpriteMetadataManifest()) {
  return manifest.characters[id] ?? null
}

export function allCharacterMetadata(manifest = loadSpriteMetadataManifest()) {
  return { ...manifest.characters }
}

export function validateSpriteMetadataManifest(manifest: Partial<SpriteMetadataManifest> | undefined): string[] {
  const errors: string[] = []
  if (!manifest || manifest.version !== 1) errors.push("version must be 1.")
  const knownTags = new Set<string>(spriteFrameTagIds)
  const usedTags = new Set<string>()
  const frameTags = (manifest?.frameTags ?? {}) as Partial<Record<SpriteAnimationId, SpriteFrameTagId[]>>

  for (const animation of spriteAnimations) {
    const tags = frameTags[animation]
    if (!Array.isArray(tags)) {
      errors.push(`animation ${animation} is missing frame tags.`)
      continue
    }
    if (tags.length !== animationFrameCount) errors.push(`animation ${animation} must have ${animationFrameCount} frame tags.`)
    for (const tag of tags) {
      usedTags.add(String(tag))
      if (!knownTags.has(String(tag))) errors.push(`animation ${animation} uses unknown frame tag ${String(tag)}.`)
    }
  }

  const staticTags = manifest?.staticFrameTags ?? {}
  for (const [id, tags] of Object.entries(staticTags)) {
    if (!(staticSpriteIds as readonly string[]).includes(id)) errors.push(`static sprite ${id} is unknown.`)
    if (!Array.isArray(tags)) {
      errors.push(`static sprite ${id} tags must be an array.`)
      continue
    }
    for (const tag of tags) {
      usedTags.add(String(tag))
      if (!knownTags.has(String(tag))) errors.push(`static sprite ${id} uses unknown frame tag ${String(tag)}.`)
    }
  }

  for (const tag of requiredSpriteFrameTagIds) {
    if (!usedTags.has(tag)) errors.push(`required frame tag ${tag} is unused.`)
  }

  const characters = (manifest?.characters ?? {}) as Partial<Record<AnimatedSpriteId, CharacterSpriteMetadata>>
  for (const id of animatedSpriteIds) {
    const metadata = characters[id]
    if (!metadata) {
      errors.push(`character ${id} is missing metadata.`)
      continue
    }
    validateCharacterMetadata(id, metadata, errors)
  }

  for (const id of Object.keys(characters)) {
    if (!(animatedSpriteIds as readonly string[]).includes(id)) errors.push(`character ${id} is not an animated sprite id.`)
  }

  return errors
}

function validateCharacterMetadata(id: string, metadata: Partial<CharacterSpriteMetadata>, errors: string[]) {
  const hitbox = metadata.hitbox
  if (!hitbox || !validBox(hitbox)) errors.push(`character ${id} has an invalid hitbox.`)
  const weaponSocket = metadata.weaponSocket
  if (!weaponSocket || !validPoint(weaponSocket)) errors.push(`character ${id} has an invalid weapon socket.`)
  if (!Array.isArray(metadata.paletteNotes) || metadata.paletteNotes.length === 0) errors.push(`character ${id} needs palette notes.`)
  if (!metadata.dialogPortraitId || typeof metadata.dialogPortraitId !== "string") errors.push(`character ${id} needs a dialog portrait id.`)
}

function validBox(box: Partial<SpriteHitbox>) {
  return validPoint(box) && positiveNumber(box.width) && positiveNumber(box.height)
}

function validPoint(point: Partial<SpriteSocket>) {
  return boundedNumber(point.x) && boundedNumber(point.y)
}

function boundedNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 64
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 64
}
