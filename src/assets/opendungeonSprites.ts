export const sourceTileSize = 64
export const animationFrameCount = 4

export const spriteSheetPaths = {
  terrain: "assets/opendungeon/terrain.png",
  items: "assets/opendungeon/items.png",
  actors: "assets/opendungeon/actors.png",
} as const

export type SpriteSheetId = keyof typeof spriteSheetPaths

export type SpriteCrop = {
  sheet: SpriteSheetId
  tileX: number
  tileY: number
  transparent?: boolean
}

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

export const staticSpriteCrops = {
  "floor-a": { sheet: "terrain", tileX: 0, tileY: 0 },
  "floor-b": { sheet: "terrain", tileX: 1, tileY: 0 },
  "floor-c": { sheet: "terrain", tileX: 2, tileY: 0 },
  "wall-a": { sheet: "terrain", tileX: 3, tileY: 0 },
  "wall-b": { sheet: "terrain", tileX: 4, tileY: 0 },
  stairs: { sheet: "terrain", tileX: 5, tileY: 0, transparent: true },
  door: { sheet: "terrain", tileX: 6, tileY: 0, transparent: true },
  void: { sheet: "terrain", tileX: 7, tileY: 0 },

  potion: { sheet: "items", tileX: 0, tileY: 0, transparent: true },
  relic: { sheet: "items", tileX: 1, tileY: 0, transparent: true },
  chest: { sheet: "items", tileX: 2, tileY: 0, transparent: true },
  coin: { sheet: "items", tileX: 3, tileY: 0, transparent: true },
  scroll: { sheet: "items", tileX: 4, tileY: 0, transparent: true },
  "focus-gem": { sheet: "items", tileX: 5, tileY: 0, transparent: true },
  ember: { sheet: "items", tileX: 6, tileY: 0, transparent: true },
  sword: { sheet: "items", tileX: 7, tileY: 0, transparent: true },
  bow: { sheet: "items", tileX: 0, tileY: 1, transparent: true },
  staff: { sheet: "items", tileX: 1, tileY: 1, transparent: true },
  dagger: { sheet: "items", tileX: 2, tileY: 1, transparent: true },
  axe: { sheet: "items", tileX: 3, tileY: 1, transparent: true },
  shield: { sheet: "items", tileX: 4, tileY: 1, transparent: true },
  armor: { sheet: "items", tileX: 5, tileY: 1, transparent: true },
  key: { sheet: "items", tileX: 6, tileY: 1, transparent: true },
  map: { sheet: "items", tileX: 7, tileY: 1, transparent: true },
  trap: { sheet: "items", tileX: 0, tileY: 2, transparent: true },
  dice: { sheet: "items", tileX: 1, tileY: 2, transparent: true },
} as const satisfies Record<string, SpriteCrop>

export const pixelSpriteIds = [...Object.keys(staticSpriteCrops), ...animatedSpriteIds] as PixelSpriteId[]

export type StaticSpriteId = keyof typeof staticSpriteCrops
export type PixelSpriteId = StaticSpriteId | AnimatedSpriteId

export const weaponSpriteIds = ["sword", "bow", "staff", "dagger", "axe", "shield"] as const
export const lootSpriteIds = ["potion", "relic", "chest", "coin", "scroll", "focus-gem", "ember", "key", "map"] as const

export function cropForSprite(id: PixelSpriteId, animation: SpriteAnimationId = "idle", frame = 0): SpriteCrop {
  if (isAnimatedSprite(id)) {
    const actorIndex = animatedSpriteIds.indexOf(id)
    const animationIndex = spriteAnimations.indexOf(animation)
    const safeAnimationIndex = animationIndex >= 0 ? animationIndex : 0
    return {
      sheet: "actors",
      tileX: wrap(frame, animationFrameCount),
      tileY: actorIndex * spriteAnimations.length + safeAnimationIndex,
      transparent: true,
    }
  }

  return staticSpriteCrops[id]
}

export function isAnimatedSprite(id: string): id is AnimatedSpriteId {
  return (animatedSpriteIds as readonly string[]).includes(id)
}

export function animationFramesForSprite(id: PixelSpriteId, animation: SpriteAnimationId) {
  return isAnimatedSprite(id) && spriteAnimations.includes(animation) ? animationFrameCount : 1
}

function wrap(value: number, count: number) {
  return ((Math.round(value) % count) + count) % count
}
