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
import { drawLine, fillPolygon, fillRect, makeVirtual, setVirtual, spriteFromVirtual } from "./virtualSprites.js"

export type { PixelSpriteId, SpriteAnimationId } from "./opendungeonSprites.js"
export type { PixelCell, PixelSprite } from "./spriteSampler.js"

type RuntimeActorSource = {
  folder: string
  frameWidth: number
  frameHeight: number
  files: Record<SpriteAnimationId, string>
}

const spriteCache = new Map<string, PixelSprite>()
const runtimeActorSources = {
  "hero-soldier": actorSheet("hero-soldier", 100, 100, {
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
  "crypt-orc": actorSheet("crypt-orc", 100, 100, {
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
  "mire-slime": actorSheet("mire-slime", 80, 64, {
    idle: "idle.png",
    walk: "walk.png",
    "attack-melee": "attack.png",
    "attack-ranged": "attack.png",
    cast: "attack.png",
    talk: "idle.png",
    hurt: "hurt.png",
    shocked: "shocked.png",
    death: "death.png",
  }),
  warden: actorSheet("warden", 96, 96, {
    idle: "idle.png",
    walk: "walk.png",
    "attack-melee": "attack.png",
    "attack-ranged": "attack.png",
    cast: "attack.png",
    talk: "idle.png",
    hurt: "hurt.png",
    shocked: "hurt.png",
    death: "hurt.png",
  }),
} satisfies Record<string, RuntimeActorSource>

export function pixelSprite(id: PixelSpriteId, width = 8, height = 4): PixelSprite {
  return animatedPixelSprite(id, "idle", 0, width, height)
}

export function animatedPixelSprite(
  id: PixelSpriteId,
  animation: SpriteAnimationId,
  frame = 0,
  width = 8,
  height = 4,
): PixelSprite {
  const key = `${id}:${animation}:${frame}:${width}x${height}`
  const cached = spriteCache.get(key)
  if (cached) return cached

  const sprite = isAnimatedSprite(id) ? sourceActorSprite(id, animation, frame, width, height) ?? emptySprite(width, height) : staticSprite(id, width, height)

  spriteCache.set(key, sprite)
  return sprite
}

function sourceActorSprite(id: AnimatedSpriteId, animation: SpriteAnimationId, frame: number, width: number, height: number) {
  const source = actorSource(id, animation)
  if (!source || !existsSync(source.path)) return null
  return sampleSourceFrame(source, frame, width, height)
}

function actorSource(id: AnimatedSpriteId, animation: SpriteAnimationId): SourceSheet | null {
  if (id === "slime") return runtimeActorSource("mire-slime", animation)
  if (id === "hero-warden") return runtimeActorSource("warden", animation)
  if (id === "ghoul" || id === "necromancer" || id.startsWith("boss-")) return runtimeActorSource("crypt-orc", animation)
  return runtimeActorSource("hero-soldier", animation)
}

function actorSheet(folder: string, frameWidth: number, frameHeight: number, files: RuntimeActorSource["files"]): RuntimeActorSource {
  return { folder, frameWidth, frameHeight, files }
}

function runtimeActorSource(sourceId: keyof typeof runtimeActorSources, animation: SpriteAnimationId): SourceSheet {
  const source = runtimeActorSources[sourceId]
  return {
    path: assetPath("opendungeon-assets", "runtime", "actors", source.folder, source.files[animation]),
    frameWidth: source.frameWidth,
    frameHeight: source.frameHeight,
  }
}

function staticSprite(id: StaticSpriteId, width: number, height: number): PixelSprite {
  if (id === "floor-a" || id === "floor-b" || id === "floor-c") return textureSprite(width, height, floorPalette(id), id)
  if (id === "wall-a" || id === "wall-b") return textureSprite(width, height, wallPalette(id), id)
  if (id === "void") return solidSprite(width, height, "#05070a")

  const virtualWidth = Math.max(1, width)
  const virtualHeight = Math.max(1, height * 2)
  const pixels = makeVirtual(virtualWidth, virtualHeight)
  drawStaticIcon(pixels, virtualWidth, virtualHeight, id)
  return spriteFromVirtual(pixels, virtualWidth, height)
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

function emptySprite(width: number, height: number): PixelSprite {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: " ", fg: "#000000" }))),
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

function fillEllipse(pixels: Array<string | undefined>, width: number, height: number, cx: number, cy: number, rx: number, ry: number, color: string) {
  const minX = Math.floor(cx - rx)
  const maxX = Math.ceil(cx + rx)
  const minY = Math.floor(cy - ry)
  const maxY = Math.ceil(cy + ry)
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / Math.max(1, rx)
      const dy = (y - cy) / Math.max(1, ry)
      if (dx * dx + dy * dy <= 1) setVirtual(pixels, width, height, x, y, color)
    }
  }
}

function hash(value: string) {
  let hashValue = 0
  for (let index = 0; index < value.length; index++) hashValue = (hashValue * 31 + value.charCodeAt(index)) | 0
  return hashValue
}
