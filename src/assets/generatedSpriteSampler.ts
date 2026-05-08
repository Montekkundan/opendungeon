import { createHash } from "node:crypto"
import { PNG } from "pngjs"
import type { GeneratedImage } from "../cloud/aiGateway.js"
import { makeVirtual, setVirtual, spriteFromVirtual } from "./virtualSprites.js"
import type { PixelSprite } from "./spriteSampler.js"

export type GeneratedSpriteSample = {
  width: number
  height: number
  colorCount: number
  hash: string
}

export function sampleGeneratedSpriteImage(image: GeneratedImage, width = 12, height = 6): PixelSprite {
  if (image.mimeType !== "image/png") throw new Error("Generated sprite sampling requires a PNG image.")
  const png = PNG.sync.read(Buffer.from(image.bytes))
  const virtualWidth = Math.max(1, width)
  const virtualHeight = Math.max(1, height * 2)
  const pixels = makeVirtual(virtualWidth, virtualHeight)
  const scale = Math.min(virtualWidth / png.width, virtualHeight / png.height)
  const drawWidth = Math.max(1, Math.round(png.width * scale))
  const drawHeight = Math.max(1, Math.round(png.height * scale))
  const offsetX = Math.floor((virtualWidth - drawWidth) / 2)
  const offsetY = Math.floor((virtualHeight - drawHeight) / 2)

  for (let y = 0; y < drawHeight; y++) {
    for (let x = 0; x < drawWidth; x++) {
      const sx = Math.min(png.width - 1, Math.floor(x / scale))
      const sy = Math.min(png.height - 1, Math.floor(y / scale))
      const color = samplePngPixel(png, sx, sy)
      if (color) setVirtual(pixels, virtualWidth, virtualHeight, offsetX + x, offsetY + y, color)
    }
  }

  return spriteFromVirtual(pixels, virtualWidth, height)
}

export function generatedSpriteSampleSummary(image: GeneratedImage, width = 12, height = 6): GeneratedSpriteSample {
  const sprite = sampleGeneratedSpriteImage(image, width, height)
  const colors = new Set(sprite.cells.flat().flatMap((cell) => [cell.fg, cell.bg].filter(Boolean)))
  return {
    width: sprite.width,
    height: sprite.height,
    colorCount: colors.size,
    hash: createHash("sha256").update(JSON.stringify(sprite.cells)).digest("hex").slice(0, 12),
  }
}

function samplePngPixel(png: PNG, x: number, y: number) {
  const index = (png.width * y + x) << 2
  const alpha = png.data[index + 3]
  if (alpha < 36) return undefined
  return rgbToHex(png.data[index], png.data[index + 1], png.data[index + 2])
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0")
}
