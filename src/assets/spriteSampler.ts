import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { PNG } from "pngjs"
import { makeVirtual, rgbToHex, setVirtual, spriteFromVirtual } from "./virtualSprites.js"

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

export type SourceSheet = {
  path: string
  frameWidth: number
  frameHeight: number
  frameCount?: number
}

type Bounds = {
  x: number
  y: number
  width: number
  height: number
}

const sheetCache = new Map<string, PNG>()
const moduleDir = dirname(fileURLToPath(import.meta.url))

export function sampleSourceFrame(source: SourceSheet, frame: number, width: number, height: number): PixelSprite {
  const sheet = loadSheet(source.path)
  const frameCount = source.frameCount ?? Math.max(1, Math.floor(sheet.width / source.frameWidth))
  const sourceFrame = wrap(Math.round(frame), frameCount)
  const frameX = sourceFrame * source.frameWidth
  const frameY = 0
  const bounds = contentBounds(sheet, frameX, frameY, source.frameWidth, source.frameHeight)
  const virtualWidth = Math.max(1, width)
  const virtualHeight = Math.max(1, height * 2)
  const pixels = makeVirtual(virtualWidth, virtualHeight)
  const marginX = width >= 10 ? 1 : 0
  const marginY = height >= 5 ? 1 : 0
  const scale = Math.min(
    Math.max(1, virtualWidth - marginX * 2) / bounds.width,
    Math.max(1, virtualHeight - marginY * 2) / bounds.height,
  )
  const drawWidth = Math.max(1, Math.round(bounds.width * scale))
  const drawHeight = Math.max(1, Math.round(bounds.height * scale))
  const offsetX = Math.floor((virtualWidth - drawWidth) / 2)
  const offsetY = Math.floor((virtualHeight - drawHeight) / 2)

  for (let y = 0; y < virtualHeight; y++) {
    for (let x = 0; x < virtualWidth; x++) {
      const localX = x - offsetX
      const localY = y - offsetY
      if (localX < 0 || localY < 0 || localX >= drawWidth || localY >= drawHeight) continue
      const sx = clamp(bounds.x + Math.floor(localX / scale), frameX, frameX + source.frameWidth - 1)
      const sy = clamp(bounds.y + Math.floor(localY / scale), frameY, frameY + source.frameHeight - 1)
      const color = samplePngPixel(sheet, sx, sy)
      if (color) setVirtual(pixels, virtualWidth, virtualHeight, x, y, color)
    }
  }

  return spriteFromVirtual(pixels, virtualWidth, height)
}

export function assetPath(...parts: string[]) {
  return resolve(assetRoot(), ...parts)
}

function assetRoot() {
  const configured = process.env.OPENDUNGEON_ASSET_DIR
  const candidates = [
    configured,
    resolve(process.cwd(), "assets"),
    resolve(moduleDir, "../../assets"),
    resolve(moduleDir, "../assets"),
    resolve(dirname(process.execPath), "assets"),
    resolve(dirname(process.execPath), "../assets"),
    resolve(dirname(process.execPath), "../share/opendungeon/assets"),
    resolve(dirname(process.execPath), "../lib/opendungeon/assets"),
  ].filter(Boolean) as string[]

  return candidates.find((candidate) => existsSync(resolve(candidate, "opendungeon-assets"))) ?? candidates[0] ?? resolve(process.cwd(), "assets")
}

function loadSheet(path: string) {
  const cached = sheetCache.get(path)
  if (cached) return cached
  const png = PNG.sync.read(readFileSync(path))
  sheetCache.set(path, png)
  return png
}

function contentBounds(sheet: PNG, frameX: number, frameY: number, width: number, height: number): Bounds {
  let minX = frameX + width
  let minY = frameY + height
  let maxX = frameX
  let maxY = frameY

  for (let y = frameY; y < frameY + height; y++) {
    for (let x = frameX; x < frameX + width; x++) {
      const index = (sheet.width * y + x) << 2
      if (sheet.data[index + 3] < 36) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return { x: frameX, y: frameY, width, height }
  return {
    x: clamp(minX - 2, frameX, frameX + width - 1),
    y: clamp(minY - 2, frameY, frameY + height - 1),
    width: clamp(maxX - minX + 5, 1, width),
    height: clamp(maxY - minY + 5, 1, height),
  }
}

function samplePngPixel(sheet: PNG, x: number, y: number) {
  const index = (sheet.width * y + x) << 2
  const alpha = sheet.data[index + 3]
  if (alpha < 36) return undefined
  return rgbToHex(sheet.data[index], sheet.data[index + 1], sheet.data[index + 2])
}

function wrap(value: number, count: number) {
  return ((value % count) + count) % count
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
