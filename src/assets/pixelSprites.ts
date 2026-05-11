import { existsSync } from "node:fs"
import {
  animationFrameCount,
  isAnimatedSprite,
  type AnimatedSpriteId,
  type PixelSpriteId,
  type SpriteAnimationId,
  type StaticSpriteId,
} from "./opendungeonSprites.js"
import { assetPath, sampleSourceFrame, type PixelCell, type PixelSprite, type SourceSheet } from "./spriteSampler.js"
import { drawLine, fillEllipse, fillPolygon, fillRect, makeVirtual, makeVirtualSpriteCanvas, spriteFromVirtual } from "./virtualSprites.js"

export type { PixelSpriteId, SpriteAnimationId } from "./opendungeonSprites.js"
export type { PixelSprite } from "./spriteSampler.js"

type RuntimeActorSource = {
  folder: string
  frameWidth: number
  frameHeight: number
  files: Record<SpriteAnimationId, string> & Partial<Record<`${SpriteAnimationId}-${"up" | "down" | "left" | "right"}`, string>>
}

const spriteCache = new Map<string, PixelSprite>()
const runtimeActorSources = {
  "tiny-ranger": actorSheet("tiny-ranger", 18, 18, {
    idle: "idle.png",
    walk: "walk.png",
    "attack-melee": "attack-melee.png",
    "attack-ranged": "attack-ranged.png",
    cast: "attack-ranged.png",
    talk: "idle.png",
    hurt: "hurt.png",
    shocked: "hurt.png",
    death: "death.png",
    "idle-up": "idle-up.png",
    "idle-left": "idle-left.png",
    "idle-right": "idle-right.png",
    "walk-up": "walk-up.png",
    "walk-left": "walk-left.png",
    "walk-right": "walk-right.png",
  }),
  "tiny-warden": actorSheet("tiny-warden", 18, 18, {
    idle: "idle.png",
    walk: "walk.png",
    "attack-melee": "attack-melee.png",
    "attack-ranged": "attack-ranged.png",
    cast: "attack-ranged.png",
    talk: "idle.png",
    hurt: "hurt.png",
    shocked: "hurt.png",
    death: "death.png",
  }),
  "tiny-arcanist": actorSheet("tiny-arcanist", 18, 18, {
    idle: "idle.png",
    walk: "walk.png",
    "attack-melee": "attack-melee.png",
    "attack-ranged": "attack-ranged.png",
    cast: "attack-ranged.png",
    talk: "idle.png",
    hurt: "hurt.png",
    shocked: "hurt.png",
    death: "death.png",
  }),
  "tiny-npc": actorSheet("tiny-npc", 18, 18, {
    idle: "idle.png",
    walk: "walk.png",
    "attack-melee": "attack-melee.png",
    "attack-ranged": "attack-ranged.png",
    cast: "attack-ranged.png",
    talk: "idle.png",
    hurt: "hurt.png",
    shocked: "hurt.png",
    death: "death.png",
  }),
  "tiny-ghoul": actorSheet("tiny-ghoul", 18, 18, {
    idle: "idle.png",
    walk: "walk.png",
    "attack-melee": "attack-melee.png",
    "attack-ranged": "attack-ranged.png",
    cast: "attack-ranged.png",
    talk: "idle.png",
    hurt: "hurt.png",
    shocked: "hurt.png",
    death: "death.png",
  }),
  "tiny-necromancer": actorSheet("tiny-necromancer", 18, 18, {
    idle: "idle.png",
    walk: "walk.png",
    "attack-melee": "attack-melee.png",
    "attack-ranged": "attack-ranged.png",
    cast: "attack-ranged.png",
    talk: "idle.png",
    hurt: "hurt.png",
    shocked: "hurt.png",
    death: "death.png",
  }),
  "tiny-boss": actorSheet("tiny-boss", 18, 18, {
    idle: "idle.png",
    walk: "walk.png",
    "attack-melee": "attack-melee.png",
    "attack-ranged": "attack-ranged.png",
    cast: "attack-ranged.png",
    talk: "idle.png",
    hurt: "hurt.png",
    shocked: "hurt.png",
    death: "death.png",
  }),
} satisfies Record<string, RuntimeActorSource>

const terrainSpriteFrames = {
  "floor-a": 0,
  "floor-b": 1,
  "floor-c": 2,
  "wall-a": 3,
  "wall-b": 4,
} satisfies Partial<Record<StaticSpriteId, number>>

const iconSpriteFrames = {
  potion: 0,
  relic: 1,
  chest: 2,
  coin: 3,
  scroll: 4,
  map: 5,
  sword: 6,
  bow: 7,
  staff: 8,
  dagger: 9,
  axe: 10,
  shield: 11,
  armor: 12,
  key: 13,
  lockpick: 14,
  trap: 15,
  ember: 16,
  "focus-gem": 17,
  dice: 18,
  stairs: 19,
  door: 20,
  pack: 21,
  food: 22,
  gem: 23,
  torch: 24,
  "quest-marker": 25,
} satisfies Partial<Record<StaticSpriteId, number>>

const kettomanIconSpriteFrames = {
  potion: [0, 1],
  relic: [6, 5],
  coin: [2, 5],
  scroll: [0, 6],
  "focus-gem": [5, 1],
  ember: [0, 4],
  sword: [0, 0],
  bow: [3, 0],
  staff: [4, 0],
  dagger: [1, 0],
  axe: [2, 0],
  shield: [6, 0],
  armor: [4, 2],
  key: [7, 0],
  food: [3, 3],
  gem: [5, 1],
  torch: [0, 4],
} satisfies Partial<Record<StaticSpriteId, readonly [number, number]>>

export function pixelSprite(id: PixelSpriteId, width = 8, height = 4): PixelSprite {
  return animatedPixelSprite(id, "idle", 0, width, height)
}

export function animatedPixelSprite(
  id: PixelSpriteId,
  animation: SpriteAnimationId,
  frame = 0,
  width = 8,
  height = 4,
  direction?: "up" | "down" | "left" | "right",
): PixelSprite {
  const key = `${id}:${animation}:${direction ?? "none"}:${frame}:${width}x${height}`
  const cached = spriteCache.get(key)
  if (cached) return cached

  const sprite = isAnimatedSprite(id) ? sourceActorSprite(id, animation, frame, width, height, direction) ?? fallbackActorSprite(id, animation, frame, width, height) : staticSprite(id, width, height)

  spriteCache.set(key, sprite)
  return sprite
}

function sourceActorSprite(id: AnimatedSpriteId, animation: SpriteAnimationId, frame: number, width: number, height: number, direction?: "up" | "down" | "left" | "right") {
  const source = actorSource(id, animation, direction)
  if (!source || !existsSync(source.path)) return null
  return sampleSourceFrame(source, frame, width, height)
}

function actorSource(id: AnimatedSpriteId, animation: SpriteAnimationId, direction?: "up" | "down" | "left" | "right"): SourceSheet | null {
  if (id === "slime") return null
  if (id === "hero-warden") return runtimeActorSource("tiny-warden", animation, direction)
  if (id === "hero-arcanist") return runtimeActorSource("tiny-arcanist", animation, direction)
  if (id === "npc-smith" || id === "npc-oracle") return runtimeActorSource("tiny-npc", animation, direction)
  if (id === "necromancer") return runtimeActorSource("tiny-necromancer", animation, direction)
  if (id.startsWith("boss-")) return runtimeActorSource("tiny-boss", animation, direction)
  if (id === "ghoul") return runtimeActorSource("tiny-ghoul", animation, direction)
  return runtimeActorSource("tiny-ranger", animation, direction)
}

function actorSheet(folder: string, frameWidth: number, frameHeight: number, files: RuntimeActorSource["files"]): RuntimeActorSource {
  return { folder, frameWidth, frameHeight, files }
}

function runtimeActorSource(sourceId: keyof typeof runtimeActorSources, animation: SpriteAnimationId, direction?: "up" | "down" | "left" | "right"): SourceSheet {
  const source = runtimeActorSources[sourceId]
  const directionalFile = direction ? source.files[`${animation}-${direction}`] : undefined
  return {
    path: assetPath("opendungeon-assets", "runtime", "actors", source.folder, directionalFile ?? source.files[animation]),
    frameWidth: source.frameWidth,
    frameHeight: source.frameHeight,
    frameCount: 4,
    preserveFrame: true,
  }
}

function fallbackActorSprite(id: AnimatedSpriteId, animation: SpriteAnimationId, frame: number, width: number, height: number): PixelSprite {
  const { virtualWidth, virtualHeight, pixels } = makeVirtualSpriteCanvas(width, height)
  const palette = actorPalette(id)
  const boss = id.startsWith("boss-")
  const slime = id === "slime"
  const cx = virtualWidth / 2
  const floor = virtualHeight - 2
  const stride = animation === "walk" ? Math.sin(frame * 1.7) * Math.max(1, virtualWidth * 0.05) : 0
  const lean = animation === "attack-melee" || animation === "attack-ranged" || animation === "cast" ? Math.max(1, virtualWidth * 0.08) : 0
  const hurt = animation === "hurt" || animation === "shocked"

  if (slime) {
    fillEllipse(pixels, virtualWidth, virtualHeight, cx, floor - virtualHeight * 0.18, virtualWidth * 0.34, virtualHeight * 0.22, palette.base)
    fillEllipse(pixels, virtualWidth, virtualHeight, cx - virtualWidth * 0.1, floor - virtualHeight * 0.26, virtualWidth * 0.1, virtualHeight * 0.08, palette.light)
    fillRect(pixels, virtualWidth, virtualHeight, cx - virtualWidth * 0.13, floor - virtualHeight * 0.17, Math.max(1, virtualWidth * 0.06), 1, palette.shadow)
    fillRect(pixels, virtualWidth, virtualHeight, cx + virtualWidth * 0.09, floor - virtualHeight * 0.17, Math.max(1, virtualWidth * 0.06), 1, palette.shadow)
    return spriteFromVirtual(pixels, virtualWidth, height)
  }

  const bodyWidth = virtualWidth * (boss ? 0.42 : 0.32)
  const bodyHeight = virtualHeight * (boss ? 0.46 : 0.38)
  const headY = virtualHeight * (boss ? 0.2 : 0.24)
  fillEllipse(pixels, virtualWidth, virtualHeight, cx, floor, bodyWidth * 0.9, Math.max(1, virtualHeight * 0.08), palette.shadow)
  fillRect(pixels, virtualWidth, virtualHeight, cx - bodyWidth / 2 + stride, floor - bodyHeight, bodyWidth, bodyHeight, hurt ? palette.dark : palette.base)
  fillPolygon(pixels, virtualWidth, virtualHeight, [[cx - bodyWidth * 0.58 + stride, floor - bodyHeight], [cx + bodyWidth * 0.58 + stride, floor - bodyHeight], [cx + bodyWidth * 0.36, floor - bodyHeight - virtualHeight * 0.12], [cx - bodyWidth * 0.36, floor - bodyHeight - virtualHeight * 0.12]], palette.trim)
  fillEllipse(pixels, virtualWidth, virtualHeight, cx + stride * 0.4, headY, virtualWidth * (boss ? 0.17 : 0.14), virtualHeight * (boss ? 0.13 : 0.11), palette.skin)
  fillPolygon(pixels, virtualWidth, virtualHeight, [[cx - bodyWidth * 0.45, headY - virtualHeight * 0.03], [cx + bodyWidth * 0.45, headY - virtualHeight * 0.03], [cx + bodyWidth * 0.22, headY + virtualHeight * 0.17], [cx - bodyWidth * 0.22, headY + virtualHeight * 0.17]], palette.dark)
  fillRect(pixels, virtualWidth, virtualHeight, cx - virtualWidth * 0.09, headY, Math.max(1, virtualWidth * 0.04), Math.max(1, virtualHeight * 0.03), palette.light)
  fillRect(pixels, virtualWidth, virtualHeight, cx + virtualWidth * 0.05, headY, Math.max(1, virtualWidth * 0.04), Math.max(1, virtualHeight * 0.03), palette.light)
  drawLine(pixels, virtualWidth, virtualHeight, cx + bodyWidth * 0.3, floor - bodyHeight * 0.68, cx + bodyWidth * 0.68 + lean, floor - bodyHeight * 0.2, palette.weapon)
  drawLine(pixels, virtualWidth, virtualHeight, cx - bodyWidth * 0.25, floor - bodyHeight * 0.6, cx - bodyWidth * 0.55, floor - bodyHeight * 0.25, palette.trim)

  return spriteFromVirtual(pixels, virtualWidth, height)
}

function actorPalette(id: AnimatedSpriteId) {
  if (id === "hero-warden") return { base: "#506b7d", dark: "#263744", trim: "#b7c7d5", skin: "#d5b58f", light: "#e8eef4", shadow: "#091015", weapon: "#d8dee9" }
  if (id === "hero-arcanist" || id === "necromancer" || id === "boss-lich") return { base: "#6c4a8f", dark: "#271c35", trim: "#d65cff", skin: "#c9b8d8", light: "#a9fff4", shadow: "#080811", weapon: "#d65cff" }
  if (id === "npc-smith" || id === "boss-forgemaster") return { base: "#6d4a37", dark: "#271b17", trim: "#ff8f4a", skin: "#d1a47d", light: "#ffd68b", shadow: "#080605", weapon: "#d8dee9" }
  if (id === "npc-oracle") return { base: "#d7d2bf", dark: "#324057", trim: "#6db7ff", skin: "#e0c19a", light: "#fff0a6", shadow: "#0a0d14", weapon: "#f4d06f" }
  if (id === "slime") return { base: "#62c26f", dark: "#16351e", trim: "#9cff9f", skin: "#62c26f", light: "#d8ff9e", shadow: "#06140a", weapon: "#9cff9f" }
  if (id === "ghoul") return { base: "#8a8f83", dark: "#252822", trim: "#9a6041", skin: "#c5ccb6", light: "#e8f0dc", shadow: "#080a08", weapon: "#b88a5b" }
  if (id === "boss-minotaur") return { base: "#75543d", dark: "#211713", trim: "#a33b46", skin: "#a48763", light: "#d6b77d", shadow: "#080504", weapon: "#d8dee9" }
  return { base: "#4d725b", dark: "#18261c", trim: "#d6a85c", skin: "#d8b48e", light: "#f4d06f", shadow: "#07100a", weapon: "#d8dee9" }
}

function staticSprite(id: StaticSpriteId, width: number, height: number): PixelSprite {
  if (id === "void") return solidSprite(width, height, "#05070a")
  const source = staticSource(id)
  if (source && existsSync(source.path)) return sampleSourceFrame(source, 0, width, height)
  if (id === "floor-a" || id === "floor-b" || id === "floor-c") return textureSprite(width, height, floorPalette(id), id)
  if (id === "wall-a" || id === "wall-b") return textureSprite(width, height, wallPalette(id), id)

  const virtualWidth = Math.max(1, width)
  const virtualHeight = Math.max(1, height * 2)
  const pixels = makeVirtual(virtualWidth, virtualHeight)
  drawStaticIcon(pixels, virtualWidth, virtualHeight, id)
  return spriteFromVirtual(pixels, virtualWidth, height)
}

function staticSource(id: StaticSpriteId): SourceSheet | null {
  const kettomanIconFrame = kettomanIconSpriteFrames[id as keyof typeof kettomanIconSpriteFrames]
  if (kettomanIconFrame !== undefined) {
    const [column, row] = kettomanIconFrame
    return {
      path: assetPath("opendungeon-assets", "runtime", "icons", "kettoman-rpg-icons-16x16.png"),
      frameWidth: 16,
      frameHeight: 16,
      frameX: column * 16,
      frameY: row * 16,
      frameCount: 1,
      preserveFrame: true,
    }
  }

  const terrainFrame = terrainSpriteFrames[id as keyof typeof terrainSpriteFrames]
  if (terrainFrame !== undefined) {
    return {
      path: assetPath("opendungeon-assets", "runtime", "tiles", "terminal-terrain-8x8.png"),
      frameWidth: 8,
      frameHeight: 8,
      frameX: terrainFrame * 8,
      frameCount: 1,
      preserveFrame: true,
    }
  }

  const iconFrame = iconSpriteFrames[id as keyof typeof iconSpriteFrames]
  if (iconFrame !== undefined) {
    return {
      path: assetPath("opendungeon-assets", "runtime", "icons", "opendungeon-terminal-icons-8x8.png"),
      frameWidth: 8,
      frameHeight: 8,
      frameX: iconFrame * 8,
      frameCount: 1,
      preserveFrame: true,
    }
  }

  return null
}

function textureSprite(width: number, height: number, palette: string[], seed: string): PixelSprite {
  const cells: PixelCell[][] = []
  for (let y = 0; y < height; y++) {
    const row: PixelCell[] = []
    for (let x = 0; x < width; x++) {
      const n = Math.abs(hash(`${seed}:${x}:${y}`))
      const bg = palette[n % palette.length]
      const fg = palette[(n + 1) % palette.length]
      const detail = n % 11 === 0 || n % 17 === 0
      row.push(detail ? { ch: "▀", fg, bg } : { ch: " ", fg: bg, bg })
    }
    cells.push(row)
  }
  return { width, height, cells }
}

function solidSprite(width: number, height: number, color: string): PixelSprite {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: " ", fg: color, bg: color }))),
  }
}

function floorPalette(id: StaticSpriteId) {
  if (id === "floor-b") return ["#293c40", "#31494a", "#213234", "#3b5654"]
  if (id === "floor-c") return ["#2f333c", "#41404a", "#242933", "#504a56"]
  return ["#24383b", "#30484a", "#203134", "#365653"]
}

function wallPalette(id: StaticSpriteId) {
  if (id === "wall-b") return ["#4b4854", "#5a5864", "#342f39", "#6c6d75"]
  return ["#56606a", "#747c87", "#3b424b", "#89919b"]
}

function drawStaticIcon(pixels: Array<string | undefined>, width: number, height: number, id: StaticSpriteId) {
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  const sx = Math.max(1, Math.floor(width / 8))
  const sy = Math.max(1, Math.floor(height / 8))

  if (id === "stairs") {
    for (let i = 0; i < Math.min(width, height); i += Math.max(1, sx)) fillRect(pixels, width, height, cx - i, cy + i / 2, i + 2, 1, "#c5a05d")
    return
  }
  if (id === "door") {
    fillRect(pixels, width, height, cx - width * 0.18, height * 0.18, width * 0.36, height * 0.62, "#8f5f3b")
    fillRect(pixels, width, height, cx + width * 0.1, cy, sx, sy, "#f4d06f")
    return
  }
  if (id === "potion") {
    fillRect(pixels, width, height, cx - sx, height * 0.18, sx * 2, sy * 2, "#d9ced8")
    fillEllipse(pixels, width, height, cx, cy + sy, width * 0.22, height * 0.25, "#d56b8c")
    fillEllipse(pixels, width, height, cx - sx, cy, width * 0.09, height * 0.1, "#f4a6b8")
    return
  }
  if (id === "relic" || id === "focus-gem" || id === "ember") {
    const color = id === "focus-gem" ? "#d65cff" : id === "ember" ? "#ff8f4a" : "#f4d06f"
    fillPolygon(pixels, width, height, [[cx, cy - height * 0.28], [cx + width * 0.2, cy], [cx, cy + height * 0.28], [cx - width * 0.2, cy]], color)
    drawLine(pixels, width, height, cx, cy - height * 0.22, cx, cy + height * 0.22, "#fff0a6")
    return
  }
  if (id === "chest") {
    fillRect(pixels, width, height, width * 0.22, height * 0.36, width * 0.56, height * 0.32, "#9b6a42")
    fillRect(pixels, width, height, width * 0.22, height * 0.34, width * 0.56, sy * 2, "#c99557")
    fillRect(pixels, width, height, cx - sx, cy, sx * 2, sy * 2, "#f4d06f")
    return
  }
  if (id === "coin") {
    fillEllipse(pixels, width, height, cx, cy, width * 0.2, height * 0.22, "#f4d06f")
    fillEllipse(pixels, width, height, cx - sx, cy - sy, width * 0.08, height * 0.08, "#fff0a6")
    return
  }
  if (id === "scroll" || id === "map") {
    fillRect(pixels, width, height, width * 0.28, height * 0.22, width * 0.42, height * 0.52, "#d7c39a")
    drawLine(pixels, width, height, width * 0.34, height * 0.38, width * 0.62, height * 0.38, "#8d7958")
    drawLine(pixels, width, height, width * 0.34, height * 0.52, width * 0.58, height * 0.52, "#8d7958")
    return
  }
  if (id === "sword" || id === "dagger") {
    drawLine(pixels, width, height, width * 0.28, height * 0.72, width * 0.72, height * 0.18, "#d8dee9")
    drawLine(pixels, width, height, width * 0.34, height * 0.74, width * 0.74, height * 0.22, "#f1f6fb")
    fillRect(pixels, width, height, width * 0.2, height * 0.7, width * 0.2, sy * 2, "#8f5f3b")
    return
  }
  if (id === "bow") {
    drawLine(pixels, width, height, width * 0.62, height * 0.18, width * 0.72, height * 0.5, "#b67a4a")
    drawLine(pixels, width, height, width * 0.72, height * 0.5, width * 0.62, height * 0.82, "#b67a4a")
    drawLine(pixels, width, height, width * 0.34, height * 0.5, width * 0.74, height * 0.5, "#d8dee9")
    return
  }
  if (id === "staff" || id === "axe") {
    drawLine(pixels, width, height, width * 0.35, height * 0.78, width * 0.62, height * 0.2, "#9b6a42")
    fillEllipse(pixels, width, height, width * 0.64, height * 0.18, width * 0.14, height * 0.12, id === "axe" ? "#d8dee9" : "#d65cff")
    return
  }
  if (id === "shield" || id === "armor") {
    fillPolygon(pixels, width, height, [[cx, height * 0.18], [width * 0.72, height * 0.34], [width * 0.64, height * 0.72], [cx, height * 0.84], [width * 0.36, height * 0.72], [width * 0.28, height * 0.34]], "#7893a7")
    fillRect(pixels, width, height, cx - sx, height * 0.28, sx * 2, height * 0.42, "#d8dee9")
    return
  }
  if (id === "key") {
    fillEllipse(pixels, width, height, width * 0.35, height * 0.38, width * 0.12, height * 0.12, "#f4d06f")
    drawLine(pixels, width, height, width * 0.44, height * 0.46, width * 0.72, height * 0.68, "#f4d06f")
    return
  }
  if (id === "trap") {
    for (let i = 0; i < 4; i++) {
      const tx = width * (0.25 + i * 0.14)
      fillPolygon(pixels, width, height, [[tx, height * 0.72], [tx + width * 0.08, height * 0.72], [tx + width * 0.04, height * 0.35]], "#d8dee9")
    }
    return
  }
  if (id === "dice") {
    fillPolygon(pixels, width, height, [[cx, height * 0.18], [width * 0.74, cy], [cx, height * 0.82], [width * 0.26, cy]], "#d56b8c")
    drawLine(pixels, width, height, cx, height * 0.2, cx, height * 0.8, "#f4a6b8")
  }
}

function hash(value: string) {
  let hashValue = 0
  for (let index = 0; index < value.length; index++) hashValue = (hashValue * 31 + value.charCodeAt(index)) | 0
  return hashValue
}
