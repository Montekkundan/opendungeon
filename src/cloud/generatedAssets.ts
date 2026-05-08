import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServiceClient } from "./supabase.js"
import { writeGeneratedImageLocal, type GeneratedImage } from "./aiGateway.js"

export type StoredGeneratedAsset = {
  assetId: string
  storagePath: string
  backend: "supabase" | "local"
}

export async function storeGeneratedSpriteAsset(assetId: string, image: GeneratedImage, client: SupabaseClient | null = createSupabaseServiceClient()): Promise<StoredGeneratedAsset> {
  const bucket = process.env.OPENDUNGEON_ASSET_BUCKET || "opendungeon-assets"
  const storagePath = `generated/${safeAssetId(assetId)}.png`
  if (client) {
    const { error } = await client.storage.from(bucket).upload(storagePath, image.bytes, {
      contentType: image.mimeType,
      cacheControl: "31536000",
      upsert: true,
    })
    if (!error) return { assetId, storagePath: `${bucket}/${storagePath}`, backend: "supabase" }
  }

  return {
    assetId,
    storagePath: writeGeneratedImageLocal(assetId, image),
    backend: "local",
  }
}

function safeAssetId(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "")
  if (!safe) throw new Error("Invalid asset id")
  return safe
}
