import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { PNG } from "pngjs"

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

export type PixelSpriteId =
  | "floor-a"
  | "floor-b"
  | "floor-c"
  | "wall-a"
  | "wall-b"
  | "stairs"
  | "potion"
  | "relic"
  | "chest"
  | "coin"
  | "scroll"
  | "focus-gem"
  | "ember"
  | "hero"
  | "slime"
  | "ghoul"
  | "necromancer"
  | "sword"
  | "dice"

type Crop = {
  sheet: "0x72"
  tileX: number
  tileY: number
  transparent?: boolean
}

const sourceTileSize = 16

const sheets = {
  "0x72": "assets/0x72/dungeon-tileset-v2.png",
} as const

const spriteCrops: Record<PixelSpriteId, Crop> = {
  "floor-a": { sheet: "0x72", tileX: 0, tileY: 6 },
  "floor-b": { sheet: "0x72", tileX: 1, tileY: 6 },
  "floor-c": { sheet: "0x72", tileX: 2, tileY: 6 },
  "wall-a": { sheet: "0x72", tileX: 0, tileY: 1 },
  "wall-b": { sheet: "0x72", tileX: 1, tileY: 1 },
  stairs: { sheet: "0x72", tileX: 6, tileY: 10 },
  potion: { sheet: "0x72", tileX: 2, tileY: 10, transparent: true },
  relic: { sheet: "0x72", tileX: 5, tileY: 14, transparent: true },
  chest: { sheet: "0x72", tileX: 5, tileY: 6, transparent: true },
  coin: { sheet: "0x72", tileX: 1, tileY: 15, transparent: true },
  scroll: { sheet: "0x72", tileX: 0, tileY: 15, transparent: true },
  "focus-gem": { sheet: "0x72", tileX: 3, tileY: 14, transparent: true },
  ember: { sheet: "0x72", tileX: 2, tileY: 14, transparent: true },
  hero: { sheet: "0x72", tileX: 6, tileY: 9, transparent: true },
  slime: { sheet: "0x72", tileX: 1, tileY: 13, transparent: true },
  ghoul: { sheet: "0x72", tileX: 1, tileY: 9, transparent: true },
  necromancer: { sheet: "0x72", tileX: 5, tileY: 9, transparent: true },
  sword: { sheet: "0x72", tileX: 8, tileY: 0, transparent: true },
  dice: { sheet: "0x72", tileX: 4, tileY: 11, transparent: true },
}

const loadedSheets = new Map<string, PNG>()
const spriteCache = new Map<string, PixelSprite>()

export function pixelSprite(id: PixelSpriteId, width = 8, height = 4): PixelSprite {
  const key = `${id}:${width}x${height}`
  const cached = spriteCache.get(key)
  if (cached) return cached

  const crop = spriteCrops[id]
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

function loadSheet(id: keyof typeof sheets) {
  const cached = loadedSheets.get(id)
  if (cached) return cached

  const path = resolve(process.cwd(), sheets[id])
  const png = PNG.sync.read(readFileSync(path))
  loadedSheets.set(id, png)
  return png
}

function sampleCell(sheet: PNG, crop: Crop, col: number, row: number, width: number, height: number): PixelCell {
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
      counts.set(color, (counts.get(color) ?? 0) + 1)
    }
  }

  if (crop.transparent && visiblePixels < Math.max(1, Math.floor(((endX - startX) * (endY - startY)) / 5))) {
    return { ch: " ", fg: "#000000" }
  }

  const color = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#05070a"
  return crop.transparent ? { ch: "█", fg: color } : { ch: " ", fg: color, bg: color }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0")
}
