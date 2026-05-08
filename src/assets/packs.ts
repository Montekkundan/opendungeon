import type { ActorId, TileId } from "../game/domainTypes.js"

type GlyphStyle = {
  glyph: string
  fg: string
}

type AssetPack = {
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

const opendungeonPack: AssetPack = {
  id: "opendungeon",
  name: "opendungeon assets runtime",
  mood: "custom",
  tileSize: 100,
  sourceUrl: "runtime://opendungeon-assets-and-procedural-terminal-sprites",
  license: "Runtime renderer uses bundled role-based sprite sheets plus procedural terminal sprites for terrain, items, and dice.",
  author: "Zerie, Xzany, MonopixelArt, opendungeon",
  previewPath: "assets/opendungeon-assets/runtime/actors/hero-soldier/idle.png",
  tiles: {
    void: { glyph: " ", fg: "#05070a" },
    floor: { glyph: ".", fg: "#5b6f76" },
    wall: { glyph: "#", fg: "#7f7281" },
    door: { glyph: "+", fg: "#b88058" },
    stairs: { glyph: ">", fg: "#f4d06f" },
    potion: { glyph: "!", fg: "#d56b8c" },
    relic: { glyph: "$", fg: "#d6a85c" },
    chest: { glyph: "=", fg: "#c38b6a" },
    trap: { glyph: "^", fg: "#ff5e86" },
  },
  actors: {
    player: { glyph: "@", fg: "#f4d06f" },
    slime: { glyph: "s", fg: "#7dffb2" },
    ghoul: { glyph: "g", fg: "#b5bec6" },
    necromancer: { glyph: "n", fg: "#b48ead" },
    "gallows-wisp": { glyph: "w", fg: "#a7d8ff" },
    "rust-squire": { glyph: "r", fg: "#c8915d" },
    "carrion-moth": { glyph: "m", fg: "#d8c69a" },
    "crypt-mimic": { glyph: "c", fg: "#b87958" },
    "grave-root-boss": { glyph: "b", fg: "#8fb66f" },
    cartographer: { glyph: "c", fg: "#7fd1cf" },
    "wound-surgeon": { glyph: "s", fg: "#f0a8b8" },
    "shrine-keeper": { glyph: "k", fg: "#f4d06f" },
    jailer: { glyph: "j", fg: "#9aa7b1" },
    merchant: { glyph: "m", fg: "#d6a85c" },
  },
}

const assetPacks = {
  opendungeon: opendungeonPack,
} as const

type AssetPackId = keyof typeof assetPacks

const activeAssetPackId: AssetPackId = "opendungeon"
export const activeAssetPack = assetPacks[activeAssetPackId]
