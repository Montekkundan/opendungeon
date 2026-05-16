import { generateSpriteImage, type GeneratedImage } from "../cloud/aiGateway.js"
import { storeGeneratedSpriteAsset, type StoredGeneratedAsset } from "../cloud/generatedAssets.js"
import {
  importReferenceAssets,
  buildReferenceAssetWizardReport,
  loadReferenceAssetImportManifest,
  type ReferenceAssetImportOptions,
  type ReferenceAssetImportResult,
  type ReferenceAssetWizardReport,
} from "./referenceImporter.js"
import { generatedSpriteSampleSummary, type GeneratedSpriteSample } from "./generatedSpriteSampler.js"

type AssetCommandDeps = {
  generate: (prompt: string) => Promise<GeneratedImage>
  store: (assetId: string, image: GeneratedImage) => Promise<StoredGeneratedAsset>
}

export type AssetGenerateResult = {
  assetId: string
  prompt: string
  dryRun: boolean
  asset?: StoredGeneratedAsset
  sample?: GeneratedSpriteSample
}

const defaultDeps: AssetCommandDeps = {
  generate: generateSpriteImage,
  store: storeGeneratedSpriteAsset,
}

export async function handleAssetsCommand(args: string[]): Promise<number | null> {
  if (args[0] !== "assets") return null
  try {
    if (args[1] === "generate") {
      const result = await runAssetsGenerate(args.slice(2))
      console.log(formatAssetGenerateResult(result))
      return 0
    }
    if (args[1] === "import") {
      const result = runAssetsImport(args.slice(2))
      console.log(formatAssetImportResult(result))
      return 0
    }
    if (args[1] === "wizard") {
      const result = runAssetsWizard(args.slice(2))
      console.log(formatAssetWizardReport(result))
      return result.pendingCount > 0 ? 1 : 0
    }

    console.error(assetsCommandHelp())
    return 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Asset command failed.")
    return 1
  }
}

export async function runAssetsGenerate(args: string[], deps: AssetCommandDeps = defaultDeps): Promise<AssetGenerateResult> {
  const assetId = safeAssetId(args[0])
  const prompt = promptFromArgs(args)
  const dryRun = args.includes("--dry-run")
  if (!assetId || !prompt) throw new Error("Usage: opendungeon assets generate <asset-id> --prompt <prompt> [--dry-run]")

  if (dryRun) return { assetId, prompt, dryRun }

  const image = await deps.generate(prompt)
  const asset = await deps.store(assetId, image)
  return { assetId, prompt, dryRun, asset, sample: generatedSpriteSampleSummary(image) }
}

export function runAssetsImport(args: string[]): ReferenceAssetImportResult {
  const manifestPath = valueAfter(args, "--manifest")
  if (!manifestPath) throw new Error("Usage: opendungeon assets import --manifest <path> [--source-root <path>] [--runtime-root <path>] [--dry-run]")
  const options: ReferenceAssetImportOptions = {
    sourceRoot: valueAfter(args, "--source-root"),
    runtimeRoot: valueAfter(args, "--runtime-root"),
    dryRun: args.includes("--dry-run"),
    allowUnapproved: args.includes("--allow-unapproved"),
  }
  return importReferenceAssets(loadReferenceAssetImportManifest(manifestPath), options)
}

export function runAssetsWizard(args: string[]): ReferenceAssetWizardReport {
  const manifestPath = valueAfter(args, "--manifest")
  if (!manifestPath) throw new Error("Usage: opendungeon assets wizard --manifest <path> [--source-root <path>] [--runtime-root <path>]")
  return buildReferenceAssetWizardReport(loadReferenceAssetImportManifest(manifestPath), {
    sourceRoot: valueAfter(args, "--source-root"),
    runtimeRoot: valueAfter(args, "--runtime-root"),
    dryRun: true,
  })
}

export function formatAssetGenerateResult(result: AssetGenerateResult) {
  if (result.dryRun) {
    return [`asset generate dry-run`, `assetId: ${result.assetId}`, `prompt: ${result.prompt}`].join("\n")
  }
  return [
    "asset generated",
    `assetId: ${result.assetId}`,
    `backend: ${result.asset?.backend ?? "unknown"}`,
    `path: ${result.asset?.storagePath ?? ""}`,
    result.sample ? `sample: ${result.sample.width}x${result.sample.height} ${result.sample.colorCount} colors ${result.sample.hash}` : "",
  ].filter(Boolean).join("\n")
}

export function formatAssetImportResult(result: ReferenceAssetImportResult) {
  const header = result.dryRun ? "asset import dry-run" : "assets imported"
  const lines = result.imported.map((asset) => {
    const approval = asset.approved ? "approved" : "pending"
    const accessibility = asset.accessibilityScore === undefined ? "" : `, a11y ${asset.accessibilityScore}/100`
    return `${asset.id}: ${asset.target} (${asset.licenseId}, ${approval}${accessibility}, ${asset.sha256.slice(0, 12)})`
  })
  return [header, ...lines].join("\n")
}

export function formatAssetWizardReport(result: ReferenceAssetWizardReport) {
  const title = result.sourceName ? `asset import wizard: ${result.sourceName}` : "asset import wizard"
  const source = result.sourceUrl ? `source: ${result.sourceUrl}` : ""
  const summary = `ready ${result.readyCount}, pending ${result.pendingCount}`
  const lines = result.entries.map((asset) => {
    const status = asset.approvedForImport ? "ready" : "pending"
    const preview = `${asset.terminalPreview.width}x${asset.terminalPreview.height}, ${asset.terminalPreview.colorCount} colors, ${asset.terminalPreview.sampleCell}`
    const accessibility = asset.accessibilityScore === undefined ? "a11y missing" : `a11y ${asset.accessibilityScore}/100`
    const blockers = asset.blockers.length ? ` blockers: ${asset.blockers.join("; ")}` : ""
    return `${asset.id}: ${status}, ${asset.licenseId}, ${accessibility}, ${preview}.${blockers}`
  })
  return [title, source, summary, ...lines].filter(Boolean).join("\n")
}

export function assetsCommandHelp() {
  return `Asset commands:
  opendungeon assets generate <asset-id> --prompt <prompt> [--dry-run]
  opendungeon assets wizard --manifest <path> [--source-root <path>] [--runtime-root <path>]
  opendungeon assets import --manifest <path> [--source-root <path>] [--runtime-root <path>] [--dry-run] [--allow-unapproved]`
}

function promptFromArgs(args: string[]) {
  const index = args.indexOf("--prompt")
  if (index < 0) return ""
  return args.slice(index + 1).filter((part) => !part.startsWith("--")).join(" ").trim()
}

function valueAfter(args: string[], flag: string) {
  const index = args.indexOf(flag)
  const value = index >= 0 ? args[index + 1] : undefined
  return value && !value.startsWith("--") ? value : undefined
}

function safeAssetId(value: unknown) {
  if (typeof value !== "string") return ""
  return value.replace(/[^a-zA-Z0-9._-]/g, "").trim()
}
