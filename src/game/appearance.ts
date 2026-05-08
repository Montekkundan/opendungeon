export const cosmeticPaletteIds = ["class-default", "ember", "moonlit", "verdant", "royal"] as const
export const portraitVariantIds = ["class-default", "hooded", "masked", "scarred"] as const
export const heroWeaponSpriteIds = ["class-default", "sword", "bow", "staff", "dagger", "axe", "shield"] as const
export const heroAnimationSetIds = ["class-default", "ranger", "warden", "arcanist"] as const

export type CosmeticPaletteId = (typeof cosmeticPaletteIds)[number]
export type PortraitVariantId = (typeof portraitVariantIds)[number]
export type HeroWeaponSpriteId = (typeof heroWeaponSpriteIds)[number]
export type HeroAnimationSetId = (typeof heroAnimationSetIds)[number]

export type HeroAppearance = {
  portraitVariantId: PortraitVariantId
  cosmeticPaletteId: CosmeticPaletteId
  weaponSpriteId: HeroWeaponSpriteId
  animationSetId: HeroAnimationSetId
}

export function defaultAppearanceForClass(classId: string): HeroAppearance {
  return {
    portraitVariantId: "class-default",
    cosmeticPaletteId: "class-default",
    weaponSpriteId: defaultWeaponSpriteForClass(classId),
    animationSetId: defaultAnimationSetForClass(classId),
  }
}

export function normalizeHeroAppearance(classId: string, appearance?: Partial<HeroAppearance> | null): HeroAppearance {
  const defaults = defaultAppearanceForClass(classId)
  return {
    portraitVariantId: oneOf(appearance?.portraitVariantId, portraitVariantIds, defaults.portraitVariantId),
    cosmeticPaletteId: oneOf(appearance?.cosmeticPaletteId, cosmeticPaletteIds, defaults.cosmeticPaletteId),
    weaponSpriteId: oneOf(appearance?.weaponSpriteId, heroWeaponSpriteIds, defaults.weaponSpriteId),
    animationSetId: oneOf(appearance?.animationSetId, heroAnimationSetIds, defaults.animationSetId),
  }
}

export function cycleCosmeticPalette(classId: string, appearance: Partial<HeroAppearance> | undefined, delta: number) {
  const current = normalizeHeroAppearance(classId, appearance)
  return { ...current, cosmeticPaletteId: cycle(current.cosmeticPaletteId, cosmeticPaletteIds, delta) }
}

export function cyclePortraitVariant(classId: string, appearance: Partial<HeroAppearance> | undefined, delta: number) {
  const current = normalizeHeroAppearance(classId, appearance)
  return { ...current, portraitVariantId: cycle(current.portraitVariantId, portraitVariantIds, delta) }
}

export function cycleHeroWeaponSprite(classId: string, appearance: Partial<HeroAppearance> | undefined, delta: number) {
  const current = normalizeHeroAppearance(classId, appearance)
  return { ...current, weaponSpriteId: cycle(current.weaponSpriteId, heroWeaponSpriteIds, delta) }
}

export function cycleHeroAnimationSet(classId: string, appearance: Partial<HeroAppearance> | undefined, delta: number) {
  const current = normalizeHeroAppearance(classId, appearance)
  return { ...current, animationSetId: cycle(current.animationSetId, heroAnimationSetIds, delta) }
}

export function heroSpriteForAppearance(classId: string, appearance?: Partial<HeroAppearance> | null) {
  const animationSet = normalizeHeroAppearance(classId, appearance).animationSetId
  if (animationSet === "arcanist") return "hero-arcanist"
  if (animationSet === "warden") return "hero-warden"
  if (animationSet === "ranger") return "hero-ranger"
  if (classId === "arcanist" || classId === "witch") return "hero-arcanist"
  if (classId === "warden" || classId === "cleric" || classId === "grave-knight") return "hero-warden"
  return "hero-ranger"
}

export function weaponSpriteForAppearance(classId: string, appearance?: Partial<HeroAppearance> | null) {
  const weapon = normalizeHeroAppearance(classId, appearance).weaponSpriteId
  return weapon === "class-default" ? defaultWeaponSpriteForClass(classId) : weapon
}

export function appearanceLabel(appearance: HeroAppearance) {
  return `${label(appearance.cosmeticPaletteId)} palette / ${label(appearance.portraitVariantId)} portrait / ${label(appearance.weaponSpriteId)} weapon / ${label(appearance.animationSetId)} motion`
}

function defaultWeaponSpriteForClass(classId: string): Exclude<HeroWeaponSpriteId, "class-default"> {
  if (classId === "arcanist" || classId === "witch" || classId === "cleric") return "staff"
  if (classId === "ranger") return "bow"
  if (classId === "warden" || classId === "engineer") return "axe"
  if (classId === "duelist") return "dagger"
  return "sword"
}

function defaultAnimationSetForClass(classId: string): Exclude<HeroAnimationSetId, "class-default"> {
  if (classId === "arcanist" || classId === "witch") return "arcanist"
  if (classId === "warden" || classId === "cleric" || classId === "grave-knight") return "warden"
  return "ranger"
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T) {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback
}

function cycle<T extends string>(value: T, options: readonly T[], delta: number) {
  const index = Math.max(0, options.indexOf(value))
  const next = (index + delta + options.length) % options.length
  return options[next] ?? options[0]
}

function label(value: string) {
  return value
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ")
}
