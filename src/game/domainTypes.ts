export type TileId = "void" | "floor" | "wall" | "door" | "stairs" | "potion" | "relic" | "chest" | "trap"

export const enemyActorIds = [
  "slime",
  "ghoul",
  "necromancer",
  "gallows-wisp",
  "rust-squire",
  "carrion-moth",
  "crypt-mimic",
  "grave-root-boss",
] as const

export const npcActorIds = [
  "cartographer",
  "wound-surgeon",
  "shrine-keeper",
  "jailer",
  "merchant",
] as const

export type EnemyActorId = (typeof enemyActorIds)[number]
export type NpcActorId = (typeof npcActorIds)[number]
export type ActorId = "player" | EnemyActorId | NpcActorId

export function isEnemyActorId(kind: string): kind is EnemyActorId {
  return (enemyActorIds as readonly string[]).includes(kind)
}

export function isNpcActorId(kind: string): kind is NpcActorId {
  return (npcActorIds as readonly string[]).includes(kind)
}

export function isBossActorId(kind: string): kind is Extract<EnemyActorId, "necromancer" | "grave-root-boss"> {
  return kind === "necromancer" || kind === "grave-root-boss"
}
