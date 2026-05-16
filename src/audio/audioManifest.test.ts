import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import {
  audioEvent,
  audioManifest,
  audioTrackRuntimePath,
  plannedAudioEvents,
  validateAudioManifest,
  validateWorldAudioManifest,
  worldAudioStoragePrefix,
  type WorldAudioManifestEntry,
} from "./audioManifest.js"

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

  test("keeps GM world audio outside canonical runtime assets", () => {
    const entry: WorldAudioManifestEntry = {
      id: "moss-vault-ambience",
      worldId: "world_01",
      title: "Moss Vault Ambience",
      group: "music",
      storagePath: `${worldAudioStoragePrefix("world_01")}moss-vault-ambience.ogg`,
      loop: true,
      defaultVolume: 0.6,
      use: "Optional ambience for a GM-created world.",
      licenseId: "CC0-1.0",
      source: "https://example.test/cc0-audio-pack",
      canonical: false,
    }

    expect(validateWorldAudioManifest([entry])).toEqual([])
  })

  test("rejects world audio that overwrites canonical ids or files", () => {
    expect(
      validateWorldAudioManifest([
        {
          id: "dungeon",
          worldId: "world_01",
          title: "Replacement dungeon loop",
          group: "music",
          storagePath: "assets/opendungeon-assets/runtime/audio/dungeon-loop.mp3",
          loop: true,
          defaultVolume: 0.7,
          use: "Bad replacement.",
          licenseId: "CC0-1.0",
          source: "https://example.test/cc0-audio-pack",
          canonical: false,
        },
      ]),
    ).toEqual([
      "dungeon reuses a canonical audio id.",
      "dungeon must use world-scoped audio storage under worlds/world_01/audio/.",
      "dungeon must not point at canonical runtime audio assets.",
      "dungeon must not reuse a canonical soundtrack filename.",
    ])
  })
})
