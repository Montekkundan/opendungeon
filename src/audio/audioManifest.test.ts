import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { audioEvent, audioManifest, audioTrackRuntimePath, plannedAudioEvents, validateAudioManifest } from "./audioManifest.js"

describe("audio manifest", () => {
  test("tracks the bundled title and dungeon loops", () => {
    expect(validateAudioManifest()).toEqual([])
    expect(audioManifest.tracks.map((track) => track.id)).toEqual(["title-settings", "dungeon"])
    expect(audioManifest.tracks.every((track) => track.loop)).toBe(true)
    expect(existsSync(audioTrackRuntimePath("title-settings"))).toBe(true)
    expect(existsSync(audioTrackRuntimePath("dungeon"))).toBe(true)
  })

  test("plans gameplay SFX without mixing them into canonical music", () => {
    expect(plannedAudioEvents).toContain("teleport-start")
    expect(plannedAudioEvents).toContain("d20-success")
    expect(plannedAudioEvents).toContain("combat-hit")
    expect(audioEvent("menu-confirm")?.group).toBe("ui")
    expect(audioEvent("combat-hit")?.group).toBe("sfx")
    expect(audioManifest.tracks.every((track) => track.canonical)).toBe(true)
  })
})
