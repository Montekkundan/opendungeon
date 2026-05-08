import { defaultDiceSkin, diceSkins, type DiceSkin, type DiceSkinId, type Rgb } from "./diceSkins.js"
import { diceFrameCount } from "./opendungeonSprites.js"
import type { PixelSprite } from "./pixelSprites.js"
import { drawLine, fillPolygon, fillRect, makeVirtual, spriteFromVirtual } from "./virtualSprites.js"

const resultCount = 20
const cache = new Map<string, PixelSprite>()

export function d20RollSprite(result: number, frame: number, width = 10, height = 5, skin: DiceSkinId = defaultDiceSkin): PixelSprite {
  const safeResult = clamp(Math.round(result), 1, resultCount)
  const safeFrame = clamp(Math.round(frame), 0, diceFrameCount - 1)
  const key = `${skin}:${safeResult}:${safeFrame}:${width}x${height}`
  const cached = cache.get(key)
  if (cached) return cached

  const sprite = drawD20(safeResult, safeFrame, width, height, diceSkins.find((diceSkin) => diceSkin.id === skin) ?? diceSkins[0])
  cache.set(key, sprite)
  return sprite
}

export function d20FrameCount() {
  return diceFrameCount
}

function drawD20(result: number, frame: number, width: number, height: number, skin: DiceSkin): PixelSprite {
  const virtualWidth = Math.max(1, width)
  const virtualHeight = Math.max(1, height * 2)
  const pixels = makeVirtual(virtualWidth, virtualHeight)
  const cx = (virtualWidth - 1) / 2
  const cy = (virtualHeight - 1) / 2
  const wobble = Math.sin((frame / Math.max(1, diceFrameCount - 1)) * Math.PI * 2)
  const lean = wobble * Math.max(0.5, virtualWidth * 0.08)
  const lift = Math.cos(frame * 0.9) * Math.max(0.2, virtualHeight * 0.03)
  const top: Point = [cx + lean, 1 + lift]
  const leftTop: Point = [1.5, virtualHeight * 0.27]
  const rightTop: Point = [virtualWidth - 2.2, virtualHeight * 0.24]
  const left: Point = [0.8, virtualHeight * 0.58]
  const right: Point = [virtualWidth - 1.1, virtualHeight * 0.56]
  const bottom: Point = [cx - lean, virtualHeight - 2]
  const center: Point = [cx + wobble * Math.max(0.5, virtualWidth * 0.05), cy + lift]

  fillPolygon(pixels, virtualWidth, virtualHeight, [top, leftTop, center], color(skin.light))
  fillPolygon(pixels, virtualWidth, virtualHeight, [top, center, rightTop], color(skin.base))
  fillPolygon(pixels, virtualWidth, virtualHeight, [leftTop, left, bottom, center], color(skin.mid))
  fillPolygon(pixels, virtualWidth, virtualHeight, [rightTop, center, bottom, right], color(skin.dark))
  fillPolygon(pixels, virtualWidth, virtualHeight, [left, bottom, right, center], color(skin.shadow))

  const edge = color(skin.shadow)
  drawEdge(pixels, virtualWidth, virtualHeight, top, leftTop, edge)
  drawEdge(pixels, virtualWidth, virtualHeight, top, rightTop, edge)
  drawEdge(pixels, virtualWidth, virtualHeight, leftTop, left, edge)
  drawEdge(pixels, virtualWidth, virtualHeight, rightTop, right, edge)
  drawEdge(pixels, virtualWidth, virtualHeight, left, bottom, edge)
  drawEdge(pixels, virtualWidth, virtualHeight, right, bottom, edge)
  drawEdge(pixels, virtualWidth, virtualHeight, bottom, center, color(skin.dark))
  drawEdge(pixels, virtualWidth, virtualHeight, center, top, color(skin.light))
  drawEdge(pixels, virtualWidth, virtualHeight, leftTop, center, color(skin.base))
  drawEdge(pixels, virtualWidth, virtualHeight, rightTop, center, color(skin.light))

  drawNumber(pixels, virtualWidth, virtualHeight, String(result), color(skin.ink), virtualWidth >= 18 && virtualHeight >= 16 ? 2 : 1)
  return spriteFromVirtual(pixels, virtualWidth, height)
}

type Point = [number, number]

function drawNumber(pixels: Array<string | undefined>, width: number, height: number, value: string, ink: string, scale: number) {
  const glyphs = value.split("").map((digit) => digitGlyphs[digit] ?? digitGlyphs["0"])
  const glyphWidth = glyphs.length * 3 * scale + Math.max(0, glyphs.length - 1) * scale
  const startX = Math.floor((width - glyphWidth) / 2)
  const startY = Math.floor((height - 5 * scale) / 2)

  glyphs.forEach((glyph, glyphIndex) => {
    const offsetX = startX + glyphIndex * 4 * scale
    glyph.forEach((line, y) => {
      line.split("").forEach((char, x) => {
        if (char !== "1") return
        fillRect(pixels, width, height, offsetX + x * scale, startY + y * scale, scale, scale, ink)
      })
    })
  })
}

const digitGlyphs: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
}

function drawEdge(pixels: Array<string | undefined>, width: number, height: number, a: Point, b: Point, fill: string) {
  drawLine(pixels, width, height, a[0], a[1], b[0], b[1], fill)
}

function color(rgb: Rgb) {
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0")
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
