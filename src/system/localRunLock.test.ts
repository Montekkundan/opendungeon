import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AuthSession } from "../cloud/authStore.js"
import { acquireLocalRunLock, activeRunLockDirectory, releaseLocalRunLock, terminalAppName } from "./localRunLock.js"

const signedInSession: AuthSession = {
  provider: "github",
  username: "mira",
  accessToken: "token",
  tokenType: "bearer",
  createdAt: "2026-05-13T12:00:00.000Z",
  userId: "user-123",
}

describe("local run lock", () => {
  test("allows guest local terminal sessions without writing a lock", () => {
    withLockDir(() => {
      const result = acquireLocalRunLock({ env: { TERM_PROGRAM: "Ghostty" } })

      expect(result.allowed).toBe(true)
      expect(result.kind).toBe("guest")
      expect(result.lock).toBeNull()
      expect(existsSync(activeRunLockDirectory())).toBe(false)
    })
  })

  test("blocks duplicate signed-in local runs until the first process exits", () => {
    withLockDir(() => {
      const first = acquireLocalRunLock({
        session: signedInSession,
        env: { TERM_PROGRAM: "Ghostty" },
        pid: 111,
        now: () => new Date("2026-05-13T12:00:00.000Z"),
        isProcessAlive: (pid) => pid === 111,
      })
      expect(first.allowed).toBe(true)
      expect(first.kind).toBe("locked")
      if (!first.allowed || first.kind !== "locked") throw new Error("first lock was not acquired")

      const blocked = acquireLocalRunLock({
        session: signedInSession,
        env: { TERM_PROGRAM: "Ghostty" },
        pid: 222,
        now: () => new Date("2026-05-13T12:01:00.000Z"),
        isProcessAlive: (pid) => pid === 111,
      })
      expect(blocked.allowed).toBe(false)
      expect(blocked.message).toContain("already in a game from Ghostty")

      releaseLocalRunLock(first.lock)
      const next = acquireLocalRunLock({
        session: signedInSession,
        env: { TERM_PROGRAM: "Ghostty" },
        pid: 222,
        now: () => new Date("2026-05-13T12:02:00.000Z"),
        isProcessAlive: (pid) => pid === 222,
      })
      expect(next.allowed).toBe(true)
      if (!next.allowed || next.kind !== "locked") throw new Error("next lock was not acquired")
      releaseLocalRunLock(next.lock)
    })
  })

  test("replaces stale signed-in locks", () => {
    withLockDir(() => {
      acquireLocalRunLock({
        session: signedInSession,
        env: { TERM_PROGRAM: "Ghostty" },
        pid: 111,
        now: () => new Date("2026-05-13T12:00:00.000Z"),
        isProcessAlive: () => true,
      })

      const next = acquireLocalRunLock({
        session: signedInSession,
        env: { TERM_PROGRAM: "Ghostty" },
        pid: 222,
        now: () => new Date("2026-05-14T01:00:00.000Z"),
        isProcessAlive: () => true,
      })

      expect(next.allowed).toBe(true)
      if (!next.allowed || next.kind !== "locked") throw new Error("stale lock was not replaced")
      releaseLocalRunLock(next.lock)
    })
  })

  test("detects terminal app labels from Ghostty env", () => {
    expect(terminalAppName({ TERM_PROGRAM: "Ghostty" })).toBe("Ghostty")
  })
})

function withLockDir(run: () => void) {
  const previous = process.env.OPENDUNGEON_RUN_LOCK_DIR
  const dir = mkdtempSync(join(tmpdir(), "opendungeon-lock-test-"))
  process.env.OPENDUNGEON_RUN_LOCK_DIR = join(dir, "locks")
  try {
    run()
  } finally {
    if (previous === undefined) delete process.env.OPENDUNGEON_RUN_LOCK_DIR
    else process.env.OPENDUNGEON_RUN_LOCK_DIR = previous
    rmSync(dir, { recursive: true, force: true })
  }
}
