import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { createHash } from "node:crypto"

export type LobbyMode = "race" | "coop"
export type LobbyRole = "player" | "spectator"

export type LobbyPlayer = {
  id: string
  name: string
  role: LobbyRole
  joinedAt: number
}

export type CoopSyncState = {
  playerId: string
  name: string
  classId: string
  floor: number
  turn: number
  hp: number
  level: number
  unspentStatPoints: number
  inventoryCount: number
  gold: number
  saveRevision: number
  connected: boolean
  x: number
  y: number
  combatActive: boolean
  tutorialStage: string
  tutorialReady: boolean
  tutorialCompleted: boolean
  updatedAt: number
}

type CoopSyncInput = Omit<
  CoopSyncState,
  "name" | "updatedAt" | "level" | "unspentStatPoints" | "inventoryCount" | "gold" | "saveRevision" | "connected" | "classId" | "tutorialStage" | "tutorialReady" | "tutorialCompleted"
> &
  Partial<Pick<CoopSyncState, "level" | "unspentStatPoints" | "inventoryCount" | "gold" | "saveRevision" | "connected" | "classId" | "tutorialStage" | "tutorialReady" | "tutorialCompleted">>

export type CombatTurnState = {
  active: boolean
  round: number
  order: string[]
  activePlayerId?: string
}

export type RaceResult = {
  name: string
  status: string
  floor: number
  turns: number
  gold: number
  kills: number
  score: number
  submittedAt: number
}

export type LobbySnapshot = {
  mode: LobbyMode
  seed: number
  inviteCode: string
  players: Array<Omit<LobbyPlayer, "role">>
  spectators: Array<Omit<LobbyPlayer, "role">>
  coopStates: CoopSyncState[]
  combat: CombatTurnState
  leaderboard: RaceResult[]
  syncWarnings: string[]
}

export type LobbyStateOptions = {
  mode: LobbyMode
  seed: number
  inviteCode?: string
  now?: () => number
  initialResults?: RaceResult[]
}

export class MultiplayerLobbyState {
  readonly mode: LobbyMode
  readonly seed: number
  readonly inviteCode: string
  private readonly now: () => number
  private readonly players = new Map<string, LobbyPlayer>()
  private readonly coopStates = new Map<string, CoopSyncState>()
  private readonly results: RaceResult[]
  private combat: CombatTurnState = { active: false, round: 0, order: [] }

  constructor(options: LobbyStateOptions) {
    this.mode = options.mode
    this.seed = options.seed
    this.inviteCode = options.inviteCode || createInviteCode(options.seed, options.mode)
    this.now = options.now ?? Date.now
    this.results = [...(options.initialResults ?? [])]
  }

  join(id: string, name: string, role: LobbyRole = "player") {
    const player: LobbyPlayer = {
      id,
      name: cleanName(name || (role === "spectator" ? "Spectator" : "Crawler")),
      role,
      joinedAt: this.now(),
    }
    this.players.set(id, player)
    return player
  }

  leave(id: string) {
    this.players.delete(id)
    this.coopStates.delete(id)
    this.combat.order = this.combat.order.filter((playerId) => playerId !== id)
    if (this.combat.activePlayerId === id) this.combat.activePlayerId = this.combat.order[0]
  }

  updateCoopState(input: CoopSyncInput) {
    const player = this.players.get(input.playerId)
    if (!player || player.role === "spectator") throw new Error(`Unknown co-op player: ${input.playerId}`)
    const state: CoopSyncState = {
      ...input,
      name: player.name,
      classId: cleanClassId(input.classId),
      floor: positiveInt(input.floor),
      turn: positiveInt(input.turn),
      hp: positiveInt(input.hp),
      level: Math.max(1, positiveInt(input.level) || 1),
      unspentStatPoints: positiveInt(input.unspentStatPoints),
      inventoryCount: positiveInt(input.inventoryCount),
      gold: positiveInt(input.gold),
      saveRevision: positiveInt(input.saveRevision),
      connected: input.connected !== false,
      x: integer(input.x),
      y: integer(input.y),
      combatActive: Boolean(input.combatActive),
      tutorialStage: cleanTutorialStage(input.tutorialStage),
      tutorialReady: Boolean(input.tutorialReady),
      tutorialCompleted: Boolean(input.tutorialCompleted),
      updatedAt: this.now(),
    }
    this.coopStates.set(input.playerId, state)
    return state
  }

  markDisconnected(id: string) {
    const state = this.coopStates.get(id)
    if (state) this.coopStates.set(id, { ...state, connected: false, updatedAt: this.now() })
    if (this.combat.activePlayerId === id) this.advanceCombatTurn()
    return this.coopStates.get(id)
  }

  startCombatTurnOrder(order: string[]) {
    const players = order.filter((id) => this.players.get(id)?.role === "player")
    this.combat = {
      active: players.length > 0,
      round: players.length ? 1 : 0,
      order: players,
      activePlayerId: players[0],
    }
    return this.combat
  }

  advanceCombatTurn() {
    if (!this.combat.active || !this.combat.order.length) return this.combat
    const index = this.combat.order.indexOf(this.combat.activePlayerId ?? this.combat.order[0])
    const nextIndex = (Math.max(0, index) + 1) % this.combat.order.length
    this.combat.activePlayerId = this.combat.order[nextIndex]
    if (nextIndex === 0) this.combat.round += 1
    return this.combat
  }

  endCombat() {
    this.combat = { active: false, round: 0, order: [] }
  }

  submitRaceResult(input: Partial<RaceResult>) {
    const result = normalizeRaceResult(input, this.now())
    this.results.push(result)
    return result
  }

  leaderboard() {
    return sortLeaderboard(this.results)
  }

  snapshot(): LobbySnapshot {
    const players = [...this.players.values()]
    return {
      mode: this.mode,
      seed: this.seed,
      inviteCode: this.inviteCode,
      players: players.filter((player) => player.role === "player").map(publicPlayer),
      spectators: players.filter((player) => player.role === "spectator").map(publicPlayer),
      coopStates: [...this.coopStates.values()].sort((left, right) => left.name.localeCompare(right.name)),
      combat: { ...this.combat, order: [...this.combat.order] },
      leaderboard: this.leaderboard(),
      syncWarnings: coopSyncWarnings([...this.coopStates.values()]),
    }
  }
}

export function createInviteCode(seed: number, mode: LobbyMode, salt = "opendungeon") {
  return createHash("sha256").update(`${salt}:${mode}:${seed}`).digest("hex").slice(0, 8).toUpperCase()
}

function normalizeRaceResult(input: Partial<RaceResult>, submittedAt = Date.now()): RaceResult {
  return {
    name: cleanName(input.name || "Crawler"),
    status: String(input.status || "running").slice(0, 16),
    floor: positiveInt(input.floor),
    turns: positiveInt(input.turns),
    gold: positiveInt(input.gold),
    kills: positiveInt(input.kills),
    score: positiveInt(input.score),
    submittedAt,
  }
}

function sortLeaderboard(results: RaceResult[]) {
  return [...results].sort((a, b) => {
    if (a.status === "victory" && b.status !== "victory") return -1
    if (a.status !== "victory" && b.status === "victory") return 1
    if (a.score !== b.score) return b.score - a.score
    if (a.floor !== b.floor) return b.floor - a.floor
    if (a.turns !== b.turns) return a.turns - b.turns
    return b.gold - a.gold
  })
}

function coopSyncWarnings(states: CoopSyncState[]) {
  const warnings: string[] = []
  if (new Set(states.map((state) => state.floor)).size > 1) warnings.push("Co-op players are split across floors.")
  if (new Set(states.map((state) => state.saveRevision)).size > 1) warnings.push("Save revisions differ across clients.")
  if (states.some((state) => !state.connected)) warnings.push("At least one player is disconnected.")
  if (states.some((state) => state.unspentStatPoints > 0)) warnings.push("A player has unspent stat points.")
  if (states.some((state) => state.inventoryCount > 24)) warnings.push("A player inventory is over the expected sync size.")
  return warnings
}

function cleanClassId(value: unknown) {
  const text = String(value || "ranger").trim()
  return /^[a-z0-9-]{3,24}$/i.test(text) ? text.slice(0, 24) : "ranger"
}

function cleanTutorialStage(value: unknown) {
  const text = String(value || "complete").trim()
  if (text === "movement" || text === "npc-check" || text === "combat" || text === "complete") return text
  return "complete"
}

export function loadRaceResults(path: string): RaceResult[] {
  if (!path || !existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown
    return Array.isArray(parsed) ? parsed.map((entry) => normalizeRaceResult(entry as Partial<RaceResult>, Number((entry as RaceResult).submittedAt) || Date.now())) : []
  } catch {
    return []
  }
}

export function saveRaceResults(path: string, results: RaceResult[], limit = 50) {
  if (!path) return
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(sortLeaderboard(results).slice(0, limit), null, 2)}\n`, "utf8")
}

function publicPlayer(player: LobbyPlayer) {
  return {
    id: player.id,
    name: player.name,
    joinedAt: player.joinedAt,
  }
}

function cleanName(value: unknown) {
  return String(value || "Crawler").replace(/[^\w .-]/g, "").trim().slice(0, 32) || "Crawler"
}

function positiveInt(value: unknown) {
  return Math.max(0, integer(value))
}

function integer(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : 0
}
