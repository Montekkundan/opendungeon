import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PNG } from "pngjs"
import {
  cropForSprite,
  sourceTileSize,
  spriteSheetPaths,
  type PixelSpriteId,
  type SpriteAnimationId,
  type SpriteCrop,
  type SpriteSheetId,
} from "./opendungeonSprites.js"

export type { AnimatedSpriteId, PixelSpriteId, SpriteAnimationId } from "./opendungeonSprites.js"

export type PixelCell = {
  ch: string
  fg: string
  bg?: string
}

export type PixelSprite = {
  width: number
  height: number
  cells: PixelCell[][]
}

const loadedSheets = new Map<SpriteSheetId, PNG>()
const spriteCache = new Map<string, PixelSprite>()

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

  const crop = cropForSprite(id, animation, frame)
  const sheet = loadSheet(crop.sheet)
  const sprite: PixelSprite = {
    width,
    height,
    cells: Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, col) => sampleCell(sheet, crop, col, row, width, height)),
    ),
  }

  spriteCache.set(key, sprite)
  return sprite
}

function loadSheet(id: SpriteSheetId) {
  const cached = loadedSheets.get(id)
  if (cached) return cached

  const path = resolve(process.cwd(), spriteSheetPaths[id])
  const png = PNG.sync.read(readFileSync(path))
  loadedSheets.set(id, png)
  return png
}

function sampleCell(sheet: PNG, crop: SpriteCrop, col: number, row: number, width: number, height: number): PixelCell {
  const cropX = crop.tileX * sourceTileSize
  const cropY = crop.tileY * sourceTileSize
  const startX = cropX + Math.floor((col * sourceTileSize) / width)
  const endX = cropX + Math.floor(((col + 1) * sourceTileSize) / width)
  const startY = cropY + Math.floor((row * sourceTileSize) / height)
  const endY = cropY + Math.floor(((row + 1) * sourceTileSize) / height)
  const counts = new Map<string, number>()
  let visiblePixels = 0

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = (sheet.width * y + x) << 2
      const alpha = sheet.data[index + 3]
      if (alpha < 32) continue
      visiblePixels += 1
      const color = rgbToHex(sheet.data[index], sheet.data[index + 1], sheet.data[index + 2])
      counts.set(color, (counts.get(color) ?? 0) + alpha)
    }
  }

  const area = Math.max(1, (endX - startX) * (endY - startY))
  if (crop.transparent && visiblePixels < Math.max(1, Math.floor(area / 7))) return { ch: " ", fg: "#000000" }

  const color = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#05070a"
  return crop.transparent ? { ch: "█", fg: color } : { ch: " ", fg: color, bg: color }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0")
}
