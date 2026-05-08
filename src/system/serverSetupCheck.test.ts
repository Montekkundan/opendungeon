import { describe, expect, test } from "bun:test"
import { formatServerSetupReport, serverSetupReport } from "./serverSetupCheck.js"

describe("server setup check", () => {
  test("reports missing first-run cloud configuration", () => {
    const report = serverSetupReport({})

    expect(report.ready).toBe(false)
    expect(report.items.filter((item) => item.status === "missing").map((item) => item.id)).toEqual([
      "supabase-url",
      "supabase-publishable-key",
      "supabase-service-role",
      "ai-gateway-token",
    ])
    expect(formatServerSetupReport(report)).toContain("ready: no")
  })

  test("accepts the supported environment variable aliases", () => {
    const report = serverSetupReport({
      OPENDUNGEON_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      OPENDUNGEON_SUPABASE_SERVICE_ROLE_KEY: "service",
      VERCEL_OIDC_TOKEN: "oidc",
      OPENDUNGEON_ASSET_BUCKET: "custom-assets",
      OPENDUNGEON_GENERATED_ASSET_DIR: "/tmp/opendungeon-assets",
    })

    expect(report.ready).toBe(true)
    expect(report.items.every((item) => item.status === "ok")).toBe(true)
    expect(formatServerSetupReport(report)).toContain("custom-assets")
  })

  test("warns but remains ready when only the local generated asset fallback is implicit", () => {
    const report = serverSetupReport({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "publishable",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      AI_GATEWAY_API_KEY: "gateway",
    })

    expect(report.ready).toBe(true)
    expect(report.items.find((item) => item.id === "generated-asset-fallback")?.status).toBe("warn")
  })
})
