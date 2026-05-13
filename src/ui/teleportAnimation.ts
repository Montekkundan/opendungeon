import type { PixelSprite } from "../assets/pixelSprites.js"
import { clamp, easeOutQuart } from "../shared/numeric.js"

export type TeleportTransitionKind = "portal" | "village"
export type ScreenTransitionKind = "screen" | TeleportTransitionKind

type TeleportPalette = {
  title: string
  shade: string
  accent: string
  soft: string
  core: string
  aura: string
  spark: string
}

export const teleportTransitionDurationMs: Record<ScreenTransitionKind, number> = {
  screen: 420,
  portal: 1450,
  village: 720,
}

const palettes: Record<TeleportTransitionKind, TeleportPalette> = {
  portal: {
    title: "PORTAL",
    shade: "#10272d",
    accent: "#72f2d0",
    soft: "#b8d7d0",
    core: "#72f2d0",
    aura: "#183f4d",
    spark: "#f4d06f",
  },
  village: {
    title: "VILLAGE",
    shade: "#132719",
    accent: "#8ff0a8",
    soft: "#c7d8c9",
    core: "#8ff0a8",
    aura: "#1e4530",
    spark: "#f4d06f",
  },
}

export function transitionDurationForKind(kind: ScreenTransitionKind) {
  return teleportTransitionDurationMs[kind]
}

export function teleportTransitionFrame(kind: TeleportTransitionKind, startedAt: number, durationMs: number, canvasHeight: number, now = Date.now()) {
  const progress = clamp((now - startedAt) / Math.max(1, durationMs), 0, 1)
  if (progress >= 1) return null
  const eased = easeOutQuart(progress)
  const palette = palettes[kind]
  return {
    ...palette,
    progress,
    eased,
    shadeRows: Math.ceil((1 - eased) * canvasHeight),
    glyph: progress < 0.34 ? "▒" : progress < 0.68 ? "░" : " ",
    showCard: progress < 0.48,
  }
}

export function teleportTileSprite(width: number, height: number, frameSeed = 0, kind: TeleportTransitionKind = "portal"): PixelSprite {
  const frame = wrapFrame(frameSeed, 8)
  const palette = palettes[kind]
  const sprite = emptySprite(width, height)
  const centerX = (width - 1) / 2
  const centerY = (height - 1) / 2
  const radius = Math.max(1.8, Math.min(width, height * 2) * 0.28)
  const ringWidth = Math.max(0.75, radius * 0.22)
  const spin = frame * 0.78

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const dx = col - centerX
      const dy = (row - centerY) * 1.85
      const distance = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx)
      const sweep = Math.sin(angle * 2.6 + spin)
      const ring = Math.abs(distance - radius) <= ringWidth
      const core = distance <= radius * 0.42
      const flare = Math.abs(dx) <= 0.45 && distance <= radius * 1.18 && frame % 4 < 2

      if (ring && sweep > -0.28) paint(sprite, col, row, { ch: " ", fg: palette.aura, bg: palette.aura })
      if (core) paint(sprite, col, row, { ch: " ", fg: palette.core, bg: frame % 2 === 0 ? palette.core : palette.aura })
      if (flare) paint(sprite, col, row, { ch: " ", fg: palette.spark, bg: palette.spark })
    }
  }

  const sparkX = Math.round(centerX + Math.cos(spin) * radius)
  const sparkY = Math.round(centerY + (Math.sin(spin) * radius) / 1.85)
  paint(sprite, sparkX, sparkY, { ch: "◆", fg: palette.spark })
  paint(sprite, Math.round(centerX), Math.round(centerY), { ch: "◆", fg: "#05070a", bg: palette.spark })
  return sprite
}

function emptySprite(width: number, height: number): PixelSprite {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: " ", fg: "#05070a" }))),
  }
}

function paint(sprite: PixelSprite, x: number, y: number, cell: PixelSprite["cells"][number][number]) {
  if (x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return
  sprite.cells[y][x] = cell
}

function wrapFrame(frame: number, count: number) {
  return ((Math.floor(frame) % count) + count) % count
}
