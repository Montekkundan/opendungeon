export type TileId = "void" | "floor" | "wall" | "door" | "stairs" | "potion" | "relic" | "chest"
export type ActorId = "player" | "slime" | "ghoul" | "necromancer"

export type GlyphStyle = {
  glyph: string
  fg: string
}

export type AssetPack = {
  id: string
  name: string
  mood: "dark-serious" | "clean" | "custom"
  tileSize: 16
  sourceUrl: string
  license: string
  author: string
  previewPath: string
  sheetPath?: string
  tiles: Record<TileId, GlyphStyle>
  actors: Record<ActorId, GlyphStyle>
}

export const dawngeonPack: AssetPack = {
  id: "dawngeon",
  name: "Dawngeon",
  mood: "dark-serious",
  tileSize: 16,
  sourceUrl: "https://pebonius.itch.io/dawngeon",
  license: "Creative Commons Zero v1.0 Universal",
  author: "peb",
  previewPath: "assets/dawngeon/preview.png",
  tiles: {
    void: { glyph: " ", fg: "#071013" },
    floor: { glyph: ".", fg: "#36595a" },
    wall: { glyph: "#", fg: "#7a4f42" },
    door: { glyph: "+", fg: "#b88058" },
    stairs: { glyph: ">", fg: "#f4d06f" },
    potion: { glyph: "!", fg: "#d56b8c" },
    relic: { glyph: "$", fg: "#d6a85c" },
    chest: { glyph: "=", fg: "#c38b6a" },
  },
  actors: {
    player: { glyph: "@", fg: "#d8dee9" },
    slime: { glyph: "s", fg: "#7dffb2" },
    ghoul: { glyph: "g", fg: "#b5bec6" },
    necromancer: { glyph: "n", fg: "#b48ead" },
  },
}

export const assetPacks = {
  dawngeon: dawngeonPack,
} as const

export type AssetPackId = keyof typeof assetPacks

export const activeAssetPackId: AssetPackId = "dawngeon"
export const activeAssetPack = assetPacks[activeAssetPackId]
