import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { PNG } from "pngjs"
import {
  animationFrameCount,
  isAnimatedSprite,
  type AnimatedSpriteId,
  type PixelSpriteId,
  type SpriteAnimationId,
  type StaticSpriteId,
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

type SourceSheet = {
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

const spriteCache = new Map<string, PixelSprite>()
const sheetCache = new Map<string, PNG>()
const moduleDir = dirname(fileURLToPath(import.meta.url))

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
  if (id === "slime") return mushroomSource(animation)
  if (id === "hero-warden") return samuraiSource(animation)
  if (id === "ghoul" || id === "necromancer" || id.startsWith("boss-")) return zerieSource("Orc", animation)
  return zerieSource("Soldier", animation)
}

function zerieSource(actor: "Soldier" | "Orc", animation: SpriteAnimationId): SourceSheet {
  const base = assetPath("itch", "zerie", "tiny-rpg-free", "characters", actor.toLowerCase())
  const attack = actor === "Soldier" ? "Attack03" : "Attack02"
  const file =
    animation === "walk"
      ? `${actor}-Walk.png`
      : animation === "attack-melee"
        ? `${actor}-Attack01.png`
        : animation === "attack-ranged" || animation === "cast"
          ? `${actor}-${attack}.png`
          : animation === "hurt" || animation === "shocked"
            ? `${actor}-Hurt.png`
            : animation === "death"
              ? `${actor}-Death.png`
              : `${actor}-Idle.png`
  return { path: resolve(base, file), frameWidth: 100, frameHeight: 100 }
}

function samuraiSource(animation: SpriteAnimationId): SourceSheet {
  const base = assetPath("itch", "samurai-free", "sprites")
  const file =
    animation === "walk"
      ? "RUN.png"
      : animation === "attack-melee" || animation === "attack-ranged" || animation === "cast"
        ? "ATTACK 1.png"
        : animation === "hurt" || animation === "shocked" || animation === "death"
          ? "HURT.png"
          : "IDLE.png"
  return { path: resolve(base, file), frameWidth: 96, frameHeight: 96 }
}

function mushroomSource(animation: SpriteAnimationId): SourceSheet {
  const base = assetPath("itch", "forest-monsters-free", "mushroom-without-vfx")
  const file =
    animation === "walk"
      ? "Mushroom-Run.png"
      : animation === "attack-melee" || animation === "attack-ranged" || animation === "cast"
        ? "Mushroom-Attack.png"
        : animation === "hurt"
          ? "Mushroom-Hit.png"
          : animation === "shocked"
            ? "Mushroom-Stun.png"
            : animation === "death"
              ? "Mushroom-Die.png"
              : "Mushroom-Idle.png"
  return { path: resolve(base, file), frameWidth: 80, frameHeight: 64 }
}

function sampleSourceFrame(source: SourceSheet, frame: number, width: number, height: number): PixelSprite {
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

function loadSheet(path: string) {
  const cached = sheetCache.get(path)
  if (cached) return cached
  const png = PNG.sync.read(readFileSync(path))
  sheetCache.set(path, png)
  return png
}

function assetPath(...parts: string[]) {
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

  return candidates.find((candidate) => existsSync(resolve(candidate, "itch"))) ?? candidates[0] ?? resolve(process.cwd(), "assets")
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

function makeVirtual(width: number, height: number) {
  return Array.from<string | undefined>({ length: width * height })
}

function setVirtual(pixels: Array<string | undefined>, width: number, height: number, x: number, y: number, color: string) {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= width || py >= height) return
  pixels[py * width + px] = color
}

function fillRect(pixels: Array<string | undefined>, width: number, height: number, x: number, y: number, w: number, h: number, color: string) {
  const startX = Math.floor(x)
  const startY = Math.floor(y)
  const endX = Math.ceil(x + w)
  const endY = Math.ceil(y + h)
  for (let py = startY; py < endY; py++) for (let px = startX; px < endX; px++) setVirtual(pixels, width, height, px, py, color)
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

function fillPolygon(pixels: Array<string | undefined>, width: number, height: number, points: Array<[number, number]>, color: string) {
  const minX = Math.floor(Math.min(...points.map((point) => point[0])))
  const maxX = Math.ceil(Math.max(...points.map((point) => point[0])))
  const minY = Math.floor(Math.min(...points.map((point) => point[1])))
  const maxY = Math.ceil(Math.max(...points.map((point) => point[1])))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) if (insidePolygon(x + 0.5, y + 0.5, points)) setVirtual(pixels, width, height, x, y, color)
  }
}

function drawLine(pixels: Array<string | undefined>, width: number, height: number, x0: number, y0: number, x1: number, y1: number, color: string) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    setVirtual(pixels, width, height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color)
  }
}

function spriteFromVirtual(pixels: Array<string | undefined>, width: number, height: number): PixelSprite {
  const cells: PixelCell[][] = []
  for (let row = 0; row < height; row++) {
    const cellsRow: PixelCell[] = []
    for (let col = 0; col < width; col++) {
      const top = pixels[row * 2 * width + col]
      const bottom = pixels[(row * 2 + 1) * width + col]
      if (top && bottom) cellsRow.push({ ch: "▀", fg: top, bg: bottom })
      else if (top) cellsRow.push({ ch: "▀", fg: top })
      else if (bottom) cellsRow.push({ ch: "▄", fg: bottom })
      else cellsRow.push({ ch: " ", fg: "#000000" })
    }
    cells.push(cellsRow)
  }
  return { width, height, cells }
}

function insidePolygon(x: number, y: number, points: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i]?.[0] ?? 0
    const yi = points[i]?.[1] ?? 0
    const xj = points[j]?.[0] ?? 0
    const yj = points[j]?.[1] ?? 0
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0")
}

function hash(value: string) {
  let hashValue = 0
  for (let index = 0; index < value.length; index++) hashValue = (hashValue * 31 + value.charCodeAt(index)) | 0
  return hashValue
}

function wrap(value: number, count: number) {
  return ((value % count) + count) % count
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
