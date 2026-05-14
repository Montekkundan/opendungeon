import { expect, test } from "bun:test"
import { teleportTileSprite, teleportTransitionFrame, transitionDurationForKind } from "./teleportAnimation.js"

test("teleport animation owns shared transition timing and tile frames", () => {
  expect(transitionDurationForKind("portal")).toBe(1450)
  expect(transitionDurationForKind("village")).toBe(720)
  expect(transitionDurationForKind("portal", true)).toBe(0)
  expect(transitionDurationForKind("village", true)).toBe(0)
  expect(teleportTransitionFrame("portal", 1000, 0, 24, 1000)).toBeNull()

  const frame = teleportTransitionFrame("portal", 1000, 1450, 24, 1000)
  expect(frame).toMatchObject({
    title: "PORTAL",
    progress: 0,
    glyph: "▒",
    shadeRows: 24,
  })

  const first = teleportTileSprite(10, 5, 0)
  const second = teleportTileSprite(10, 5, 1)

  expect(first.width).toBe(10)
  expect(first.height).toBe(5)
  expect(spriteSignature(first)).not.toBe(spriteSignature(second))
})

function spriteSignature(sprite: ReturnType<typeof teleportTileSprite>) {
  return sprite.cells.map((row) => row.map((cell) => `${cell.ch}:${cell.fg}:${cell.bg ?? ""}`).join("|")).join("\n")
}
