type EnvLike = Record<string, string | undefined>

export function cleanPlayerName(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback
  const cleaned = value.replace(/[^\w .'-]/g, "").trim().slice(0, 24)
  return cleaned || fallback
}

export function playerNameFromEnv(env: EnvLike = process.env) {
  return cleanPlayerName(env.OPENDUNGEON_PLAYER_NAME ?? env.DUNGEON_PLAYER_NAME ?? "")
}

export function defaultPlayerName(env: EnvLike = process.env, fallback = "Mira") {
  return playerNameFromEnv(env) || fallback
}
