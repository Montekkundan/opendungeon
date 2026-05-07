import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PNG } from "pngjs"
import type { PixelCell, PixelSprite } from "./pixelSprites.js"

const frameSize = 512
const frameCount = 12
const sheets = new Map<number, PNG>()
const cache = new Map<string, PixelSprite>()

export function d20RollSprite(result: number, frame: number, width = 10, height = 5): PixelSprite {
  const safeResult = clamp(Math.round(result), 1, 20)
  const safeFrame = clamp(Math.round(frame), 0, frameCount - 1)
  const key = `${safeResult}:${safeFrame}:${width}x${height}`
  const cached = cache.get(key)
  if (cached) return cached

  const sheet = loadSheet(safeResult)
  const sprite: PixelSprite = {
    width,
    height,
    cells: Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, col) => sampleCell(sheet, safeFrame, col, row, width, height)),
    ),
  }

  cache.set(key, sprite)
  return sprite
}

export function d20FrameCount() {
  return frameCount
}

function loadSheet(result: number) {
  const cached = sheets.get(result)
  if (cached) return cached

  const filename = `r${String(result).padStart(2, "0")}.png`
  const path = resolve(process.cwd(), "assets/opengameart-d20", filename)
  const png = PNG.sync.read(readFileSync(path))
  sheets.set(result, png)
  return png
}

function sampleCell(sheet: PNG, frame: number, col: number, row: number, width: number, height: number): PixelCell {
  const frameX = frame * frameSize
  const startX = frameX + Math.floor((col * frameSize) / width)
  const endX = frameX + Math.floor(((col + 1) * frameSize) / width)
  const startY = Math.floor((row * frameSize) / height)
  const endY = Math.floor(((row + 1) * frameSize) / height)
  const counts = new Map<string, number>()
  let visiblePixels = 0

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const index = (sheet.width * y + x) << 2
      const alpha = sheet.data[index + 3]
      if (alpha < 40) continue
      visiblePixels += 1
      const color = rgbToHex(sheet.data[index], sheet.data[index + 1], sheet.data[index + 2])
      counts.set(color, (counts.get(color) ?? 0) + alpha)
    }
  }

  const area = (endX - startX) * (endY - startY)
  if (visiblePixels < Math.max(1, Math.floor(area / 8))) return { ch: " ", fg: "#000000" }

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
