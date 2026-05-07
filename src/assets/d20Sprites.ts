import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PNG } from "pngjs"
import { sourceTileSize } from "./opendungeonSprites.js"
import type { PixelCell, PixelSprite } from "./pixelSprites.js"

const frameCount = 12
const resultCount = 20
let sheet: PNG | null = null
const cache = new Map<string, PixelSprite>()

export function d20RollSprite(result: number, frame: number, width = 10, height = 5): PixelSprite {
  const safeResult = clamp(Math.round(result), 1, resultCount)
  const safeFrame = clamp(Math.round(frame), 0, frameCount - 1)
  const key = `${safeResult}:${safeFrame}:${width}x${height}`
  const cached = cache.get(key)
  if (cached) return cached

  const d20Sheet = loadSheet()
  const sprite: PixelSprite = {
    width,
    height,
    cells: Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, col) => sampleCell(d20Sheet, safeResult, safeFrame, col, row, width, height)),
    ),
  }

  cache.set(key, sprite)
  return sprite
}

export function d20FrameCount() {
  return frameCount
}

function loadSheet() {
  if (sheet) return sheet
  sheet = PNG.sync.read(readFileSync(resolve(process.cwd(), "assets/opendungeon/d20.png")))
  return sheet
}

function sampleCell(
  d20Sheet: PNG,
  result: number,
  frame: number,
  col: number,
  row: number,
  width: number,
  height: number,
): PixelCell {
  const frameX = frame * sourceTileSize
  const frameY = (result - 1) * sourceTileSize
  const startX = frameX + Math.floor((col * sourceTileSize) / width)
  const endX = frameX + Math.floor(((col + 1) * sourceTileSize) / width)
  const startY = frameY + Math.floor((row * sourceTileSize) / height)
  const endY = frameY + Math.floor(((row + 1) * sourceTileSize) / height)
  const counts = new Map<string, number>()
  let visiblePixels = 0

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = (d20Sheet.width * y + x) << 2
      const alpha = d20Sheet.data[index + 3]
      if (alpha < 40) continue
      visiblePixels += 1
      const color = rgbToHex(d20Sheet.data[index], d20Sheet.data[index + 1], d20Sheet.data[index + 2])
      counts.set(color, (counts.get(color) ?? 0) + alpha)
    }
  }

  const area = Math.max(1, (endX - startX) * (endY - startY))
  if (visiblePixels < Math.max(1, Math.floor(area / 9))) return { ch: " ", fg: "#000000" }

  const color = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#d8dee9"
  return { ch: "█", fg: color }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0")
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
