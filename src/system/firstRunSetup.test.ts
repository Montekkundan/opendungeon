import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { firstRunSetup, formatFirstRunSetupReport } from "./firstRunSetup.js"

const envKeys = ["OPENDUNGEON_PROFILE_DIR", "OPENDUNGEON_SAVE_DIR", "OPENDUNGEON_AUTH_DIR", "OPENDUNGEON_WORLD_DIR", "OPENDUNGEON_GENERATED_ASSET_DIR"] as const
const previousEnv = new Map<string, string | undefined>()

afterEach(() => {
  for (const key of envKeys) {
    const value = previousEnv.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  previousEnv.clear()
})

describe("first-run setup", () => {
  test("creates local first-run directories and profile", () => {
    const root = mkdtempSync(join(tmpdir(), "opendungeon-setup-"))
    try {
      withSetupEnv(root)
      const report = firstRunSetup()

      expect(report.profileReady).toBe(true)
      for (const directory of report.directories) expect(existsSync(directory)).toBe(true)
      expect(existsSync(join(root, "profile", "profile.json"))).toBe(true)
      expect(formatFirstRunSetupReport(report)).toContain("first-run setup")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("dry-run reports paths without writing", () => {
    const root = mkdtempSync(join(tmpdir(), "opendungeon-setup-"))
    try {
      withSetupEnv(root)
      const report = firstRunSetup({ dryRun: true })

      expect(report.dryRun).toBe(true)
      expect(report.directories).toContain(join(root, "saves"))
      expect(existsSync(join(root, "profile"))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

function withSetupEnv(root: string) {
  for (const key of envKeys) previousEnv.set(key, process.env[key])
  process.env.OPENDUNGEON_PROFILE_DIR = join(root, "profile")
  process.env.OPENDUNGEON_SAVE_DIR = join(root, "saves")
  process.env.OPENDUNGEON_AUTH_DIR = join(root, "auth")
  process.env.OPENDUNGEON_WORLD_DIR = join(root, "world")
  process.env.OPENDUNGEON_GENERATED_ASSET_DIR = join(root, "assets")
}
