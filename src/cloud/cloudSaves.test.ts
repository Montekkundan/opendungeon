import { describe, expect, test } from "bun:test"
import type { SaveSummary } from "../game/saveStore.js"
import {
  buildCloudSaveBrowserState,
  decryptSavePayload,
  detectCloudSaveConflict,
  downloadEncryptedSave,
  encryptSavePayload,
  uploadEncryptedSave,
  type CloudSaveRecord,
  type CloudSaveStore,
} from "./cloudSaves.js"

describe("cloud saves", () => {
  test("encrypts and decrypts save JSON envelopes", () => {
    const encrypted = encryptSavePayload(`{"turn":4}`, "secret", Buffer.alloc(12, 1))

    expect(encrypted.algorithm).toBe("aes-256-gcm")
    expect(encrypted.ciphertext).not.toContain("turn")
    expect(decryptSavePayload(encrypted, "secret")).toBe(`{"turn":4}`)
    expect(() => decryptSavePayload(encrypted, "wrong")).toThrow()
  })

  test("uploads and downloads through an injected store", async () => {
    const store = memoryStore()
    const summary = saveSummary("manual-1", "2026-05-08T12:00:00.000Z")

    const upload = await uploadEncryptedSave(store, {
      ownerId: "user-1",
      summary,
      plaintext: `{"save":"manual-1"}`,
      secret: "token",
      now: new Date("2026-05-08T12:01:00.000Z"),
    })

    expect(upload.status).toBe("uploaded")
    const download = await downloadEncryptedSave(store, {
      ownerId: "user-1",
      saveId: "manual-1",
      secret: "token",
    })

    expect(download.status).toBe("downloaded")
    expect(download.status === "downloaded" ? download.plaintext : "").toBe(`{"save":"manual-1"}`)
  })

  test("detects conflicts before mutating cloud saves", async () => {
    const store = memoryStore()
    const local = saveSummary("manual-1", "2026-05-08T12:00:00.000Z")
    await uploadEncryptedSave(store, {
      ownerId: "user-1",
      summary: local,
      plaintext: `{"save":"old"}`,
      secret: "token",
      now: new Date("2026-05-08T12:10:00.000Z"),
    })

    const result = await uploadEncryptedSave(store, {
      ownerId: "user-1",
      summary: saveSummary("manual-1", "2026-05-08T12:05:00.000Z"),
      plaintext: `{"save":"local"}`,
      secret: "token",
    })

    expect(result.status).toBe("conflict")
    expect(result.conflict.kind).toBe("cloud-newer")
  })

  test("builds a cloud save browser state with auth and sync errors", () => {
    const local = saveSummary("manual-1", "2026-05-08T12:00:00.000Z")
    const cloud: CloudSaveRecord = {
      saveId: "manual-2",
      ownerId: "user-1",
      summary: saveSummary("manual-2", "2026-05-08T11:00:00.000Z"),
      encrypted: encryptSavePayload("{}", "token", Buffer.alloc(12, 2)),
      updatedAt: "2026-05-08T12:03:00.000Z",
      generation: 1,
      syncError: "quota exceeded",
    }

    const browser = buildCloudSaveBrowserState([local], [cloud], {
      kind: "active",
      loggedIn: true,
      provider: "github",
      username: "mira",
      accountLabel: "GitHub @mira",
      canRefresh: true,
      syncAvailable: true,
      warnings: [],
    })

    expect(browser.accountStatus).toBe("GitHub @mira")
    expect(browser.rows.map((row) => row.saveId)).toEqual(["manual-2", "manual-1"])
    expect(browser.errors[0]).toContain("quota exceeded")
    expect(detectCloudSaveConflict(local, cloud).kind).toBe("cloud-newer")
  })
})

function memoryStore(): CloudSaveStore {
  const records = new Map<string, CloudSaveRecord>()
  return {
    async get(ownerId, saveId) {
      return records.get(`${ownerId}:${saveId}`) ?? null
    },
    async list(ownerId) {
      return [...records.values()].filter((record) => record.ownerId === ownerId)
    },
    async upsert(record) {
      records.set(`${record.ownerId}:${record.saveId}`, record)
    },
  }
}

function saveSummary(id: string, savedAt: string): SaveSummary {
  return {
    id,
    name: `Manual save: ${id}`,
    savedAt,
    runId: `run-${id}`,
    startedAt: "2026-05-08T11:00:00.000Z",
    heroName: "Mira",
    heroTitle: "Ranger",
    classId: "ranger",
    mode: "solo",
    seed: 1234,
    floor: 1,
    finalFloor: 5,
    turn: 4,
    level: 1,
    gold: 0,
    status: "running",
    path: `/tmp/${id}.json`,
    slot: "manual",
    thumbnail: [],
  }
}
