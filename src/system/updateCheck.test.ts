import { describe, expect, test } from "bun:test"
import { checkForUpdate, compareVersions, formatUpdateStatus, titleUpdateNotice } from "./updateCheck.js"

describe("update checks", () => {
  test("detects newer registry versions", async () => {
    const status = await checkForUpdate("0.1.0", { fetchImpl: registryFetch("0.2.0") })

    expect(status).toMatchObject({ state: "available", current: "0.1.0", latest: "0.2.0" })
    expect(titleUpdateNotice(status)).toBe("Update 0.2.0 available. Run opendungeon update.")
    expect(formatUpdateStatus(status)).toContain("npm i -g @montekkundan/opendungeon@latest")
    expect(formatUpdateStatus(status)).toContain("bun add -g @montekkundan/opendungeon@latest")
  })

  test("reports current when installed version matches latest", async () => {
    const status = await checkForUpdate("0.2.0", { fetchImpl: registryFetch("0.2.0") })

    expect(status).toMatchObject({ state: "current", current: "0.2.0", latest: "0.2.0" })
    expect(titleUpdateNotice(status)).toBe("")
  })

  test("handles registry failures without throwing", async () => {
    const status = await checkForUpdate("0.1.0", {
      fetchImpl: async () => new Response("not found", { status: 404 }),
    })

    expect(status).toMatchObject({ state: "unavailable", current: "0.1.0" })
    expect(formatUpdateStatus(status)).toContain("Update check unavailable.")
  })

  test("compares semantic versions", () => {
    expect(compareVersions("0.1.1", "0.1.0")).toBe(1)
    expect(compareVersions("0.2.0", "0.10.0")).toBe(-1)
    expect(compareVersions("1.0.0", "1.0.0-beta.1")).toBe(1)
    expect(compareVersions("v1.0.0", "1.0.0")).toBe(0)
  })
})

function registryFetch(latest: string) {
  return async () => Response.json({ "dist-tags": { latest } })
}
