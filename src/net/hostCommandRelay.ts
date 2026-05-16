import {
  attemptFlee,
  cancelSkillCheck,
  chooseConversationOption,
  createSession,
  dismissSkillCheck,
  isHeroClass,
  interactWithWorld,
  performCombatAction,
  performInventoryAction,
  recordTutorialAction,
  rest,
  resolveSkillCheck,
  selectSkill,
  tryMove,
  usePotion,
  type HeroClass,
  type GameSession,
  type InventoryActionId,
  type MultiplayerMode,
  type TutorialActionId,
} from "../game/session.js"
import type { LobbyCommandResult, LobbyCommandType } from "./lobbyState.js"

export type HostRelayCommand = {
  name: string
  playerId: string
  type: LobbyCommandType
  label: string
  payload: Record<string, string | number | boolean>
}

export type HostCommandRelayOptions = {
  mode: MultiplayerMode
  seed: number
}

export class HostCommandRelay {
  private readonly mode: MultiplayerMode
  private readonly seed: number
  private readonly sessions = new Map<string, GameSession>()

  constructor(options: HostCommandRelayOptions) {
    this.mode = options.mode === "race" ? "race" : "coop"
    this.seed = options.seed
  }

  apply(command: HostRelayCommand): LobbyCommandResult {
    const session = this.sessionFor(command)
    this.hydrateFromClientSnapshot(session, command)
    const before = snapshot(session)
    try {
      switch (command.type) {
        case "move":
          this.applyMove(session, command)
          break
        case "interact":
          this.applyInteraction(session, command)
          break
        case "combat":
          this.applyCombat(session, command)
          break
        case "inventory":
          this.applyInventory(session, command)
          break
        case "village":
          return this.result(session, true, "Village command recorded for shared meta-progression.")
      }
    } catch (error) {
      restore(session, before)
      return this.result(session, false, error instanceof Error ? error.message : "Host rejected the command.")
    }

    return this.result(session, true, session.log[0] || session.combat.message || "Command applied.")
  }

  private sessionFor(command: HostRelayCommand) {
    const existing = this.sessions.get(command.playerId)
    if (existing) return existing
    const session = createSession(this.seed, this.mode, classIdFromPayload(command.payload.classId), command.name, undefined, tutorialEnabledFromPayload(command.payload))
    this.sessions.set(command.playerId, session)
    return session
  }

  private applyMove(session: GameSession, command: HostRelayCommand) {
    const direction = directionFromCommand(command)
    if (!direction) throw new Error("Move command needs a direction.")
    tryMove(session, direction.dx, direction.dy)
  }

  private applyInteraction(session: GameSession, command: HostRelayCommand) {
    const label = command.label.toLowerCase()
    if (this.applyTutorialUiAction(session, label)) return
    if (label.includes("stepped away")) {
      if (!cancelSkillCheck(session)) throw new Error("No pending talent check to cancel.")
      return
    }
    if (label.includes("closed talent")) {
      dismissSkillCheck(session)
      return
    }
    if (label.includes("rolled a talent")) {
      const roll = resolveSkillCheck(session)
      if (!roll) throw new Error("No pending talent check to roll.")
      return
    }
    const option = conversationOptionIndex(label)
    if (option !== null) {
      if (!session.conversation) throw new Error("No active NPC conversation.")
      chooseConversationOption(session, option)
      return
    }
    interactWithWorld(session)
  }

  private applyCombat(session: GameSession, command: HostRelayCommand) {
    const label = command.label.toLowerCase()
    const skillIndex = combatSkillIndex(label)
    if (skillIndex !== null) {
      if (!session.combat.active) throw new Error("No active combat for skill selection.")
      selectSkill(session, skillIndex)
      return
    }
    if (label.includes("flee")) {
      if (!attemptFlee(session)) throw new Error("No active combat to flee.")
      return
    }
    if (!session.combat.active) throw new Error("No active combat to resolve.")
    performCombatAction(session)
  }

  private applyInventory(session: GameSession, command: HostRelayCommand) {
    const label = command.label.toLowerCase()
    if (this.applyTutorialUiAction(session, label)) return
    if (label.includes("used potion")) {
      usePotion(session)
      return
    }
    if (label === "rested" || label.includes("rested")) {
      rest(session)
      return
    }
    const action = inventoryActionFromLabel(label)
    const index = inventorySlotFromLabel(label)
    if (action && index !== null) {
      const result = performInventoryAction(session, index, action)
      if (!result.used && action !== "inspect") throw new Error(result.message)
    }
  }

  private applyTutorialUiAction(session: GameSession, label: string) {
    const action = tutorialActionFromLabel(label)
    if (!action) return false
    recordTutorialAction(session, action)
    return true
  }

  private hydrateFromClientSnapshot(session: GameSession, command: HostRelayCommand) {
    const turn = finitePayloadInt(command.payload.turn)
    if (turn === null || turn < session.turn) return
    const floor = finitePayloadInt(command.payload.floor)
    const hp = finitePayloadInt(command.payload.hp)
    const x = finitePayloadInt(command.payload.x)
    const y = finitePayloadInt(command.payload.y)

    if (floor !== null) session.floor = Math.max(1, floor)
    if (hp !== null) session.hp = Math.max(0, hp)
    session.turn = turn
    if (x !== null && y !== null) session.player = { ...session.player, x, y }
  }

  private result(session: GameSession, accepted: boolean, message: string): LobbyCommandResult {
    return {
      accepted,
      floor: session.floor,
      hp: session.hp,
      message,
      status: session.status,
      turn: session.turn,
      x: session.player.x,
      y: session.player.y,
    }
  }
}

function tutorialEnabledFromPayload(payload: HostRelayCommand["payload"]) {
  if (payload.tutorialEnabled === true) return true
  if (payload.tutorialEnabled === false) return false
  return payload.tutorialStage === "movement" || payload.tutorialStage === "npc-check" || payload.tutorialStage === "combat"
}

function classIdFromPayload(value: unknown): HeroClass {
  const classId = typeof value === "string" ? value : undefined
  return isHeroClass(classId) ? classId : "ranger"
}

function tutorialActionFromLabel(label: string): TutorialActionId | null {
  if (label.includes("opened inventory")) return "inventory"
  if (label.includes("opened book")) return "book"
  if (label.includes("opened quest")) return "quests"
  return null
}

function directionFromCommand(command: HostRelayCommand) {
  const direction = String(command.payload.direction || command.label).toLowerCase()
  if (direction.includes("north") || direction.includes("up")) return { dx: 0, dy: -1 }
  if (direction.includes("south") || direction.includes("down")) return { dx: 0, dy: 1 }
  if (direction.includes("west") || direction.includes("left")) return { dx: -1, dy: 0 }
  if (direction.includes("east") || direction.includes("right")) return { dx: 1, dy: 0 }
  return null
}

function conversationOptionIndex(label: string) {
  const match = label.match(/option (\d+)/)
  if (!match) return null
  return Math.max(0, Number(match[1]) - 1)
}

function combatSkillIndex(label: string) {
  const match = label.match(/skill (\d+)/)
  if (!match) return null
  return Math.max(0, Number(match[1]) - 1)
}

function inventoryActionFromLabel(label: string): InventoryActionId | null {
  if (label.startsWith("inspect ")) return "inspect"
  if (label.startsWith("use ")) return "use"
  if (label.startsWith("equip ")) return "equip"
  if (label.startsWith("drop ")) return "drop"
  if (label.startsWith("stash ")) return "stash"
  if (label.startsWith("sell ")) return "sell"
  return null
}

function inventorySlotFromLabel(label: string) {
  const match = label.match(/slot (\d+)/)
  if (!match) return null
  return Math.max(0, Number(match[1]) - 1)
}

function finitePayloadInt(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : null
}

function snapshot(session: GameSession) {
  return {
    floor: session.floor,
    hp: session.hp,
    player: { ...session.player },
    status: session.status,
    turn: session.turn,
  }
}

function restore(session: GameSession, state: ReturnType<typeof snapshot>) {
  session.floor = state.floor
  session.hp = state.hp
  session.player = state.player
  session.status = state.status
  session.turn = state.turn
}
