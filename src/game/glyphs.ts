import { isNpcActorId, type ActorId, type TileId } from "./domainTypes.js"

const tileGlyphs: Record<string, string> = {
  wall: "#",
  door: "+",
  stairs: ">",
  potion: "!",
  relic: "*",
  chest: "$",
  trap: "^",
  note: "?",
  recipe: "%",
  tool: "&",
  deed: "~",
  fossil: "f",
  "boss-memory": "M",
  keepsake: "k",
  "story-relic": "?",
  floor: ".",
}

const actorGlyphs: Record<string, string> = {
  player: "@",
  slime: "s",
  ghoul: "g",
  necromancer: "n",
  "gallows-wisp": "w",
  "rust-squire": "r",
  "carrion-moth": "m",
  "crypt-mimic": "c",
  "grave-root-boss": "b",
}

const actorLabels: Record<string, string> = {
  player: "Hero",
  slime: "Slime",
  ghoul: "Ghoul",
  necromancer: "Necromancer",
  "gallows-wisp": "Gallows Wisp",
  "rust-squire": "Rust Squire",
  "carrion-moth": "Carrion Moth",
  "crypt-mimic": "Crypt Mimic",
  "grave-root-boss": "Grave-root Boss",
  merchant: "Merchant",
  cartographer: "Cartographer",
  "wound-surgeon": "Wound Surgeon",
  "shrine-keeper": "Shrine Keeper",
  jailer: "Jailer",
}

export function tileGlyph(tile: TileId | string) {
  return tileGlyphs[tile] ?? " "
}

export function actorGlyph(kind: ActorId | string, fallback = "a") {
  return actorGlyphs[kind] ?? (isNpcActorId(kind) ? "?" : fallback)
}

export function actorLabel(kind: ActorId | string) {
  return actorLabels[kind] ?? String(kind)
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ")
}
