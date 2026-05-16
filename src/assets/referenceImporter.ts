import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path"
import { assetPath } from "./spriteSampler.js"

const acceptedReferenceLicenseIds = [
  "project-owned",
  "CC0-1.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC-BY-SA-3.0",
  "CC-BY-SA-4.0",
  "OGA-BY-3.0",
  "MIT",
] as const

export type ReferenceAssetLicenseId = (typeof acceptedReferenceLicenseIds)[number]

export type ReferenceAssetLicense = {
  id: ReferenceAssetLicenseId | string
  name?: string
  author?: string
  sourceUrl?: string
  file?: string
}

export type ReferenceAssetEntry = {
  id: string
  kind?: "actor-sheet" | "portrait-sheet" | "dice-sheet" | "item-sheet" | "terrain-sheet"
  source: string
  target: string
  sha256?: string
  license: ReferenceAssetLicense
  approved?: boolean
  accessibilityScore?: number
  notes?: string
}

export type ReferenceAssetImportManifest = {
  version: 1
  source?: {
    name?: string
    url?: string
    downloadedTo?: string
    reviewedBy?: string
    notes?: string
  }
  assets: ReferenceAssetEntry[]
}

export type ReferenceAssetImportOptions = {
  sourceRoot?: string
  runtimeRoot?: string
  dryRun?: boolean
  allowUnapproved?: boolean
}

export type ImportedReferenceAsset = {
  id: string
  source: string
  target: string
  licenseId: string
  sha256: string
  approved: boolean
  accessibilityScore?: number
}

export type ReferenceAssetImportResult = {
  dryRun: boolean
  imported: ImportedReferenceAsset[]
}

export function loadReferenceAssetImportManifest(path: string): ReferenceAssetImportManifest {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as ReferenceAssetImportManifest
  const errors = validateReferenceAssetImportManifest(parsed)
  if (errors.length) throw new Error(`Invalid reference asset manifest: ${errors.join(" ")}`)
  return parsed
}

export function validateReferenceAssetImportManifest(manifest: Partial<ReferenceAssetImportManifest> | undefined): string[] {
  const errors: string[] = []
  if (!manifest || manifest.version !== 1) errors.push("version must be 1.")
  if (!Array.isArray(manifest?.assets)) {
    errors.push("assets must be an array.")
    return errors
  }

  const ids = new Set<string>()
  manifest.assets.forEach((asset, index) => {
    const label = asset?.id || `asset ${index}`
    if (!safeId(asset?.id)) errors.push(`${label} needs a safe id.`)
    if (asset?.id && ids.has(asset.id)) errors.push(`${label} duplicates an asset id.`)
    if (asset?.id) ids.add(asset.id)
    if (!asset?.source || typeof asset.source !== "string") errors.push(`${label} needs a source path.`)
    if (!safeRuntimeTarget(asset?.target)) errors.push(`${label} target must stay under runtime/.`)
    if (asset?.sha256 && !/^[a-f0-9]{64}$/i.test(asset.sha256)) errors.push(`${label} sha256 must be 64 hex chars.`)
    if (asset?.approved !== undefined && typeof asset.approved !== "boolean") errors.push(`${label} approved must be true or false.`)
    if (asset?.accessibilityScore !== undefined && !validAccessibilityScore(asset.accessibilityScore)) errors.push(`${label} accessibilityScore must be 0-100.`)
    validateLicense(label, asset?.license, errors)
  })

  return errors
}

export function importReferenceAssets(manifest: ReferenceAssetImportManifest, options: ReferenceAssetImportOptions = {}): ReferenceAssetImportResult {
  const errors = validateReferenceAssetImportManifest(manifest)
  if (errors.length) throw new Error(`Invalid reference asset manifest: ${errors.join(" ")}`)

  const sourceRoot = resolve(options.sourceRoot ?? process.cwd())
  const runtimeRoot = resolve(options.runtimeRoot ?? assetPath("opendungeon-assets"))
  const imported: ImportedReferenceAsset[] = []

  for (const asset of manifest.assets) {
    const source = resolveSource(sourceRoot, asset.source)
    const target = resolveInside(runtimeRoot, safeRuntimeTarget(asset.target) || asset.target)
    const licenseFile = asset.license.file ? resolveSource(sourceRoot, asset.license.file) : null

    if (!existsSync(source) || !statSync(source).isFile()) throw new Error(`Reference asset ${asset.id} source is missing: ${source}`)
    if (licenseFile && (!existsSync(licenseFile) || !statSync(licenseFile).isFile())) throw new Error(`Reference asset ${asset.id} license file is missing: ${licenseFile}`)
    if (!options.dryRun && !options.allowUnapproved && asset.approved !== true) throw new Error(`Reference asset ${asset.id} is not approved. Run a dry-run review first or pass --allow-unapproved for local experiments.`)

    const hash = sha256File(source)
    if (asset.sha256 && hash !== asset.sha256.toLowerCase()) throw new Error(`Reference asset ${asset.id} hash mismatch: expected ${asset.sha256}, got ${hash}`)

    imported.push({
      id: asset.id,
      source,
      target,
      licenseId: asset.license.id,
      sha256: hash,
      approved: asset.approved === true,
      accessibilityScore: asset.accessibilityScore,
    })

    if (!options.dryRun) {
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(source, target)
    }
  }

  return { dryRun: Boolean(options.dryRun), imported }
}

function validateLicense(label: string, license: ReferenceAssetLicense | undefined, errors: string[]) {
  if (!license || typeof license !== "object") {
    errors.push(`${label} needs license metadata.`)
    return
  }
  if (!acceptedReferenceLicenseIds.includes(license.id as ReferenceAssetLicenseId)) errors.push(`${label} uses unsupported license ${String(license.id)}.`)
  if (license.id !== "project-owned" && !license.sourceUrl && !license.file) errors.push(`${label} needs a sourceUrl or license file.`)
}

function safeRuntimeTarget(target: unknown) {
  if (typeof target !== "string" || !target.trim() || isAbsolute(target)) return ""
  const safe = normalize(target).replace(/\\/g, "/")
  if (safe === "runtime" || safe.startsWith("../") || safe.includes("/../")) return ""
  return safe.startsWith("runtime/") ? safe : ""
}

function safeId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]+$/.test(value)
}

function validAccessibilityScore(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100
}

function resolveSource(sourceRoot: string, path: string) {
  return isAbsolute(path) ? resolve(path) : resolve(sourceRoot, path)
}

function resolveInside(root: string, target: string) {
  const resolvedRoot = resolve(root)
  const resolvedTarget = resolve(resolvedRoot, target)
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${sep}`)) throw new Error(`Path escapes asset root: ${target}`)
  return resolvedTarget
}

function sha256File(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}
