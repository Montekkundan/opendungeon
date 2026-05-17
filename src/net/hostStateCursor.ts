import type { HostAuthoritativeState, LobbySnapshot } from "./lobbyState.js"

type HostSnapshotSource = Partial<Pick<LobbySnapshot, "hostState" | "hostStates">>

export function latestLocalHostState(
  snapshot: HostSnapshotSource,
  localPlayerId: string,
  lastAppliedSequence: number,
) {
  const candidates: HostAuthoritativeState[] = []
  if (Array.isArray(snapshot.hostStates)) {
    for (const state of snapshot.hostStates) {
      if (isHostStateFor(state, localPlayerId)) candidates.push(state)
    }
  }
  if (isHostStateFor(snapshot.hostState, localPlayerId)) candidates.push(snapshot.hostState)

  let latest: HostAuthoritativeState | null = null
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.commandSequence) || candidate.commandSequence <= lastAppliedSequence) continue
    if (!latest || candidate.commandSequence > latest.commandSequence) latest = candidate
  }

  return latest
}

function isHostStateFor(value: unknown, localPlayerId: string): value is HostAuthoritativeState {
  if (!value || typeof value !== "object") return false
  const state = value as Partial<HostAuthoritativeState>
  return state.playerId === localPlayerId && Number.isFinite(state.commandSequence)
}
