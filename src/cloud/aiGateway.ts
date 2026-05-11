import { writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { buildSpriteImagePrompt } from "../assets/spriteGenerationSkill.js"

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

export type GatewayJsonRequest = {
  model?: string
  system: string
  prompt: string
  temperature?: number
  maxTokens?: number
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
      prompt: buildSpriteImagePrompt(prompt),
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

export async function generateGatewayJson<T = unknown>(request: GatewayJsonRequest): Promise<T> {
  const token = gatewayToken()
  if (!token) throw new Error("AI Gateway token is not configured.")
  const response = await fetch(`${gatewayBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: request.model || process.env.OPENDUNGEON_AI_ADMIN_MODEL || "openai/gpt-5.4",
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt },
      ],
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 6000,
      response_format: { type: "json_object" },
      stream: false,
    }),
  })
  if (!response.ok) throw new Error(`AI Gateway JSON generation failed with HTTP ${response.status}.`)
  const parsed = (await response.json()) as unknown
  const text = chatCompletionText(parsed)
  if (!text) throw new Error("AI Gateway JSON generation did not return message content.")
  try {
    return JSON.parse(text) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON"
    throw new Error(`AI Gateway JSON generation returned invalid JSON: ${message}`)
  }
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

function chatCompletionText(body: unknown): string {
  if (!body || typeof body !== "object") return ""
  const choices = (body as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return ""
  const message = choices.find((choice) => choice && typeof choice === "object") as { message?: { content?: unknown } } | undefined
  const content = message?.message?.content
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const record = part as { text?: unknown; type?: unknown }
      return typeof record.text === "string" ? record.text : ""
    })
    .join("")
}

function safeAssetId(id: string) {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "")
  if (!safe) throw new Error("Invalid asset id")
  return safe
}
