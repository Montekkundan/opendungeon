import { existsSync, readFileSync } from "node:fs"
import { assetPath } from "./spriteSampler.js"

export const spriteGenerationSkillAssetPath = "opendungeon-assets/skills/ai-admin-sprite-generation.md"

let cachedSkill: string | null = null

export function loadSpriteGenerationSkill() {
  if (cachedSkill !== null) return cachedSkill
  const path = assetPath(...spriteGenerationSkillAssetPath.split("/"))
  cachedSkill = existsSync(path) ? readFileSync(path, "utf8").trim() : fallbackSpriteGenerationSkill()
  return cachedSkill
}

export function buildSpriteImagePrompt(prompt: string) {
  return [
    "Use the following OpenDungeon sprite generation skill as hard production guidance.",
    loadSpriteGenerationSkill(),
    "Asset request:",
    prompt.trim(),
  ].join("\n\n")
}

function fallbackSpriteGenerationSkill() {
  return [
    "# OpenDungeon AI Sprite Generation Skill",
    "Create original crisp pixel art for a terminal-rendered top-down RPG.",
    "Use transparent backgrounds for actors, items, and icons.",
    "Prefer 18x18 actor frames, 8x8 tiles, 8x8 icons, hard pixels, limited palettes, and strong silhouettes.",
    "Avoid antialiasing, blur, gradients, noisy terrain texture, text in images, copyrighted game likenesses, and copied asset packs.",
  ].join("\n")
}

