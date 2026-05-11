import { describe, expect, test } from "bun:test"
import { checkInternetConnectivity } from "./connectivity.js"

describe("internet connectivity", () => {
  test("reports online for reachable 204 probes", async () => {
    const status = await checkInternetConnectivity(50, async () => new Response(null, { status: 204 }))

    expect(status).toBe("online")
  })

  test("reports offline for failed or timed out probes", async () => {
    const status = await checkInternetConnectivity(50, async () => {
      throw new Error("network down")
    })

    expect(status).toBe("offline")
  })
})
