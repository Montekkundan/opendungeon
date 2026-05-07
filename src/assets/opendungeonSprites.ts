export const animationFrameCount = 4
export const diceFrameCount = 12

export const spriteAnimations = [
  "idle",
  "walk",
  "attack-melee",
  "attack-ranged",
  "cast",
  "talk",
  "shocked",
  "hurt",
  "death",
] as const

export type SpriteAnimationId = (typeof spriteAnimations)[number]

export const animatedSpriteIds = [
  "hero-ranger",
  "hero-warden",
  "hero-arcanist",
  "npc-smith",
  "npc-oracle",
  "slime",
  "ghoul",
  "necromancer",
  "boss-forgemaster",
  "boss-lich",
  "boss-minotaur",
] as const

export type AnimatedSpriteId = (typeof animatedSpriteIds)[number]

export const staticSpriteIds = [
  "floor-a",
  "floor-b",
  "floor-c",
  "wall-a",
  "wall-b",
  "stairs",
  "door",
  "void",
  "potion",
  "relic",
  "chest",
  "coin",
  "scroll",
  "focus-gem",
  "ember",
  "sword",
  "bow",
  "staff",
  "dagger",
  "axe",
  "shield",
  "armor",
  "key",
  "map",
  "trap",
  "dice",
] as const

export type StaticSpriteId = (typeof staticSpriteIds)[number]
export type PixelSpriteId = StaticSpriteId | AnimatedSpriteId

export const pixelSpriteIds = [...staticSpriteIds, ...animatedSpriteIds] as PixelSpriteId[]
export const weaponSpriteIds = ["sword", "bow", "staff", "dagger", "axe", "shield"] as const
export const lootSpriteIds = ["potion", "relic", "chest", "coin", "scroll", "focus-gem", "ember", "key", "map"] as const

export function isAnimatedSprite(id: string): id is AnimatedSpriteId {
  return (animatedSpriteIds as readonly string[]).includes(id)
}

export function isStaticSprite(id: string): id is StaticSpriteId {
  return (staticSpriteIds as readonly string[]).includes(id)
}

export function animationFramesForSprite(id: PixelSpriteId, animation: SpriteAnimationId) {
  return isAnimatedSprite(id) && spriteAnimations.includes(animation) ? animationFrameCount : 1
}
