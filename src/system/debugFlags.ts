export function debugOverlaysEnabled(env: Record<string, string | undefined> = process.env) {
  return truthy(env.OPENDUNGEON_DEBUG_OVERLAY) || truthy(env.OPENDUNGEON_DEBUG_VIEW) || truthy(env.DUNGEON_DEBUG_VIEW)
}

function truthy(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true"
}
