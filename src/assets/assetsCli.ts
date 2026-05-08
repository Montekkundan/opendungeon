import { generateSpriteImage, type GeneratedImage } from "../cloud/aiGateway.js"
import { storeGeneratedSpriteAsset, type StoredGeneratedAsset } from "../cloud/generatedAssets.js"

type AssetCommandDeps = {
  generate: (prompt: string) => Promise<GeneratedImage>
  store: (assetId: string, image: GeneratedImage) => Promise<StoredGeneratedAsset>
}

export type AssetGenerateResult = {
  assetId: string
  prompt: string
  dryRun: boolean
  asset?: StoredGeneratedAsset
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
  return { assetId, prompt, dryRun, asset }
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
  ].join("\n")
}

export function assetsCommandHelp() {
  return `Asset commands:
  opendungeon assets generate <asset-id> --prompt <prompt> [--dry-run]`
}

function promptFromArgs(args: string[]) {
  const index = args.indexOf("--prompt")
  if (index < 0) return ""
  return args.slice(index + 1).filter((part) => !part.startsWith("--")).join(" ").trim()
}

function safeAssetId(value: unknown) {
  if (typeof value !== "string") return ""
  return value.replace(/[^a-zA-Z0-9._-]/g, "").trim()
}
