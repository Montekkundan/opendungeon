import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSession } from "./session.js"
import { exportSave, importSave, listSaves, loadAutosave, loadSave, renameSave, saveAutosave, saveDirectory, saveSession, validateSave } from "./saveStore.js"

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
