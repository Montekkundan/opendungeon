import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { formatAssetGenerateResult, formatAssetImportResult, runAssetsGenerate, runAssetsImport } from "./assetsCli.js"
import { validateReferenceAssetImportManifest } from "./referenceImporter.js"

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

  test("imports reference assets through a checked manifest", () => {
    const root = mkdtempSync(join(tmpdir(), "opendungeon-reference-assets-"))
    try {
      const sourceDir = join(root, "source")
      const targetRoot = join(root, "runtime-root")
      mkdirSync(sourceDir, { recursive: true })
      const sourcePath = join(sourceDir, "d20.png")
      const licensePath = join(sourceDir, "license.txt")
      writeFileSync(sourcePath, "project-owned-png-bytes")
      writeFileSync(licensePath, "Project-owned test asset.")
      const manifestPath = join(root, "manifest.json")
      writeFileSync(
        manifestPath,
        JSON.stringify({
          version: 1,
          assets: [
            {
              id: "d20-project-owned",
              kind: "dice-sheet",
              source: "source/d20.png",
              target: "runtime/dice/d20-project-owned.png",
              sha256: createHash("sha256").update("project-owned-png-bytes").digest("hex"),
              license: { id: "project-owned", file: "source/license.txt" },
            },
          ],
        }),
      )

      const dryRun = runAssetsImport(["--manifest", manifestPath, "--source-root", root, "--runtime-root", targetRoot, "--dry-run"])
      expect(dryRun.dryRun).toBe(true)
      expect(dryRun.imported[0]?.licenseId).toBe("project-owned")
      expect(existsSync(join(targetRoot, "runtime/dice/d20-project-owned.png"))).toBe(false)

      const result = runAssetsImport(["--manifest", manifestPath, "--source-root", root, "--runtime-root", targetRoot])
      expect(readFileSync(join(targetRoot, "runtime/dice/d20-project-owned.png"), "utf8")).toBe("project-owned-png-bytes")
      expect(formatAssetImportResult(result)).toContain("assets imported")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("rejects unsafe reference asset manifests", () => {
    expect(
      validateReferenceAssetImportManifest({
        version: 1,
        assets: [
          {
            id: "bad-license",
            source: "asset.png",
            target: "../outside.png",
            license: { id: "unknown-commercial" },
          },
        ],
      }),
    ).toEqual([
      "bad-license target must stay under runtime/.",
      "bad-license uses unsupported license unknown-commercial.",
      "bad-license needs a sourceUrl or license file.",
    ])
  })
})
