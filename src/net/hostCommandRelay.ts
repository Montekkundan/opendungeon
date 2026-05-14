import {
  attemptFlee,
  cancelSkillCheck,
  chooseConversationOption,
  createSession,
  dismissSkillCheck,
  interactWithWorld,
  performCombatAction,
  performInventoryAction,
  rest,
  resolveSkillCheck,
  selectSkill,
  tryMove,
  usePotion,
  type GameSession,
  type InventoryActionId,
  type MultiplayerMode,
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
  private readonly session: GameSession

  constructor(options: HostCommandRelayOptions) {
    this.session = createSession(options.seed, options.mode === "race" ? "race" : "coop")
  }

  apply(command: HostRelayCommand): LobbyCommandResult {
    const before = snapshot(this.session)
    try {
      switch (command.type) {
        case "move":
          this.applyMove(command)
          break
        case "interact":
          this.applyInteraction(command)
          break
        case "combat":
          this.applyCombat(command)
          break
        case "inventory":
          this.applyInventory(command)
          break
        case "village":
          return this.result(true, "Village command recorded for shared meta-progression.")
      }
    } catch (error) {
      restore(this.session, before)
      return this.result(false, error instanceof Error ? error.message : "Host rejected the command.")
    }

    return this.result(true, this.session.log[0] || this.session.combat.message || "Command applied.")
  }

  private applyMove(command: HostRelayCommand) {
    const direction = directionFromCommand(command)
    if (!direction) throw new Error("Move command needs a direction.")
    tryMove(this.session, direction.dx, direction.dy)
  }

  private applyInteraction(command: HostRelayCommand) {
    const label = command.label.toLowerCase()
    if (label.includes("stepped away")) {
      if (!cancelSkillCheck(this.session)) throw new Error("No pending talent check to cancel.")
      return
    }
    if (label.includes("closed talent")) {
      dismissSkillCheck(this.session)
      return
    }
    if (label.includes("rolled a talent")) {
      const roll = resolveSkillCheck(this.session)
      if (!roll) throw new Error("No pending talent check to roll.")
      return
    }
    const option = conversationOptionIndex(label)
    if (option !== null) {
      if (!this.session.conversation) throw new Error("No active NPC conversation.")
      chooseConversationOption(this.session, option)
      return
    }
    interactWithWorld(this.session)
  }

  private applyCombat(command: HostRelayCommand) {
    const label = command.label.toLowerCase()
    const skillIndex = combatSkillIndex(label)
    if (skillIndex !== null) {
      if (!this.session.combat.active) throw new Error("No active combat for skill selection.")
      selectSkill(this.session, skillIndex)
      return
    }
    if (label.includes("flee")) {
      if (!attemptFlee(this.session)) throw new Error("No active combat to flee.")
      return
    }
    if (!this.session.combat.active) throw new Error("No active combat to resolve.")
    performCombatAction(this.session)
  }

  private applyInventory(command: HostRelayCommand) {
    const label = command.label.toLowerCase()
    if (label.includes("opened inventory")) return
    if (label.includes("used potion")) {
      usePotion(this.session)
      return
    }
    if (label === "rested" || label.includes("rested")) {
      rest(this.session)
      return
    }
    const action = inventoryActionFromLabel(label)
    const index = inventorySlotFromLabel(label)
    if (action && index !== null) {
      const result = performInventoryAction(this.session, index, action)
      if (!result.used && action !== "inspect") throw new Error(result.message)
    }
  }

  private result(accepted: boolean, message: string): LobbyCommandResult {
    return {
      accepted,
      floor: this.session.floor,
      hp: this.session.hp,
      message,
      status: this.session.status,
      turn: this.session.turn,
      x: this.session.player.x,
      y: this.session.player.y,
    }
  }
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
