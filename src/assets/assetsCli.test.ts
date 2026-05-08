import { describe, expect, test } from "bun:test"
import { formatAssetGenerateResult, runAssetsGenerate } from "./assetsCli.js"

describe("assets CLI", () => {
  test("validates asset generation requests without live services in dry-run mode", async () => {
    const result = await runAssetsGenerate(["grave-root-boss", "--prompt", "64px boss idle sheet", "--dry-run"])

    expect(result).toEqual({
      assetId: "grave-root-boss",
      prompt: "64px boss idle sheet",
      dryRun: true,
    })
    expect(formatAssetGenerateResult(result)).toContain("dry-run")
  })

  test("generates and stores through injected dependencies", async () => {
    const result = await runAssetsGenerate(["merchant", "--prompt", "merchant portrait"], {
      generate: async (prompt) => ({ model: "test-model", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]), prompt }) as never,
      store: async (assetId, image) => ({ assetId, storagePath: `/tmp/${assetId}-${image.bytes.length}.png`, backend: "local" }),
    })

    expect(result.dryRun).toBe(false)
    expect(result.asset?.storagePath).toBe("/tmp/merchant-3.png")
  })

  test("rejects missing asset id or prompt", async () => {
    await expect(runAssetsGenerate(["asset-only"])).rejects.toThrow("Usage:")
    await expect(runAssetsGenerate(["", "--prompt", "x"])).rejects.toThrow("Usage:")
  })
})
