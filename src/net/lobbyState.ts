import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { createHash } from "node:crypto"

export type LobbyMode = "race" | "coop"
export type LobbyRole = "player" | "spectator"

export type LobbyPlayer = {
  accountKey?: string
  accountLabel?: string
  id: string
  name: string
  role: LobbyRole
  terminalApp?: string
  joinedAt: number
}

export type LobbyPlayerIdentity = {
  accountKey?: unknown
  accountLabel?: unknown
  terminalApp?: unknown
}

export type PublicLobbyPlayer = {
  id: string
  name: string
  joinedAt: number
}

export type CoopSyncState = {
  playerId: string
  name: string
  classId: string
  floor: number
  turn: number
  hp: number
  focus: number
  xp: number
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
  "name" | "updatedAt" | "focus" | "xp" | "level" | "unspentStatPoints" | "inventoryCount" | "gold" | "saveRevision" | "connected" | "classId" | "tutorialStage" | "tutorialReady" | "tutorialCompleted"
> &
  Partial<Pick<CoopSyncState, "focus" | "xp" | "level" | "unspentStatPoints" | "inventoryCount" | "gold" | "saveRevision" | "connected" | "classId" | "tutorialStage" | "tutorialReady" | "tutorialCompleted">>

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

export type GmDeliveredPatchOperation = {
  path: string
  reason: string
  value: string | number | boolean
}

export type GmDeliveredPatch = {
  id: string
  title: string
  difficulty: "easier" | "steady" | "harder" | "deadly"
  briefing: string
  operationCount: number
  operations: GmDeliveredPatchOperation[]
  approvedAt: number
}

export type LobbyActionType = "move" | "interact" | "combat" | "inventory" | "village" | "system"
export type LobbyCommandType = Exclude<LobbyActionType, "system">

export type LobbyActionEntry = {
  id: string
  playerId: string
  name: string
  type: LobbyActionType
  label: string
  floor: number
  turn: number
  hp: number
  x: number
  y: number
  createdAt: number
}

export type LobbyCommandEntry = {
  id: string
  sequence: number
  playerId: string
  name: string
  type: LobbyCommandType
  label: string
  payload: Record<string, string | number | boolean>
  accepted: boolean
  acceptedAt: number
  result: LobbyCommandResult
}

export type LobbyCommandResult = {
  accepted: boolean
  message: string
  floor: number
  turn: number
  hp: number
  maxHp?: number
  focus?: number
  maxFocus?: number
  xp?: number
  level?: number
  combatActive?: boolean
  combatMessage?: string
  combatRound?: number
  inventoryCount?: number
  inventoryItems?: string[]
  gold?: number
  hub?: LobbyHubSnapshot
  progress?: LobbyProgressSnapshot
  context?: LobbyContextSnapshot
  tutorialStage?: string
  tutorialReady?: boolean
  tutorialCompleted?: boolean
  x: number
  y: number
  status: string
}

export type LobbyHubSnapshot = {
  unlocked: boolean
  coins: number
  lootSold: number
  stations: LobbyHubStationSnapshot[]
  farm: LobbyFarmSnapshot
  houses: LobbyHouseSnapshot[]
  preparedFood: string[]
  unlockedGear: string[]
  village: LobbyVillageSnapshot
  calendar: LobbyCalendarSnapshot
}

export type LobbyHubStationSnapshot = {
  id: string
  built: boolean
  level: number
}

export type LobbyFarmSnapshot = {
  plots: number
  planted: number
  ready: number
  sprinklers: number
}

export type LobbyHouseSnapshot = {
  playerId: string
  name: string
  built: boolean
}

export type LobbyVillageSnapshot = {
  selectedLocation: string
  selectedPermission: string
  permissions: Record<string, string>
  shopLog: string[]
}

export type LobbyCalendarSnapshot = {
  day: number
  season: string
  weather: string
  festival: string
}

export type LobbyContextSnapshot = {
  combat: LobbyCombatContextSnapshot
  skillCheck: LobbySkillCheckSnapshot | null
  conversation: LobbyConversationSnapshot | null
}

export type LobbyCombatContextSnapshot = {
  active: boolean
  actorIds: string[]
  selectedTarget: number
  selectedSkill: number
  round: number
  message: string
  lastRoll?: LobbyCombatRollSnapshot
}

export type LobbyCombatRollSnapshot = {
  d20: number
  modifier: number
  total: number
  dc: number
  hit: boolean
  critical: boolean
  stat: string
  skill: string
  target: string
  affinity?: string
  matchup?: string
}

export type LobbySkillCheckSnapshot = {
  id: string
  source: string
  title: string
  actor: string
  stat: string
  dc: number
  x: number
  y: number
  prompt: string
  successText: string
  failureText: string
  status: string
  roll?: LobbySkillCheckRollSnapshot
}

export type LobbySkillCheckRollSnapshot = {
  d20: number
  modifier: number
  total: number
  dc: number
  success: boolean
  critical: boolean
  fumble: boolean
  stat: string
  consequence: string
}

export type LobbyConversationSnapshot = {
  id: string
  actorId: string
  kind: string
  speaker: string
  text: string
  status: string
  selectedOption: number
  options: LobbyConversationOptionSnapshot[]
  trade?: LobbyConversationTradeSnapshot
}

export type LobbyConversationOptionSnapshot = {
  id: string
  label: string
  text: string
}

export type LobbyConversationTradeSnapshot = {
  item: string
  price: number
  purchased: boolean
}

export type LobbyProgressSnapshot = {
  talents: string[]
  levelUp: LobbyLevelUpSnapshot | null
  equipment: LobbyEquipmentSnapshot[]
  knowledge: LobbyKnowledgeSnapshot[]
  toasts: LobbyToastSnapshot[]
  statusEffects: LobbyStatusEffectSnapshot[]
  log: string[]
}

export type LobbyLevelUpSnapshot = {
  level: number
  choices: LobbyLevelUpChoiceSnapshot[]
}

export type LobbyLevelUpChoiceSnapshot = {
  id: string
  name: string
  text: string
}

export type LobbyEquipmentSnapshot = {
  slot: string
  id: string
  name: string
  rarity: string
  bonusDamage: number
  activeText: string
  statBonuses: Record<string, number>
}

export type LobbyKnowledgeSnapshot = {
  id: string
  title: string
  text: string
  kind: string
  floor?: number
  discoveredAtTurn: number
}

export type LobbyToastSnapshot = {
  id: string
  title: string
  text: string
  tone: string
  turn: number
}

export type LobbyStatusEffectSnapshot = {
  id: string
  targetId: string
  label: string
  remainingTurns: number
  magnitude: number
  source: string
}

export type HostAuthoritativeState = LobbyCommandResult & {
  commandSequence: number
  name: string
  playerId: string
  updatedAt: number
}

export type LobbySnapshot = {
  mode: LobbyMode
  seed: number
  inviteCode: string
  players: PublicLobbyPlayer[]
  spectators: PublicLobbyPlayer[]
  coopStates: CoopSyncState[]
  combat: CombatTurnState
  actions: LobbyActionEntry[]
  commands: LobbyCommandEntry[]
  leaderboard: RaceResult[]
  gmPatches: GmDeliveredPatch[]
  hostState: HostAuthoritativeState | null
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
  private readonly gmPatches = new Map<string, GmDeliveredPatch>()
  private readonly actions: LobbyActionEntry[] = []
  private readonly commands: LobbyCommandEntry[] = []
  private hostState: HostAuthoritativeState | null = null
  private commandSequence = 0
  private combat: CombatTurnState = { active: false, round: 0, order: [] }

  constructor(options: LobbyStateOptions) {
    this.mode = options.mode
    this.seed = options.seed
    this.inviteCode = options.inviteCode || createInviteCode(options.seed, options.mode)
    this.now = options.now ?? Date.now
    this.results = [...(options.initialResults ?? [])]
  }

  join(id: string, name: string, role: LobbyRole = "player", identity: LobbyPlayerIdentity = {}) {
    const accountKey = cleanAccountKey(identity.accountKey)
    const accountLabel = cleanAccountLabel(identity.accountLabel)
    const terminalApp = cleanAccountLabel(identity.terminalApp || "terminal")
    if (role === "player" && accountKey) {
      const duplicate = [...this.players.values()].find((player) => player.id !== id && player.role === "player" && player.accountKey === accountKey)
      if (duplicate) {
        throw new Error(`${accountLabel || "Signed-in player"} is already in this lobby from ${duplicate.terminalApp || "another terminal"}. Use a guest auth dir for another local player.`)
      }
    }
    const player: LobbyPlayer = {
      accountKey: accountKey || undefined,
      accountLabel: accountLabel || undefined,
      id,
      name: cleanName(name || (role === "spectator" ? "Spectator" : "Crawler")),
      role,
      terminalApp: terminalApp || undefined,
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
      focus: positiveInt(input.focus),
      xp: positiveInt(input.xp),
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

  deliverGmPatch(input: Omit<Partial<GmDeliveredPatch>, "operations"> & { operations?: unknown[] }) {
    const patch = normalizeGmPatch(input, this.now())
    this.gmPatches.set(patch.id, patch)
    this.actions.unshift({
      id: `gm-${patch.id}-${patch.approvedAt}`,
      playerId: "gm",
      name: "GM",
      type: "system",
      label: `Delivered ${patch.title}`,
      floor: 0,
      turn: 0,
      hp: 0,
      x: 0,
      y: 0,
      createdAt: patch.approvedAt,
    })
    this.trimActions()
    return patch
  }

  recordAction(input: {
    playerId: string
    type?: unknown
    label?: unknown
    floor?: unknown
    turn?: unknown
    hp?: unknown
    x?: unknown
    y?: unknown
  }) {
    const player = this.players.get(input.playerId)
    if (!player || player.role === "spectator") throw new Error(`Unknown action player: ${input.playerId}`)
    const createdAt = this.now()
    const entry: LobbyActionEntry = {
      id: createHash("sha256").update(`${input.playerId}:${createdAt}:${String(input.label || "")}:${this.actions.length}`).digest("hex").slice(0, 16),
      playerId: input.playerId,
      name: player.name,
      type: normalizeActionType(input.type),
      label: cleanActionLabel(input.label),
      floor: positiveInt(input.floor),
      turn: positiveInt(input.turn),
      hp: positiveInt(input.hp),
      x: integer(input.x),
      y: integer(input.y),
      createdAt,
    }
    this.actions.unshift(entry)
    this.trimActions()
    return entry
  }

  recordCommand(input: {
    playerId: string
    type?: unknown
    label?: unknown
    floor?: unknown
    turn?: unknown
    hp?: unknown
    x?: unknown
    y?: unknown
    payload?: unknown
    result?: unknown
  }) {
    const player = this.players.get(input.playerId)
    if (!player || player.role === "spectator") throw new Error(`Unknown command player: ${input.playerId}`)
    const acceptedAt = this.now()
    const type = normalizeCommandType(input.type)
    const label = cleanActionLabel(input.label)
    const payload = normalizeCommandPayload(input.payload, {
      floor: positiveInt(input.floor),
      hp: positiveInt(input.hp),
      turn: positiveInt(input.turn),
      x: integer(input.x),
      y: integer(input.y),
    })
    const result = normalizeCommandResult(input.result, payload)
    const entry: LobbyCommandEntry = {
      id: createHash("sha256").update(`${player.id}:${acceptedAt}:${type}:${label}:${this.commandSequence}`).digest("hex").slice(0, 16),
      sequence: ++this.commandSequence,
      playerId: player.id,
      name: player.name,
      type,
      label,
      payload,
      accepted: result.accepted,
      acceptedAt,
      result,
    }
    this.commands.unshift(entry)
    this.applyCommandResultToCoopState(player.id, result, acceptedAt)
    this.trimCommands()
    this.recordAction({
      playerId: player.id,
      type,
      label: result.accepted ? label : `Rejected ${label}: ${result.message}`,
      floor: payload.floor,
      turn: payload.turn,
      hp: payload.hp,
      x: payload.x,
      y: payload.y,
    })
    return entry
  }

  updateAuthoritativeState(input: {
    accepted?: unknown
    commandSequence?: unknown
    floor?: unknown
    hp?: unknown
    message?: unknown
    playerId?: unknown
    status?: unknown
    turn?: unknown
    x?: unknown
    y?: unknown
  }) {
    const player = this.players.get(String(input.playerId || ""))
    if (!player || player.role === "spectator") throw new Error(`Unknown host state player: ${String(input.playerId || "")}`)
    this.hostState = {
      accepted: input.accepted !== false,
      commandSequence: positiveInt(input.commandSequence),
      floor: positiveInt(input.floor),
      hp: positiveInt(input.hp),
      message: cleanActionLabel(input.message),
      name: player.name,
      playerId: player.id,
      status: String(input.status || "running").replace(/[^\w -]/g, "").slice(0, 24) || "running",
      turn: positiveInt(input.turn),
      updatedAt: this.now(),
      x: integer(input.x),
      y: integer(input.y),
    }
    return this.hostState
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
      actions: this.actions.slice(0, 50),
      commands: this.commands.slice(0, 50),
      leaderboard: this.leaderboard(),
      gmPatches: [...this.gmPatches.values()].sort((left, right) => right.approvedAt - left.approvedAt),
      hostState: this.hostState ? { ...this.hostState } : null,
      syncWarnings: coopSyncWarnings([...this.coopStates.values()]),
    }
  }

  private trimActions(limit = 120) {
    if (this.actions.length > limit) this.actions.length = limit
  }

  private trimCommands(limit = 120) {
    if (this.commands.length > limit) this.commands.length = limit
  }

  private applyCommandResultToCoopState(playerId: string, result: LobbyCommandResult, updatedAt: number) {
    const state = this.coopStates.get(playerId)
    if (!state) return
    if (!result.accepted) {
      this.coopStates.set(playerId, {
        ...state,
        connected: true,
        floor: result.floor,
        combatActive: result.combatActive ?? state.combatActive,
        focus: result.focus ?? state.focus,
        gold: result.gold ?? state.gold,
        hp: result.hp,
        inventoryCount: result.inventoryCount ?? state.inventoryCount,
        level: result.level ?? state.level,
        saveRevision: Math.max(state.saveRevision, result.turn),
        turn: result.turn,
        tutorialCompleted: result.tutorialCompleted ?? state.tutorialCompleted,
        tutorialReady: result.tutorialReady ?? state.tutorialReady,
        tutorialStage: result.tutorialStage ? cleanTutorialStage(result.tutorialStage) : state.tutorialStage,
        updatedAt,
        x: result.x,
        xp: result.xp ?? state.xp,
        y: result.y,
      })
      return
    }
    this.coopStates.set(playerId, {
      ...state,
      connected: true,
      floor: result.floor,
      combatActive: result.combatActive ?? state.combatActive,
      focus: result.focus ?? state.focus,
      gold: result.gold ?? state.gold,
      hp: result.hp,
      inventoryCount: result.inventoryCount ?? state.inventoryCount,
      level: result.level ?? state.level,
      saveRevision: Math.max(state.saveRevision, result.turn),
      turn: Math.max(state.turn, result.turn),
      tutorialCompleted: result.tutorialCompleted ?? state.tutorialCompleted,
      tutorialReady: result.tutorialReady ?? state.tutorialReady,
      tutorialStage: result.tutorialStage ? cleanTutorialStage(result.tutorialStage) : state.tutorialStage,
      updatedAt,
      x: result.x,
      xp: result.xp ?? state.xp,
      y: result.y,
    })
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

function normalizeGmPatch(input: Omit<Partial<GmDeliveredPatch>, "operations"> & { operations?: unknown[] }, approvedAt = Date.now()): GmDeliveredPatch {
  const difficulty = String(input.difficulty || "steady")
  const operations = Array.isArray(input.operations) ? input.operations.flatMap(normalizeGmPatchOperation) : []
  return {
    id: cleanPatchId(input.id),
    title: String(input.title || "GM patch").replace(/[^\w .,:;!?'"()/-]/g, "").trim().slice(0, 80) || "GM patch",
    difficulty: difficulty === "easier" || difficulty === "harder" || difficulty === "deadly" ? difficulty : "steady",
    briefing: String(input.briefing || "").replace(/[^\w .,:;!?'"()/-]/g, "").trim().slice(0, 280),
    operationCount: operations.length || positiveInt(input.operationCount),
    operations,
    approvedAt,
  }
}

function normalizeGmPatchOperation(input: unknown): GmDeliveredPatchOperation[] {
  if (!input || typeof input !== "object") return []
  const record = input as Record<string, unknown>
  const path = String(record.path || "").replace(/[^\w.-]/g, "").slice(0, 80)
  const value = normalizeGmPatchValue(record.value)
  if (!path || value === null) return []
  return [
    {
      path,
      reason: String(record.reason || "").replace(/[^\w .,:;!?'"()/-]/g, "").trim().slice(0, 160),
      value,
    },
  ]
}

function normalizeGmPatchValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.replace(/[^\w .,:;!?'"()/-]/g, "").trim().slice(0, 280)
  return null
}

function normalizeActionType(value: unknown): LobbyActionType {
  if (value === "move" || value === "interact" || value === "combat" || value === "inventory" || value === "village" || value === "system") return value
  return "system"
}

function normalizeCommandType(value: unknown): LobbyCommandType {
  if (value === "move" || value === "interact" || value === "combat" || value === "inventory" || value === "village") return value
  return "interact"
}

function normalizeCommandPayload(value: unknown, fallback: Record<string, number>) {
  const payload: Record<string, string | number | boolean> = { ...fallback }
  if (!value || typeof value !== "object") return payload
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = key.replace(/[^\w.-]/g, "").slice(0, 40)
    if (!cleanKey) continue
    if (typeof raw === "boolean") payload[cleanKey] = raw
    else if (typeof raw === "number" && Number.isFinite(raw)) payload[cleanKey] = Math.floor(raw)
    else if (typeof raw === "string") payload[cleanKey] = raw.replace(/[^\w .,:;!?'"()/-]/g, "").replace(/\s+/g, " ").trim().slice(0, 120)
  }
  return payload
}

function normalizeCommandResult(value: unknown, fallback: Record<string, string | number | boolean>): LobbyCommandResult {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const result: LobbyCommandResult = {
    accepted: record.accepted !== false,
    combatActive: typeof record.combatActive === "boolean" ? record.combatActive : typeof fallback.combatActive === "boolean" ? fallback.combatActive : undefined,
    combatMessage: record.combatMessage !== undefined || fallback.combatMessage !== undefined ? cleanActionLabel(record.combatMessage ?? fallback.combatMessage) : undefined,
    combatRound: record.combatRound !== undefined || fallback.combatRound !== undefined ? positiveInt(record.combatRound ?? fallback.combatRound) : undefined,
    floor: positiveInt(record.floor ?? fallback.floor),
    focus: record.focus !== undefined || fallback.focus !== undefined ? positiveInt(record.focus ?? fallback.focus) : undefined,
    hp: positiveInt(record.hp ?? fallback.hp),
    level: record.level !== undefined || fallback.level !== undefined ? Math.max(1, positiveInt(record.level ?? fallback.level) || 1) : undefined,
    message: cleanActionLabel(record.message || "Command accepted."),
    status: String(record.status || "running").replace(/[^\w -]/g, "").slice(0, 24) || "running",
    tutorialCompleted: typeof record.tutorialCompleted === "boolean" ? record.tutorialCompleted : typeof fallback.tutorialCompleted === "boolean" ? fallback.tutorialCompleted : undefined,
    tutorialReady: typeof record.tutorialReady === "boolean" ? record.tutorialReady : typeof fallback.tutorialReady === "boolean" ? fallback.tutorialReady : undefined,
    tutorialStage: record.tutorialStage !== undefined || fallback.tutorialStage !== undefined ? cleanTutorialStage(record.tutorialStage ?? fallback.tutorialStage) : undefined,
    turn: positiveInt(record.turn ?? fallback.turn),
    x: integer(record.x ?? fallback.x),
    xp: record.xp !== undefined || fallback.xp !== undefined ? positiveInt(record.xp ?? fallback.xp) : undefined,
    y: integer(record.y ?? fallback.y),
  }
  if (record.gold !== undefined || fallback.gold !== undefined) result.gold = positiveInt(record.gold ?? fallback.gold)
  if (record.hub !== undefined) result.hub = cleanHubSnapshot(record.hub)
  if (record.progress !== undefined) result.progress = cleanProgressSnapshot(record.progress)
  if (record.context !== undefined) result.context = cleanContextSnapshot(record.context)
  if (record.inventoryCount !== undefined || fallback.inventoryCount !== undefined) {
    result.inventoryCount = positiveInt(record.inventoryCount ?? fallback.inventoryCount)
  }
  if (record.inventoryItems !== undefined) result.inventoryItems = cleanInventoryItems(record.inventoryItems)
  if (record.maxHp !== undefined || fallback.maxHp !== undefined) result.maxHp = Math.max(1, positiveInt(record.maxHp ?? fallback.maxHp) || 1)
  if (record.maxFocus !== undefined || fallback.maxFocus !== undefined) result.maxFocus = Math.max(0, positiveInt(record.maxFocus ?? fallback.maxFocus))
  return result
}

function cleanActionLabel(value: unknown) {
  return String(value || "Updated state").replace(/[^\w .,:;!?'"()+/-]/g, "").replace(/\s+/g, " ").trim().slice(0, 140) || "Updated state"
}

function cleanInventoryItems(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || "").replace(/[^\w .,:;!?'"()+/-]/g, "").replace(/\s+/g, " ").trim().slice(0, 48))
    .filter(Boolean)
    .slice(0, 32)
}

function cleanHubSnapshot(value: unknown): LobbyHubSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Partial<LobbyHubSnapshot>
  return {
    calendar: cleanCalendarSnapshot(record.calendar),
    coins: positiveInt(record.coins),
    farm: cleanFarmSnapshot(record.farm),
    houses: cleanHouseSnapshots(record.houses),
    lootSold: positiveInt(record.lootSold),
    preparedFood: cleanHubStringList(record.preparedFood, 12, 40),
    stations: cleanStationSnapshots(record.stations),
    unlocked: record.unlocked === true,
    unlockedGear: cleanHubStringList(record.unlockedGear, 20, 50),
    village: cleanVillageSnapshot(record.village),
  }
}

function cleanStationSnapshots(value: unknown): LobbyHubStationSnapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((station) => {
    const record = station && typeof station === "object" ? (station as Partial<LobbyHubStationSnapshot>) : null
    const id = cleanHubToken(record?.id, 32)
    if (!record || !id) return []
    return [{ id, built: record.built === true, level: positiveInt(record.level) }]
  }).slice(0, 12)
}

function cleanFarmSnapshot(value: unknown): LobbyFarmSnapshot {
  const record = value && typeof value === "object" ? (value as Partial<LobbyFarmSnapshot>) : {}
  return {
    planted: positiveInt(record.planted),
    plots: Math.max(1, positiveInt(record.plots) || 1),
    ready: positiveInt(record.ready),
    sprinklers: positiveInt(record.sprinklers),
  }
}

function cleanHouseSnapshots(value: unknown): LobbyHouseSnapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((house) => {
    const record = house && typeof house === "object" ? (house as Partial<LobbyHouseSnapshot>) : null
    const playerId = cleanHubToken(record?.playerId, 64)
    const name = cleanActionLabel(record?.name || "Crawler").slice(0, 32)
    if (!record || !playerId) return []
    return [{ playerId, name, built: record.built === true }]
  }).slice(0, 8)
}

function cleanVillageSnapshot(value: unknown): LobbyVillageSnapshot {
  const record = value && typeof value === "object" ? (value as Partial<LobbyVillageSnapshot>) : {}
  const rawPermissions = record.permissions && typeof record.permissions === "object" ? record.permissions : {}
  const permissions: Record<string, string> = {}
  for (const [key, raw] of Object.entries(rawPermissions)) {
    const area = cleanHubToken(key, 32)
    const permission = cleanHubToken(raw, 32)
    if (area && permission) permissions[area] = permission
  }
  return {
    permissions,
    selectedLocation: cleanHubToken(record.selectedLocation, 32) || "portal",
    selectedPermission: cleanHubToken(record.selectedPermission, 32) || "houses",
    shopLog: cleanHubStringList(record.shopLog, 8, 80),
  }
}

function cleanCalendarSnapshot(value: unknown): LobbyCalendarSnapshot {
  const record = value && typeof value === "object" ? (value as Partial<LobbyCalendarSnapshot>) : {}
  return {
    day: Math.max(1, positiveInt(record.day) || 1),
    festival: cleanHubToken(record.festival, 32) || "none",
    season: cleanHubToken(record.season, 32) || "spring",
    weather: cleanHubToken(record.weather, 32) || "clear",
  }
}

function cleanHubStringList(value: unknown, limit: number, textLimit: number) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || "").replace(/[^\w .,:;!?'"()+/-]/g, "").replace(/\s+/g, " ").trim().slice(0, textLimit))
    .filter(Boolean)
    .slice(0, limit)
}

function cleanHubToken(value: unknown, limit: number) {
  return String(value || "").replace(/[^\w-]/g, "").slice(0, limit)
}

function cleanContextSnapshot(value: unknown): LobbyContextSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Partial<LobbyContextSnapshot>
  const combat = cleanCombatContextSnapshot(record.combat)
  if (!combat) return undefined
  return {
    combat,
    conversation: cleanConversationSnapshot(record.conversation),
    skillCheck: cleanSkillCheckSnapshot(record.skillCheck),
  }
}

function cleanCombatContextSnapshot(value: unknown): LobbyCombatContextSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Partial<LobbyCombatContextSnapshot>
  return {
    active: record.active === true,
    actorIds: cleanHubStringList(record.actorIds, 32, 64),
    lastRoll: cleanCombatRollSnapshot(record.lastRoll),
    message: cleanActionLabel(record.message || "").slice(0, 180),
    round: positiveInt(record.round),
    selectedSkill: positiveInt(record.selectedSkill),
    selectedTarget: positiveInt(record.selectedTarget),
  }
}

function cleanCombatRollSnapshot(value: unknown): LobbyCombatRollSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Partial<LobbyCombatRollSnapshot>
  return {
    affinity: record.affinity === undefined ? undefined : cleanHubToken(record.affinity, 24),
    critical: record.critical === true,
    d20: positiveInt(record.d20),
    dc: positiveInt(record.dc),
    hit: record.hit === true,
    matchup: record.matchup === undefined ? undefined : cleanHubToken(record.matchup, 24),
    modifier: finiteSignedInt(record.modifier),
    skill: cleanActionLabel(record.skill || "").slice(0, 64),
    stat: cleanHubToken(record.stat, 24),
    target: cleanActionLabel(record.target || "").slice(0, 64),
    total: finiteSignedInt(record.total),
  }
}

function cleanSkillCheckSnapshot(value: unknown): LobbySkillCheckSnapshot | null {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<LobbySkillCheckSnapshot>
  const id = cleanHubToken(record.id, 80)
  const title = cleanActionLabel(record.title || "").slice(0, 80)
  if (!id || !title) return null
  return {
    actor: cleanActionLabel(record.actor || "").slice(0, 64),
    dc: positiveInt(record.dc),
    failureText: cleanActionLabel(record.failureText || "").slice(0, 180),
    id,
    prompt: cleanActionLabel(record.prompt || "").slice(0, 180),
    roll: cleanSkillCheckRollSnapshot(record.roll),
    source: cleanHubToken(record.source, 24),
    stat: cleanHubToken(record.stat, 24),
    status: cleanHubToken(record.status, 24),
    successText: cleanActionLabel(record.successText || "").slice(0, 180),
    title,
    x: positiveInt(record.x),
    y: positiveInt(record.y),
  }
}

function cleanSkillCheckRollSnapshot(value: unknown): LobbySkillCheckRollSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Partial<LobbySkillCheckRollSnapshot>
  return {
    consequence: cleanActionLabel(record.consequence || "").slice(0, 180),
    critical: record.critical === true,
    d20: positiveInt(record.d20),
    dc: positiveInt(record.dc),
    fumble: record.fumble === true,
    modifier: finiteSignedInt(record.modifier),
    stat: cleanHubToken(record.stat, 24),
    success: record.success === true,
    total: finiteSignedInt(record.total),
  }
}

function cleanConversationSnapshot(value: unknown): LobbyConversationSnapshot | null {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<LobbyConversationSnapshot>
  const id = cleanHubToken(record.id, 80)
  const speaker = cleanActionLabel(record.speaker || "").slice(0, 80)
  if (!id || !speaker) return null
  const options = Array.isArray(record.options)
    ? record.options.flatMap((option) => {
        const optionRecord = option && typeof option === "object" ? (option as Partial<LobbyConversationOptionSnapshot>) : null
        const optionId = cleanHubToken(optionRecord?.id, 64)
        const label = cleanActionLabel(optionRecord?.label || "").slice(0, 90)
        return optionRecord && optionId && label
          ? [{ id: optionId, label, text: cleanActionLabel(optionRecord.text || "").slice(0, 180) }]
          : []
      }).slice(0, 6)
    : []
  const trade = record.trade && typeof record.trade === "object" ? (record.trade as Partial<LobbyConversationTradeSnapshot>) : null
  return {
    actorId: cleanHubToken(record.actorId, 80),
    id,
    kind: cleanHubToken(record.kind, 32),
    options,
    selectedOption: positiveInt(record.selectedOption),
    speaker,
    status: cleanHubToken(record.status, 24),
    text: cleanActionLabel(record.text || "").slice(0, 240),
    trade: trade
      ? {
          item: cleanActionLabel(trade.item || "").slice(0, 80),
          price: positiveInt(trade.price),
          purchased: trade.purchased === true,
        }
      : undefined,
  }
}

function finiteSignedInt(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.trunc(numeric) : 0
}

function cleanProgressSnapshot(value: unknown): LobbyProgressSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Partial<LobbyProgressSnapshot>
  return {
    equipment: cleanEquipmentSnapshots(record.equipment),
    knowledge: cleanKnowledgeSnapshots(record.knowledge),
    levelUp: cleanLevelUpSnapshot(record.levelUp),
    log: cleanHubStringList(record.log, 10, 140),
    statusEffects: cleanStatusEffectSnapshots(record.statusEffects),
    talents: cleanHubStringList(record.talents, 16, 48),
    toasts: cleanToastSnapshots(record.toasts),
  }
}

function cleanLevelUpSnapshot(value: unknown): LobbyLevelUpSnapshot | null {
  if (!value || typeof value !== "object") return null
  const record = value as Partial<LobbyLevelUpSnapshot>
  const choices = Array.isArray(record.choices)
    ? record.choices.flatMap((choice) => {
        const choiceRecord = choice && typeof choice === "object" ? (choice as Partial<LobbyLevelUpChoiceSnapshot>) : null
        const id = cleanHubToken(choiceRecord?.id, 48)
        const name = cleanActionLabel(choiceRecord?.name || "").slice(0, 48)
        const text = cleanActionLabel(choiceRecord?.text || "").slice(0, 140)
        return choiceRecord && id && name ? [{ id, name, text }] : []
      }).slice(0, 9)
    : []
  return {
    choices,
    level: Math.max(1, positiveInt(record.level) || 1),
  }
}

function cleanEquipmentSnapshots(value: unknown): LobbyEquipmentSnapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = item && typeof item === "object" ? (item as Partial<LobbyEquipmentSnapshot>) : null
    const slot = cleanHubToken(record?.slot, 24)
    const id = cleanHubToken(record?.id, 64)
    const name = cleanActionLabel(record?.name || "").slice(0, 64)
    if (!record || !slot || !id || !name) return []
    return [
      {
        activeText: cleanActionLabel(record.activeText || "").slice(0, 140),
        bonusDamage: positiveInt(record.bonusDamage),
        id,
        name,
        rarity: cleanHubToken(record.rarity, 24) || "common",
        slot,
        statBonuses: cleanStatBonusSnapshot(record.statBonuses),
      },
    ]
  }).slice(0, 4)
}

function cleanStatBonusSnapshot(value: unknown): Record<string, number> {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const result: Record<string, number> = {}
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = cleanHubToken(rawKey, 24)
    if (!key) continue
    const numeric = Number(rawValue)
    if (Number.isFinite(numeric)) result[key] = Math.trunc(numeric)
  }
  return result
}

function cleanKnowledgeSnapshots(value: unknown): LobbyKnowledgeSnapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const record = entry && typeof entry === "object" ? (entry as Partial<LobbyKnowledgeSnapshot>) : null
    const id = cleanHubToken(record?.id, 80)
    const title = cleanActionLabel(record?.title || "").slice(0, 80)
    if (!record || !id || !title) return []
    const floor = record.floor === undefined ? undefined : positiveInt(record.floor)
    return [
      {
        discoveredAtTurn: positiveInt(record.discoveredAtTurn),
        floor,
        id,
        kind: cleanHubToken(record.kind, 24) || "note",
        text: cleanActionLabel(record.text || "").slice(0, 200),
        title,
      },
    ]
  }).slice(0, 40)
}

function cleanToastSnapshots(value: unknown): LobbyToastSnapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((toast) => {
    const record = toast && typeof toast === "object" ? (toast as Partial<LobbyToastSnapshot>) : null
    const id = cleanHubToken(record?.id, 80)
    const title = cleanActionLabel(record?.title || "").slice(0, 80)
    if (!record || !id || !title) return []
    return [
      {
        id,
        text: cleanActionLabel(record.text || "").slice(0, 180),
        title,
        tone: cleanHubToken(record.tone, 24) || "info",
        turn: positiveInt(record.turn),
      },
    ]
  }).slice(0, 8)
}

function cleanStatusEffectSnapshots(value: unknown): LobbyStatusEffectSnapshot[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((effect) => {
    const record = effect && typeof effect === "object" ? (effect as Partial<LobbyStatusEffectSnapshot>) : null
    const id = cleanHubToken(record?.id, 32)
    const targetId = cleanHubToken(record?.targetId, 64)
    if (!record || !id || !targetId) return []
    return [
      {
        id,
        label: cleanActionLabel(record.label || "").slice(0, 48),
        magnitude: positiveInt(record.magnitude),
        remainingTurns: positiveInt(record.remainingTurns),
        source: cleanActionLabel(record.source || "").slice(0, 64),
        targetId,
      },
    ]
  }).slice(0, 12)
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

function cleanAccountKey(value: unknown) {
  const text = String(value || "").trim().toLowerCase()
  return /^[a-f0-9]{16,128}$/.test(text) ? text.slice(0, 128) : ""
}

function cleanAccountLabel(value: unknown) {
  return String(value || "").replace(/[^\w .:@-]/g, "").trim().slice(0, 80)
}

function cleanPatchId(value: unknown) {
  const id = String(value || "").trim()
  return /^[A-Za-z0-9_-]{4,96}$/.test(id) ? id : createHash("sha256").update(id || String(Date.now())).digest("hex").slice(0, 16)
}

function positiveInt(value: unknown) {
  return Math.max(0, integer(value))
}

function integer(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : 0
}
