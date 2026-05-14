import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSession } from "./session.js"
import { exportSave, importSave, listSaves, loadAutosave, loadSave, renameSave, saveAutosave, saveDirectory, saveSession, validateSave } from "./saveStore.js"
import { defaultSettings, loadSettings, profilePath, saveSettings } from "./settingsStore.js"
import { worldBundleDirectory } from "../world/worldConfig.js"

describe("save store", () => {
  test("renames saves without changing run data", () => {
    withSaveDirs(() => {
      const session = createSession(1111)
      session.gold = 12
      const saved = saveSession(session, "Manual save")
      const renamed = renameSave(saved.id, "Boss door backup")
      const loaded = loadSave(saved.id)

      expect(renamed.name).toBe("Boss door backup")
      expect(loaded.gold).toBe(12)
      expect(listSaves()[0].name).toBe("Boss door backup")
    })
  })

  test("keeps one autosave slot and reloads it", () => {
    withSaveDirs(() => {
      const first = createSession(2222)
      first.gold = 1
      const second = createSession(3333)
      second.gold = 99

      const firstSummary = saveAutosave(first)
      const secondSummary = saveAutosave(second)
      const loaded = loadAutosave()

      expect(firstSummary.id).toBe("autosave")
      expect(secondSummary.id).toBe("autosave")
      expect(listSaves().filter((save) => save.slot === "autosave")).toHaveLength(1)
      expect(loaded.seed).toBe(3333)
      expect(loaded.gold).toBe(99)
    })
  })

  test("supports process-scoped guest autosaves for local multiplayer clients", () => {
    withSaveDirs(() => {
      saveAutosave(createSession(1111, "coop"), "autosave-guest-a")
      saveAutosave(createSession(2222, "coop"), "autosave-guest-b")

      const autosaves = listSaves().filter((save) => save.slot === "autosave")

      expect(autosaves).toHaveLength(2)
      expect(autosaves.map((save) => save.id).sort()).toEqual(["autosave-guest-a", "autosave-guest-b"])
    })
  })

  test("exports and imports local save backups", () => {
    withSaveDirs(() => {
      const session = createSession(4444)
      session.gold = 44
      const saved = saveSession(session, "Manual save")
      const backupPath = join(saveDirectory(), "backup", "run.json")

      exportSave(saved.id, backupPath)
      expect(existsSync(backupPath)).toBe(true)

      const imported = importSave(backupPath, "Imported backup")
      const loaded = loadSave(imported.id)

      expect(imported.slot).toBe("imported")
      expect(imported.name).toContain("Imported backup")
      expect(loaded.seed).toBe(4444)
      expect(loaded.gold).toBe(44)
    })
  })

  test("validates saves and backfills old summary metadata", () => {
    withSaveDirs(() => {
      const session = createSession(5555)
      const saved = saveSession(session, "Legacy save")
      const envelope = JSON.parse(readFileSync(saved.path, "utf8")) as { summary: Record<string, unknown> }
      delete envelope.summary.slot
      delete envelope.summary.thumbnail
      writeFileSync(saved.path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8")

      const listed = listSaves()[0]

      expect(validateSave(saved.id)).toEqual([])
      expect(listed.slot).toBe("manual")
      expect(listed.thumbnail.length).toBeGreaterThan(0)
    })
  })

  test("persists local saves and rehydrates fog of war sets", () => {
    withSaveDirs(() => {
      const session = createSession(4321, "race", "warden")
      session.gold = 42
      session.visible.add("1,2")
      session.seen.add("3,4")

      const summary = saveSession(session, "Test save")
      const saves = listSaves()
      const loaded = loadSave(summary.id)

      expect(summary.path.startsWith(saveDirectory())).toBe(true)
      expect(existsSync(worldBundleDirectory(session.world.worldId))).toBe(true)
      expect(saves).toHaveLength(1)
      expect(loaded.gold).toBe(42)
      expect(loaded.mode).toBe("race")
      expect(loaded.hero.classId).toBe("warden")
      expect(loaded.stats.strength).toBe(session.stats.strength)
      expect(loaded.visible.has("1,2")).toBe(true)
      expect(loaded.seen.has("3,4")).toBe(true)
      expect(loaded.dungeon.width).toBe(session.dungeon.width)
      expect(loaded.world.worldId).toBe(session.world.worldId)
      expect(loaded.worldLog[0].type).toBe("world-created")
    })
  })

  test("persists local profile settings separately from saves", () => {
    withProfileDir(() => {
      saveSettings({
        ...defaultSettings,
        username: "dev-runner",
        githubUsername: "terminal-host",
        cloudProvider: "github",
        highContrast: true,
        reduceMotion: true,
        startWithTutorial: false,
        controlScheme: "vim",
      })

      const loaded = loadSettings()

      expect(profilePath().startsWith(process.env.OPENDUNGEON_PROFILE_DIR!)).toBe(true)
      expect(loaded.username).toBe("dev-runner")
      expect(loaded.githubUsername).toBe("terminal-host")
      expect(loaded.cloudProvider).toBe("github")
      expect(loaded.highContrast).toBe(true)
      expect(loaded.startWithTutorial).toBe(false)
      expect(loaded.controlScheme).toBe("vim")
    })
  })

  test("migrates pre-audio profiles without leaving music silently disabled", () => {
    withProfileDir(() => {
      writeFileSync(
        profilePath(),
        `${JSON.stringify({
          game: "opendungeon",
          version: 1,
          settings: {
            username: "legacy-crawler",
            music: false,
            sound: true,
          },
        })}\n`,
        "utf8",
      )

      const loaded = loadSettings()

      expect(loaded.username).toBe("legacy-crawler")
      expect(loaded.music).toBe(true)
      expect(loaded.sound).toBe(true)
      expect(loaded.muteAudio).toBe(false)
      expect(loaded.masterVolume).toBe(defaultSettings.masterVolume)
    })
  })
})

function withSaveDirs(run: () => void) {
  const previousSaveDir = process.env.OPENDUNGEON_SAVE_DIR
  const previousWorldDir = process.env.OPENDUNGEON_WORLD_DIR
  const dir = mkdtempSync(join(tmpdir(), "opendungeon-save-store-test-"))
  process.env.OPENDUNGEON_SAVE_DIR = join(dir, "saves")
  process.env.OPENDUNGEON_WORLD_DIR = join(dir, "worlds")
  try {
    run()
  } finally {
    if (previousSaveDir === undefined) delete process.env.OPENDUNGEON_SAVE_DIR
    else process.env.OPENDUNGEON_SAVE_DIR = previousSaveDir
    if (previousWorldDir === undefined) delete process.env.OPENDUNGEON_WORLD_DIR
    else process.env.OPENDUNGEON_WORLD_DIR = previousWorldDir
    rmSync(dir, { recursive: true, force: true })
  }
}

function withProfileDir(run: () => void) {
  const previousProfileDir = process.env.OPENDUNGEON_PROFILE_DIR
  const dir = mkdtempSync(join(tmpdir(), "opendungeon-profile-test-"))
  process.env.OPENDUNGEON_PROFILE_DIR = dir
  try {
    run()
  } finally {
    if (previousProfileDir === undefined) delete process.env.OPENDUNGEON_PROFILE_DIR
    else process.env.OPENDUNGEON_PROFILE_DIR = previousProfileDir
    rmSync(dir, { recursive: true, force: true })
  }
}
