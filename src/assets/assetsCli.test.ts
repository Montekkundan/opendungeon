import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PNG } from "pngjs"
import { formatAssetGenerateResult, formatAssetImportResult, formatAssetWizardReport, runAssetsGenerate, runAssetsImport, runAssetsWizard } from "./assetsCli.js"
import { validateReferenceAssetImportManifest } from "./referenceImporter.js"
import { buildSpriteImagePrompt, loadSpriteGenerationSkill } from "./spriteGenerationSkill.js"

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
    const bytes = tinyPngBytes()
    const result = await runAssetsGenerate(["merchant", "--prompt", "merchant portrait"], {
      generate: async (prompt) => {
        expect(prompt).toBe("merchant portrait")
        return { model: "test-model", mimeType: "image/png", bytes }
      },
      store: async (assetId, image) => ({ assetId, storagePath: `/tmp/${assetId}-${image.bytes.length}.png`, backend: "local" }),
    })

    expect(result.dryRun).toBe(false)
    expect(result.asset?.storagePath).toBe(`/tmp/merchant-${bytes.length}.png`)
    expect(result.sample?.colorCount).toBeGreaterThan(1)
    expect(formatAssetGenerateResult(result)).toContain("sample:")
  })

  test("rejects missing asset id or prompt", async () => {
    await expect(runAssetsGenerate(["asset-only"])).rejects.toThrow("Usage:")
    await expect(runAssetsGenerate(["", "--prompt", "x"])).rejects.toThrow("Usage:")
  })

  test("loads the AI-admin sprite skill for generated image prompts", () => {
    const skill = loadSpriteGenerationSkill()
    const prompt = buildSpriteImagePrompt("grave knight walk sheet")

    expect(skill).toContain("OpenDungeon AI Sprite Generation Skill")
    expect(prompt).toContain("18x18")
    expect(prompt).toContain("8x8")
    expect(prompt).toContain("grave knight walk sheet")
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
              approved: true,
              accessibilityScore: 92,
            },
          ],
        }),
      )

      const dryRun = runAssetsImport(["--manifest", manifestPath, "--source-root", root, "--runtime-root", targetRoot, "--dry-run"])
      expect(dryRun.dryRun).toBe(true)
      expect(dryRun.imported[0]?.licenseId).toBe("project-owned")
      expect(dryRun.imported[0]?.approved).toBe(true)
      expect(dryRun.imported[0]?.accessibilityScore).toBe(92)
      expect(existsSync(join(targetRoot, "runtime/dice/d20-project-owned.png"))).toBe(false)

      const result = runAssetsImport(["--manifest", manifestPath, "--source-root", root, "--runtime-root", targetRoot])
      expect(readFileSync(join(targetRoot, "runtime/dice/d20-project-owned.png"), "utf8")).toBe("project-owned-png-bytes")
      expect(formatAssetImportResult(result)).toContain("assets imported")
      expect(formatAssetImportResult(result)).toContain("approved, a11y 92/100")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("requires explicit approval for real reference asset imports", () => {
    const root = mkdtempSync(join(tmpdir(), "opendungeon-reference-assets-"))
    try {
      const sourcePath = join(root, "asset.png")
      const manifestPath = join(root, "manifest.json")
      writeFileSync(sourcePath, "candidate-png-bytes")
      writeFileSync(
        manifestPath,
        JSON.stringify({
          version: 1,
          source: { name: "test pack", url: "https://example.com/test-pack" },
          assets: [
            {
              id: "candidate",
              kind: "item-sheet",
              source: "asset.png",
              target: "runtime/icons/candidate.png",
              license: { id: "CC0-1.0", sourceUrl: "https://example.com/test-pack/license" },
              approved: false,
              accessibilityScore: 80,
            },
          ],
        }),
      )

      const dryRun = runAssetsImport(["--manifest", manifestPath, "--source-root", root, "--runtime-root", join(root, "runtime-root"), "--dry-run"])
      expect(formatAssetImportResult(dryRun)).toContain("pending, a11y 80/100")
      expect(() => runAssetsImport(["--manifest", manifestPath, "--source-root", root, "--runtime-root", join(root, "runtime-root")])).toThrow("is not approved")
      const localExperiment = runAssetsImport(["--manifest", manifestPath, "--source-root", root, "--runtime-root", join(root, "runtime-root"), "--allow-unapproved"])
      expect(localExperiment.imported[0]?.approved).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("builds a content-pack wizard report with terminal preview blockers", () => {
    const root = mkdtempSync(join(tmpdir(), "opendungeon-reference-assets-"))
    try {
      const sourcePath = join(root, "candidate.png")
      const manifestPath = join(root, "manifest.json")
      writeFileSync(sourcePath, tinyPngBytes())
      writeFileSync(
        manifestPath,
        JSON.stringify({
          version: 1,
          source: { name: "Wizard pack", url: "https://example.com/wizard-pack" },
          assets: [
            {
              id: "wizard-candidate",
              kind: "terrain-sheet",
              source: "candidate.png",
              target: "runtime/tiles/wizard-candidate.png",
              license: { id: "CC0-1.0", sourceUrl: "https://example.com/wizard-pack/license" },
              approved: false,
              accessibilityScore: 62,
            },
          ],
        }),
      )

      const report = runAssetsWizard(["--manifest", manifestPath, "--source-root", root, "--runtime-root", join(root, "runtime-root")])
      expect(report.readyCount).toBe(0)
      expect(report.pendingCount).toBe(1)
      expect(report.entries[0]?.terminalPreview.width).toBe(2)
      expect(report.entries[0]?.blockers).toContain("not approved")
      expect(report.entries[0]?.blockers).toContain("accessibility score below 70")
      expect(formatAssetWizardReport(report)).toContain("asset import wizard: Wizard pack")
      expect(formatAssetWizardReport(report)).toContain("pending, CC0-1.0, a11y 62/100")
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
            accessibilityScore: 101,
            license: { id: "unknown-commercial" },
          },
        ],
      }),
    ).toEqual([
      "bad-license target must stay under runtime/.",
      "bad-license accessibilityScore must be 0-100.",
      "bad-license uses unsupported license unknown-commercial.",
      "bad-license needs a sourceUrl or license file.",
    ])
  })
})

function tinyPngBytes() {
  const png = new PNG({ width: 2, height: 2 })
  const pixels = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 0, 255],
  ]
  pixels.forEach((pixel, index) => {
    const offset = index << 2
    png.data[offset] = pixel[0]
    png.data[offset + 1] = pixel[1]
    png.data[offset + 2] = pixel[2]
    png.data[offset + 3] = pixel[3]
  })
  return new Uint8Array(PNG.sync.write(png))
}
