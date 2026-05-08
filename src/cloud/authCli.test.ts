import { describe, expect, test } from "bun:test"
import { oauthCallbackHtml, sessionFromOAuthCallbackPayload } from "./authCli.js"

const now = new Date("2026-05-08T12:00:00.000Z")

describe("auth CLI OAuth callback capture", () => {
  test("builds a GitHub session from Supabase OAuth callback tokens", () => {
    const session = sessionFromOAuthCallbackPayload(
      {
        access_token: jwt({
          sub: "user-123",
          email: "mira@example.com",
          user_metadata: { user_name: "mira-gh" },
        }),
        refresh_token: "refresh",
        expires_in: "3600",
      },
      now,
    )

    expect(session.provider).toBe("github")
    expect(session.username).toBe("mira-gh")
    expect(session.refreshToken).toBe("refresh")
    expect(session.expiresAt).toBe("2026-05-08T13:00:00.000Z")
    expect(session.userId).toBe("user-123")
    expect(session.email).toBe("mira@example.com")
  })

  test("uses explicit expiry timestamps when callback provides them", () => {
    const session = sessionFromOAuthCallbackPayload({ access_token: jwt({}), expires_at: "1780000000" }, now)

    expect(session.expiresAt).toBe("2026-05-28T20:26:40.000Z")
  })

  test("rejects callback errors and missing access tokens", () => {
    expect(() => sessionFromOAuthCallbackPayload({ error_description: "access denied" }, now)).toThrow("access denied")
    expect(() => sessionFromOAuthCallbackPayload({}, now)).toThrow("access token")
  })

  test("serves a callback page that posts hash tokens back to the local listener", () => {
    const html = oauthCallbackHtml("/auth/callback/session")

    expect(html).toContain("location.hash")
    expect(html).toContain("/auth/callback/session")
    expect(html).toContain("Login captured")
  })
})

function jwt(payload: Record<string, unknown>) {
  return `${base64url({ alg: "none", typ: "JWT" })}.${base64url(payload)}.`
}

function base64url(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}
