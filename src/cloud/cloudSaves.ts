import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import type { SaveSummary } from "../game/saveStore.js"
import { authStatusReport, type AuthStatusReport } from "./authStatus.js"

export type EncryptedSavePayload = {
  version: 1
  algorithm: "aes-256-gcm"
  nonce: string
  tag: string
  ciphertext: string
  checksum: string
}

export type CloudSaveRecord = {
  saveId: string
  ownerId: string
  summary: SaveSummary
  encrypted: EncryptedSavePayload
  updatedAt: string
  generation: number
  syncError?: string
}

export type CloudSaveStore = {
  get(ownerId: string, saveId: string): Promise<CloudSaveRecord | null>
  list(ownerId: string): Promise<CloudSaveRecord[]>
  upsert(record: CloudSaveRecord): Promise<void>
}

export type CloudSaveConflictKind = "none" | "local-newer" | "cloud-newer" | "diverged"
export type CloudSaveConflictPolicy = "reject" | "keep-local" | "use-cloud" | "newer-wins"

export type CloudSaveConflict = {
  kind: CloudSaveConflictKind
  saveId: string
  localSavedAt?: string
  cloudUpdatedAt?: string
  localChecksum?: string
  cloudChecksum?: string
}

export type CloudSaveSyncResult =
  | { status: "uploaded"; record: CloudSaveRecord; conflict: CloudSaveConflict }
  | { status: "downloaded"; record: CloudSaveRecord; plaintext: string; conflict: CloudSaveConflict }
  | { status: "conflict"; conflict: CloudSaveConflict }

export type CloudSaveBrowserRow = {
  saveId: string
  name: string
  localSavedAt?: string
  cloudUpdatedAt?: string
  conflict: CloudSaveConflictKind
  syncError?: string
}

export type CloudSaveBrowserState = {
  accountStatus: string
  syncAvailable: boolean
  rows: CloudSaveBrowserRow[]
  errors: string[]
}

export function encryptSavePayload(plaintext: string, secret: string, nonce = randomBytes(12)): EncryptedSavePayload {
  if (!secret.trim()) throw new Error("Cloud save encryption requires a non-empty secret.")
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    checksum: checksum(plaintext),
  }
}

export function decryptSavePayload(payload: EncryptedSavePayload, secret: string) {
  if (payload.version !== 1 || payload.algorithm !== "aes-256-gcm") throw new Error("Unsupported cloud save encryption envelope.")
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(payload.nonce, "base64"))
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"))
  const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8")
  if (checksum(plaintext) !== payload.checksum) throw new Error("Cloud save checksum mismatch.")
  return plaintext
}

export async function uploadEncryptedSave(
  store: CloudSaveStore,
  input: {
    ownerId: string
    summary: SaveSummary
    plaintext: string
    secret: string
    policy?: CloudSaveConflictPolicy
    now?: Date
  },
): Promise<CloudSaveSyncResult> {
  const existing = await store.get(input.ownerId, input.summary.id)
  const localChecksum = checksum(input.plaintext)
  const conflict = detectCloudSaveConflict(input.summary, existing, localChecksum)
  const policy = input.policy ?? "reject"
  if (shouldRejectUpload(conflict, policy)) return { status: "conflict", conflict }

  const record: CloudSaveRecord = {
    saveId: input.summary.id,
    ownerId: input.ownerId,
    summary: input.summary,
    encrypted: encryptSavePayload(input.plaintext, input.secret),
    updatedAt: (input.now ?? new Date()).toISOString(),
    generation: (existing?.generation ?? 0) + 1,
  }
  await store.upsert(record)
  return { status: "uploaded", record, conflict }
}

export async function downloadEncryptedSave(
  store: CloudSaveStore,
  input: {
    ownerId: string
    saveId: string
    secret: string
    localSummary?: SaveSummary
    policy?: CloudSaveConflictPolicy
  },
): Promise<CloudSaveSyncResult> {
  const record = await store.get(input.ownerId, input.saveId)
  if (!record) throw new Error(`Cloud save not found: ${input.saveId}`)
  const conflict = detectCloudSaveConflict(input.localSummary, record)
  const policy = input.policy ?? "reject"
  if (shouldRejectDownload(conflict, policy)) return { status: "conflict", conflict }
  return { status: "downloaded", record, plaintext: decryptSavePayload(record.encrypted, input.secret), conflict }
}

export function detectCloudSaveConflict(local: SaveSummary | undefined, cloud: CloudSaveRecord | null | undefined, localChecksum?: string): CloudSaveConflict {
  const saveId = local?.id ?? cloud?.saveId ?? ""
  if (!local || !cloud) return { kind: "none", saveId, localSavedAt: local?.savedAt, cloudUpdatedAt: cloud?.updatedAt, localChecksum, cloudChecksum: cloud?.encrypted.checksum }
  if (localChecksum && localChecksum === cloud.encrypted.checksum) return { kind: "none", saveId, localSavedAt: local.savedAt, cloudUpdatedAt: cloud.updatedAt, localChecksum, cloudChecksum: cloud.encrypted.checksum }

  const localTime = Date.parse(local.savedAt)
  const cloudTime = Date.parse(cloud.updatedAt)
  const kind =
    Number.isFinite(localTime) && Number.isFinite(cloudTime)
      ? localTime > cloudTime
        ? "local-newer"
        : cloudTime > localTime
          ? "cloud-newer"
          : "diverged"
      : "diverged"
  return { kind, saveId, localSavedAt: local.savedAt, cloudUpdatedAt: cloud.updatedAt, localChecksum, cloudChecksum: cloud.encrypted.checksum }
}

export function buildCloudSaveBrowserState(
  localSaves: SaveSummary[],
  cloudSaves: CloudSaveRecord[],
  report: AuthStatusReport = authStatusReport(),
): CloudSaveBrowserState {
  const rows = new Map<string, CloudSaveBrowserRow>()
  for (const local of localSaves) {
    const cloud = cloudSaves.find((record) => record.saveId === local.id)
    const conflict = detectCloudSaveConflict(local, cloud)
    rows.set(local.id, {
      saveId: local.id,
      name: local.name,
      localSavedAt: local.savedAt,
      cloudUpdatedAt: cloud?.updatedAt,
      conflict: conflict.kind,
      syncError: cloud?.syncError,
    })
  }
  for (const cloud of cloudSaves) {
    if (rows.has(cloud.saveId)) continue
    rows.set(cloud.saveId, {
      saveId: cloud.saveId,
      name: cloud.summary.name,
      cloudUpdatedAt: cloud.updatedAt,
      conflict: "none",
      syncError: cloud.syncError,
    })
  }

  return {
    accountStatus: report.accountLabel,
    syncAvailable: report.syncAvailable,
    rows: [...rows.values()].sort((left, right) => (right.localSavedAt ?? right.cloudUpdatedAt ?? "").localeCompare(left.localSavedAt ?? left.cloudUpdatedAt ?? "")),
    errors: [...report.warnings, ...cloudSaves.flatMap((save) => (save.syncError ? [`${save.summary.name}: ${save.syncError}`] : []))],
  }
}

function shouldRejectUpload(conflict: CloudSaveConflict, policy: CloudSaveConflictPolicy) {
  if (conflict.kind === "none" || conflict.kind === "local-newer") return false
  return policy === "reject" || policy === "use-cloud" || (policy === "newer-wins" && conflict.kind === "cloud-newer")
}

function shouldRejectDownload(conflict: CloudSaveConflict, policy: CloudSaveConflictPolicy) {
  if (conflict.kind === "none" || conflict.kind === "cloud-newer") return false
  return policy === "reject" || policy === "keep-local" || (policy === "newer-wins" && conflict.kind === "local-newer")
}

function encryptionKey(secret: string) {
  return createHash("sha256").update(secret).digest()
}

function checksum(value: string) {
  return createHash("sha256").update(value).digest("hex")
}
