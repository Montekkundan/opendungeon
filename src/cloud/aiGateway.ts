import { writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type GatewayStatus = {
  configured: boolean
  model: string
  available: boolean
  message: string
}

export type GeneratedImage = {
  model: string
  mimeType: "image/png"
  bytes: Uint8Array
}

const gatewayBaseUrl = "https://ai-gateway.vercel.sh/v1"

export async function checkAiGatewayImageModel(model = "openai/gpt-image-2"): Promise<GatewayStatus> {
  const token = gatewayToken()

  try {
    const response = await fetch(`${gatewayBaseUrl}/models`, {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    })
    if (!response.ok) return { configured: Boolean(token), model, available: false, message: `AI Gateway models check failed with HTTP ${response.status}.` }
    const body = (await response.json()) as unknown
    const ids = modelIds(body)
    const available = ids.includes(model)
    return {
      configured: Boolean(token),
      model,
      available,
      message: available ? `${model} is listed by AI Gateway.` : `${model} was not listed by AI Gateway.`,
    }
  } catch (error) {
    return { configured: Boolean(token), model, available: false, message: error instanceof Error ? error.message : "AI Gateway check failed." }
  }
}

export async function generateSpriteImage(prompt: string, model = "openai/gpt-image-2"): Promise<GeneratedImage> {
  const token = gatewayToken()
  if (!token) throw new Error("AI Gateway token is not configured.")
  const response = await fetch(`${gatewayBaseUrl}/images/generations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      size: process.env.OPENDUNGEON_IMAGE_SIZE || "1024x1024",
      quality: process.env.OPENDUNGEON_IMAGE_QUALITY || "low",
      response_format: "b64_json",
    }),
  })
  if (!response.ok) throw new Error(`AI Gateway image generation failed with HTTP ${response.status}.`)
  const parsed = (await response.json()) as { data?: Array<{ b64_json?: string }> }
  const b64 = parsed.data?.[0]?.b64_json
  if (!b64) throw new Error("AI Gateway image generation did not return b64_json.")
  return { model, mimeType: "image/png", bytes: Uint8Array.from(Buffer.from(b64, "base64")) }
}

export function writeGeneratedImageLocal(assetId: string, image: GeneratedImage) {
  const path = join(generatedAssetDirectory(), `${safeAssetId(assetId)}.png`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, image.bytes)
  return path
}

export function generatedAssetDirectory() {
  return process.env.OPENDUNGEON_GENERATED_ASSET_DIR || join(homedir(), ".opendungeon", "generated-assets")
}

function gatewayToken() {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.OPENDUNGEON_AI_GATEWAY_TOKEN || ""
}

function modelIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return []
  const data = (body as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  return data.flatMap((entry) => (entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string" ? [(entry as { id: string }).id] : []))
}

function safeAssetId(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "")
  if (!safe) throw new Error("Invalid asset id")
  return safe
}
