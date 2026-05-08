import { describe, expect, test } from "bun:test"
import { debugOverlaysEnabled } from "./debugFlags.js"

describe("debug overlay flags", () => {
  test("keeps overlays disabled unless an explicit debug flag is set", () => {
    expect(debugOverlaysEnabled({})).toBe(false)
    expect(debugOverlaysEnabled({ OPENDUNGEON_DEBUG_OVERLAY: "0", OPENDUNGEON_DEBUG_VIEW: "false" })).toBe(false)
    expect(debugOverlaysEnabled({ OPENDUNGEON_DEBUG_OVERLAY: "1" })).toBe(true)
    expect(debugOverlaysEnabled({ OPENDUNGEON_DEBUG_VIEW: "true" })).toBe(true)
    expect(debugOverlaysEnabled({ DUNGEON_DEBUG_VIEW: "1" })).toBe(true)
  })
})
