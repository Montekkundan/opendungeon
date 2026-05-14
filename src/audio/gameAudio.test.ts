import { describe, expect, test } from "bun:test"
import type { UserSettings } from "../game/settingsStore.js"
import { defaultSettings } from "../game/settingsStore.js"
import { effectiveGroupVolumes, effectiveMasterVolume, GameAudioController, musicTrackForSurface } from "./gameAudio.js"

function settings(overrides: Partial<UserSettings> = {}): UserSettings {
  return { ...defaultSettings, ...overrides }
}

describe("game audio", () => {
  test("routes menu and dungeon surfaces to different music loops", () => {
    expect(musicTrackForSurface({ screen: "start" })).toBe("title-settings")
    expect(musicTrackForSurface({ screen: "settings" })).toBe("title-settings")
    expect(musicTrackForSurface({ screen: "village" })).toBe("title-settings")
    expect(musicTrackForSurface({ screen: "game", dialog: "inventory" })).toBe("dungeon")
  })

  test("applies mute and group volume settings", () => {
    expect(effectiveMasterVolume(settings({ masterVolume: 0.42 }))).toBe(0.42)
    expect(effectiveMasterVolume(settings({ muteAudio: true, masterVolume: 0.42 }))).toBe(0)
    expect(effectiveGroupVolumes(settings({ music: false, sound: true, musicVolume: 0.7, sfxVolume: 0.5 }))).toEqual({
      music: 0,
      sfx: 0.5,
      ui: 0.5,
    })
  })

  test("starts, switches, and stops looped music through an injected engine", async () => {
    const calls: string[] = []
    let nextSoundId = 0
    const controller = new GameAudioController({
      createAudio: () => ({
        on: () => undefined as never,
        isStarted: () => calls.includes("start"),
        start: () => {
          calls.push("start")
          return true
        },
        loadSound: (data) => {
          const byteLength = data instanceof Uint8Array ? data.byteLength : data.byteLength
          calls.push(`load-bytes:${byteLength}`)
          return ++nextSoundId
        },
        loadSoundFile: async (path: string) => {
          const fileName = path.split("/").at(-1)
          calls.push(`load:${fileName}`)
          return fileName?.includes("dungeon") ? 2 : 1
        },
        group: (name: string) => {
          calls.push(`group:${name}`)
          return name === "music" ? 10 : 11
        },
        play: (sound, options) => {
          calls.push(`play:${sound}:${options?.loop}:${options?.groupId}`)
          return sound + 100
        },
        stopVoice: (voice) => {
          calls.push(`stop:${voice}`)
          return true
        },
        setGroupVolume: (group, volume) => {
          calls.push(`group-volume:${group}:${volume}`)
          return true
        },
        setMasterVolume: (volume) => {
          calls.push(`master:${volume}`)
          return true
        },
        dispose: () => {
          calls.push("dispose")
        },
      }),
    })

    await controller.sync({ screen: "start" }, settings({ masterVolume: 0.8, musicVolume: 0.7 }))
    await controller.sync({ screen: "game" }, settings({ masterVolume: 0.8, musicVolume: 0.7 }))
    await controller.sync({ screen: "game" }, settings({ muteAudio: true }))
    controller.dispose()

    expect(calls.some((call) => call.startsWith("load-bytes:"))).toBe(true)
    expect(calls).toContain("play:1:true:10")
    expect(calls).toContain("play:2:true:10")
    expect(calls).toContain("stop:102")
    expect(calls).toContain("dispose")
  })

  test("plays event SFX through the sfx and ui groups", async () => {
    const calls: string[] = []
    let nextSoundId = 20
    const controller = new GameAudioController({
      createAudio: () => ({
        on: () => undefined as never,
        isStarted: () => calls.includes("start"),
        start: () => {
          calls.push("start")
          return true
        },
        loadSound: (data) => {
          const byteLength = data instanceof Uint8Array ? data.byteLength : data.byteLength
          calls.push(`load-event:${byteLength}`)
          return ++nextSoundId
        },
        loadSoundFile: async () => null,
        group: (name: string) => {
          calls.push(`group:${name}`)
          return name === "ui" ? 12 : 13
        },
        play: (sound, options) => {
          calls.push(`play:${sound}:${options?.loop}:${options?.groupId}`)
          return sound + 100
        },
        stopVoice: () => true,
        setGroupVolume: (group, volume) => {
          calls.push(`group-volume:${group}:${volume}`)
          return true
        },
        setMasterVolume: (volume) => {
          calls.push(`master:${volume}`)
          return true
        },
        dispose: () => undefined,
      }),
    })

    await controller.playEvent("menu-confirm", settings())
    await controller.playEvent("combat-hit", settings())
    await controller.playEvent("combat-hit", settings({ sound: false }))

    expect(calls).toContain("start")
    expect(calls).toContain("play:21:false:12")
    expect(calls).toContain("play:22:false:13")
    expect(calls.filter((call) => call.startsWith("play:"))).toHaveLength(2)
  })
})
