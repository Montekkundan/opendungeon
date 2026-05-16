import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { dirname, isAbsolute, normalize, resolve, sep } from "node:path"
import { PNG } from "pngjs"
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

export type ReferenceAssetWizardEntry = ImportedReferenceAsset & {
  kind?: ReferenceAssetEntry["kind"]
  approvedForImport: boolean
  licenseAccepted: boolean
  terminalPreview: {
    width: number
    height: number
    colorCount: number
    transparentPixels: number
    opaquePixels: number
    sampleCell: string
  }
  blockers: string[]
  notes?: string
}

export type ReferenceAssetWizardReport = {
  sourceName?: string
  sourceUrl?: string
  readyCount: number
  pendingCount: number
  entries: ReferenceAssetWizardEntry[]
}

type TerminalPreview = ReferenceAssetWizardEntry["terminalPreview"]

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

export function buildReferenceAssetWizardReport(manifest: ReferenceAssetImportManifest, options: ReferenceAssetImportOptions = {}): ReferenceAssetWizardReport {
  const errors = validateReferenceAssetImportManifest(manifest)
  if (errors.length) throw new Error(`Invalid reference asset manifest: ${errors.join(" ")}`)

  const sourceRoot = resolve(options.sourceRoot ?? process.cwd())
  const runtimeRoot = resolve(options.runtimeRoot ?? assetPath("opendungeon-assets"))
  const entries = manifest.assets.map((asset) => {
    const source = resolveSource(sourceRoot, asset.source)
    const target = resolveInside(runtimeRoot, safeRuntimeTarget(asset.target) || asset.target)
    const licenseFile = asset.license.file ? resolveSource(sourceRoot, asset.license.file) : null
    const blockers: string[] = []
    if (!existsSync(source) || !statSync(source).isFile()) blockers.push(`missing source ${source}`)
    if (licenseFile && (!existsSync(licenseFile) || !statSync(licenseFile).isFile())) blockers.push(`missing license file ${licenseFile}`)
    if (asset.approved !== true) blockers.push("not approved")
    if (asset.accessibilityScore === undefined) blockers.push("missing accessibility score")
    if (asset.accessibilityScore !== undefined && asset.accessibilityScore < 70) blockers.push("accessibility score below 70")

    const hash = blockers.some((blocker) => blocker.startsWith("missing source")) ? "" : sha256File(source)
    if (asset.sha256 && hash && hash !== asset.sha256.toLowerCase()) blockers.push(`hash mismatch expected ${asset.sha256}`)

    const terminalPreview = hash ? terminalPreviewSummary(source) : emptyPreview()
    blockers.push(...terminalPreviewBlockers(terminalPreview))
    return {
      id: asset.id,
      kind: asset.kind,
      source,
      target,
      licenseId: asset.license.id,
      sha256: hash,
      approved: asset.approved === true,
      approvedForImport: blockers.length === 0,
      licenseAccepted: acceptedReferenceLicenseIds.includes(asset.license.id as ReferenceAssetLicenseId),
      accessibilityScore: asset.accessibilityScore,
      terminalPreview,
      blockers,
      notes: asset.notes,
    }
  })

  return {
    sourceName: manifest.source?.name,
    sourceUrl: manifest.source?.url,
    readyCount: entries.filter((entry) => entry.approvedForImport).length,
    pendingCount: entries.filter((entry) => !entry.approvedForImport).length,
    entries,
  }
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

function terminalPreviewSummary(path: string) {
  const png = PNG.sync.read(readFileSync(path))
  const colors = new Set<string>()
  let transparentPixels = 0
  let opaquePixels = 0
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const index = (png.width * y + x) << 2
      const alpha = png.data[index + 3]
      if (alpha < 36) {
        transparentPixels += 1
        continue
      }
      opaquePixels += 1
      colors.add(`${png.data[index]},${png.data[index + 1]},${png.data[index + 2]}`)
    }
  }

  return {
    width: png.width,
    height: png.height,
    colorCount: colors.size,
    transparentPixels,
    opaquePixels,
    sampleCell: previewCell(colors.size, opaquePixels, transparentPixels),
  }
}

function emptyPreview() {
  return {
    width: 0,
    height: 0,
    colorCount: 0,
    transparentPixels: 0,
    opaquePixels: 0,
    sampleCell: "missing",
  }
}

function previewCell(colorCount: number, opaquePixels: number, transparentPixels: number) {
  if (opaquePixels === 0) return "empty"
  if (colorCount <= 3) return "low-detail"
  if (transparentPixels > opaquePixels * 4) return "sparse"
  if (colorCount > 64) return "too-many-colors"
  return "terminal-readable"
}

function terminalPreviewBlockers(preview: TerminalPreview) {
  const blockers: string[] = []
  if (preview.sampleCell === "missing") return blockers
  if (preview.opaquePixels === 0) blockers.push("terminal preview has no visible pixels")
  if (preview.width > 192 || preview.height > 192) blockers.push("high-resolution source must be downsampled before runtime import")
  if (preview.width > 512 || preview.height > 512) blockers.push("source image is too large for terminal import")
  if (preview.colorCount > 64) blockers.push("too many colors for terminal-native sampling")
  if (preview.sampleCell === "low-detail") blockers.push("terminal preview has too little detail")
  if (preview.sampleCell === "sparse") blockers.push("terminal preview is too sparse")
  return blockers
}
