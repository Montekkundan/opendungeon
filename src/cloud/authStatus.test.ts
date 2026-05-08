import { describe, expect, test } from "bun:test"
import { authStatusReport, formatAuthStatus } from "./authStatus.js"
import { type AuthSession } from "./authStore.js"

const now = new Date("2026-05-08T12:00:00.000Z")

describe("auth status reporting", () => {
  test("reports offline local profile state", () => {
    const report = authStatusReport(null, now)

    expect(report.kind).toBe("offline")
    expect(report.loggedIn).toBe(false)
    expect(report.syncAvailable).toBe(false)
    expect(report.warnings[0]).toContain("saves stay local")
  })

  test("reports active sessions without expiry as syncable", () => {
    const report = authStatusReport(session({ provider: "github", username: "mira", expiresAt: undefined }), now)

    expect(report.kind).toBe("active")
    expect(report.accountLabel).toBe("GitHub @mira")
    expect(report.syncAvailable).toBe(true)
    expect(report.minutesUntilExpiry).toBeUndefined()
    expect(formatAuthStatus(report)).toContain("no expiry")
  })

  test("reports sessions near expiry as refreshable when refresh token exists", () => {
    const report = authStatusReport(session({ expiresAt: "2026-05-08T12:10:00.000Z", refreshToken: "refresh" }), now)

    expect(report.kind).toBe("expiring")
    expect(report.minutesUntilExpiry).toBe(10)
    expect(report.canRefresh).toBe(true)
    expect(report.syncAvailable).toBe(true)
    expect(report.warnings[0]).toContain("refresh")
  })

  test("reports expired sessions as unavailable for sync", () => {
    const report = authStatusReport(session({ expiresAt: "2026-05-08T11:59:00.000Z" }), now)

    expect(report.kind).toBe("expired")
    expect(report.minutesUntilExpiry).toBe(-1)
    expect(report.canRefresh).toBe(false)
    expect(report.syncAvailable).toBe(false)
    expect(report.warnings[0]).toContain("sign in again")
  })
})

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    provider: "password",
    username: "test",
    accessToken: "token",
    tokenType: "bearer",
    createdAt: "2026-05-08T00:00:00.000Z",
    expiresAt: "2026-05-08T13:00:00.000Z",
    ...overrides,
  }
}
