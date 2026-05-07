import type { ActorId, TileId } from "../game/domainTypes.js"

export type GlyphStyle = {
  glyph: string
  fg: string
}

export type AssetPack = {
  id: string
  name: string
  mood: "dark-serious" | "clean" | "custom"
  tileSize: number
  sourceUrl: string
  license: string
  author: string
  previewPath: string
  sheetPath?: string
  tiles: Record<TileId, GlyphStyle>
  actors: Record<ActorId, GlyphStyle>
}

export const opendungeonPack: AssetPack = {
  id: "opendungeon",
  name: "Itch runtime",
  mood: "custom",
  tileSize: 100,
  sourceUrl: "runtime://itch-cache-and-procedural-terminal-sprites",
  license: "Runtime renderer uses locally cached free Itch sources where present; procedural terminal sprites for terrain, items, and dice.",
  author: "Zerie, Xzany, MonopixelArt, opendungeon",
  previewPath: ".asset-cache/itch/extracted/zerie/Tiny RPG Character Asset Pack v1.03 -Free Soldier&Orc/Characters(100x100)/Soldier/Soldier/Soldier-Idle.png",
  tiles: {
    void: { glyph: " ", fg: "#05070a" },
    floor: { glyph: ".", fg: "#5b6f76" },
    wall: { glyph: "#", fg: "#7f7281" },
    door: { glyph: "+", fg: "#b88058" },
    stairs: { glyph: ">", fg: "#f4d06f" },
    potion: { glyph: "!", fg: "#d56b8c" },
    relic: { glyph: "$", fg: "#d6a85c" },
    chest: { glyph: "=", fg: "#c38b6a" },
  },
  actors: {
    player: { glyph: "@", fg: "#f4d06f" },
    slime: { glyph: "s", fg: "#7dffb2" },
    ghoul: { glyph: "g", fg: "#b5bec6" },
    necromancer: { glyph: "n", fg: "#b48ead" },
  },
}

export const assetPacks = {
  opendungeon: opendungeonPack,
} as const

export type AssetPackId = keyof typeof assetPacks

export const activeAssetPackId: AssetPackId = "opendungeon"
export const activeAssetPack = assetPacks[activeAssetPackId]
