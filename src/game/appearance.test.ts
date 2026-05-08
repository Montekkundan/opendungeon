import { describe, expect, test } from "bun:test"
import {
  appearanceLabel,
  cycleCosmeticPalette,
  cycleHeroAnimationSet,
  cycleHeroWeaponSprite,
  defaultAppearanceForClass,
  heroSpriteForAppearance,
  normalizeHeroAppearance,
  weaponSpriteForAppearance,
} from "./appearance.js"

describe("hero appearance", () => {
  test("provides class defaults for portrait, palette, weapon, and animation set", () => {
    expect(defaultAppearanceForClass("ranger")).toEqual({
      portraitVariantId: "class-default",
      cosmeticPaletteId: "class-default",
      weaponSpriteId: "bow",
      animationSetId: "ranger",
    })
    expect(defaultAppearanceForClass("grave-knight").weaponSpriteId).toBe("sword")
    expect(defaultAppearanceForClass("witch").animationSetId).toBe("arcanist")
  })

  test("normalizes saved and user-selected appearance values", () => {
    expect(
      normalizeHeroAppearance("duelist", {
        portraitVariantId: "masked",
        cosmeticPaletteId: "royal",
        weaponSpriteId: "staff",
        animationSetId: "warden",
      }),
    ).toEqual({
      portraitVariantId: "masked",
      cosmeticPaletteId: "royal",
      weaponSpriteId: "staff",
      animationSetId: "warden",
    })
    expect(normalizeHeroAppearance("duelist", { weaponSpriteId: "bad" as never }).weaponSpriteId).toBe("dagger")
  })

  test("cycles customization choices deterministically", () => {
    const palette = cycleCosmeticPalette("ranger", defaultAppearanceForClass("ranger"), 1)
    const weapon = cycleHeroWeaponSprite("ranger", palette, 1)
    const motion = cycleHeroAnimationSet("ranger", weapon, 1)

    expect(palette.cosmeticPaletteId).toBe("ember")
    expect(weapon.weaponSpriteId).toBe("staff")
    expect(motion.animationSetId).toBe("warden")
    expect(heroSpriteForAppearance("ranger", motion)).toBe("hero-warden")
    expect(weaponSpriteForAppearance("ranger", weapon)).toBe("staff")
    expect(appearanceLabel(motion)).toContain("Ember palette")
  })
})
