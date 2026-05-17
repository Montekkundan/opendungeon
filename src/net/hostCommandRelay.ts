import {
  attemptFlee,
  buildHubStation,
  cancelSkillCheck,
  chooseConversationOption,
  createSession,
  craftVillageRecipe,
  createNextDescentSession,
  cycleCoopVillagePermission,
  customizeVillageHouse,
  dismissSkillCheck,
  isHeroClass,
  interactWithWorld,
  moveVillagePlayer,
  performCombatAction,
  performInventoryAction,
  prepareFood,
  recordTutorialAction,
  rest,
  runVillageShopSale,
  resolveSkillCheck,
  selectSkill,
  sellLootToVillage,
  tryMove,
  tutorialCoopCheckpoint,
  unlockHub,
  usePotion,
  visitVillageLocation,
  type HeroClass,
  type GameSession,
  type HubStationId,
  type InventoryActionId,
  type MultiplayerMode,
  type TutorialActionId,
  type TutorialStageId,
} from "../game/session.js"
import type { LobbyCommandResult, LobbyCommandType, LobbyContextSnapshot, LobbyHubSnapshot, LobbyProgressSnapshot, LobbyWorldSnapshot } from "./lobbyState.js"

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
    const before = snapshot(session)
    try {
      this.hydrateFromClientSnapshot(session, command)
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
          this.applyVillage(session, command)
          break
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
    const action = interactionActionFromPayload(command.payload.interactionAction)
    const tutorialAction = tutorialActionFromPayload(command.payload.tutorialAction)
    if (tutorialAction) {
      recordTutorialAction(session, tutorialAction)
      return
    }
    if (action === "cancel-skill-check") {
      if (!cancelSkillCheck(session)) throw new Error("No pending talent check to cancel.")
      return
    }
    if (action === "dismiss-skill-check") {
      dismissSkillCheck(session)
      return
    }
    if (action === "roll-skill-check") {
      const roll = resolveSkillCheck(session)
      if (!roll) throw new Error("No pending talent check to roll.")
      return
    }
    if (action === "leave-conversation" || action === "close-conversation") {
      if (!session.conversation) throw new Error("No active NPC conversation.")
      session.conversation = null
      session.log.unshift("Conversation closed.")
      return
    }
    if (action === "advance-conversation") {
      if (!session.conversation) throw new Error("No active NPC conversation.")
      interactWithWorld(session)
      return
    }
    if (action === "conversation-option") {
      const option = conversationOptionFromPayload(command.payload.conversationOption)
      if (option === null) throw new Error("Conversation option command needs an option index.")
      if (!session.conversation) throw new Error("No active NPC conversation.")
      chooseConversationOption(session, option)
      return
    }
    if (action === "world") {
      interactWithWorld(session)
      return
    }
    throw new Error("Interaction command needs an action.")
  }

  private applyCombat(session: GameSession, command: HostRelayCommand) {
    const action = combatActionFromPayload(command.payload.combatAction)
    if (action === "select-skill") {
      if (!session.combat.active) throw new Error("No active combat for skill selection.")
      const skillIndex = combatSkillIndexFromPayload(command.payload.combatSkillIndex)
      if (skillIndex === null) throw new Error("Combat skill selection needs a skill index.")
      selectSkill(session, skillIndex)
      session.log.unshift(session.combat.message)
      return
    }
    if (action === "flee") {
      if (!attemptFlee(session)) throw new Error("No active combat to flee.")
      return
    }
    if (action !== "roll" && action !== "resolve") throw new Error("Combat command needs an action.")
    if (!session.combat.active) throw new Error("No active combat to resolve.")
    performCombatAction(session)
  }

  private applyInventory(session: GameSession, command: HostRelayCommand) {
    const tutorialAction = tutorialActionFromPayload(command.payload.tutorialAction)
    if (tutorialAction) {
      recordTutorialAction(session, tutorialAction)
      return
    }
    const utilityAction = inventoryUtilityActionFromPayload(command.payload.inventoryUtilityAction)
    if (utilityAction === "use-potion") {
      usePotion(session)
      return
    }
    if (utilityAction === "rest") {
      rest(session)
      return
    }
    const action = inventoryActionFromPayload(command.payload.inventoryAction)
    if (!action) throw new Error("Inventory command needs an action.")
    const index = inventorySlotFromPayload(command.payload.inventorySlot)
    if (index === null) throw new Error("Inventory command needs a slot.")
    const result = performInventoryAction(session, index, action)
    if (!result.used && action !== "inspect") throw new Error(result.message)
  }

  private applyVillage(session: GameSession, command: HostRelayCommand) {
    if (!session.hub.unlocked) unlockHub(session, "Co-op village command opened the shared road.")
    const action = villageActionFromPayload(command.payload.villageAction)
    if (!action) throw new Error("Village command needs an action.")
    if (action === "move") {
      const dx = finitePayloadInt(command.payload.dx) ?? 0
      const dy = finitePayloadInt(command.payload.dy) ?? 0
      moveVillagePlayer(session, dx, dy)
      return
    }
    if (action === "next-descent") {
      const nextSeed = finitePayloadInt(command.payload.nextSeed) ?? this.seed + 1
      Object.assign(session, createNextDescentSession(session, nextSeed))
      return
    }
    if (action === "build-station") {
      const station = hubStationFromPayload(command.payload.station)
      if (!station) throw new Error("Village build command needs a station.")
      buildHubStation(session, station)
      return
    }
    if (action === "sell-loot") {
      sellLootToVillage(session)
      return
    }
    if (action === "prepare-food") {
      prepareFood(session)
      return
    }
    if (action === "craft") {
      craftVillageRecipe(session)
      return
    }
    if (action === "market-sale") {
      runVillageShopSale(session)
      return
    }
    if (action === "customize-house") {
      customizeVillageHouse(session, command.playerId)
      return
    }
    if (action === "cycle-permission") {
      cycleCoopVillagePermission(session)
      return
    }
    if (action === "visit-location") {
      visitVillageLocation(session)
      return
    }
  }

  private hydrateFromClientSnapshot(session: GameSession, command: HostRelayCommand) {
    const turn = finitePayloadInt(command.payload.turn)
    if (turn === null || turn < session.turn) return
    const floor = finitePayloadInt(command.payload.floor)
    const hp = finitePayloadInt(command.payload.hp)
    const x = command.type === "move" ? finitePayloadInt(command.payload.fromX) ?? finitePayloadInt(command.payload.x) : finitePayloadInt(command.payload.x)
    const y = command.type === "move" ? finitePayloadInt(command.payload.fromY) ?? finitePayloadInt(command.payload.y) : finitePayloadInt(command.payload.y)

    if (floor !== null) session.floor = Math.max(1, floor)
    if (hp !== null) session.hp = Math.max(0, hp)
    session.turn = turn
    if (x !== null && y !== null) session.player = { ...session.player, x, y }
    hydrateTutorialFromPayload(session, command.payload)
  }

  private result(session: GameSession, accepted: boolean, message: string): LobbyCommandResult {
    const checkpoint = tutorialCoopCheckpoint(session)
    return {
      accepted,
      combatActive: session.combat.active,
      combatMessage: session.combat.message,
      combatRound: session.combat.round,
      context: contextSnapshot(session),
      floor: session.floor,
      focus: session.focus,
      gold: session.gold,
      hub: hubSnapshot(session),
      hp: session.hp,
      inventoryCount: session.inventory.length,
      inventoryItems: session.inventory.slice(0, 32),
      level: session.level,
      maxFocus: session.maxFocus,
      maxHp: session.maxHp,
      message,
      progress: progressSnapshot(session),
      status: session.status,
      tutorialCompleted: checkpoint.completed,
      tutorialReady: checkpoint.ready,
      tutorialStage: checkpoint.stage,
      turn: session.turn,
      world: worldSnapshot(session),
      x: session.player.x,
      xp: session.xp,
      y: session.player.y,
    }
  }
}

function worldSnapshot(session: GameSession): LobbyWorldSnapshot {
  return {
    dungeon: {
      actors: session.dungeon.actors.map((actor) => ({
        ai: actor.ai
          ? {
              aggroRadius: actor.ai.aggroRadius,
              alerted: actor.ai.alerted,
              chaseTurns: actor.ai.chaseTurns,
              direction: actor.ai.direction,
              leashRadius: actor.ai.leashRadius,
              origin: { ...actor.ai.origin },
              pattern: actor.ai.pattern,
              stunnedTurns: actor.ai.stunnedTurns,
            }
          : undefined,
        damage: actor.damage,
        hp: actor.hp,
        id: actor.id,
        kind: actor.kind,
        maxHp: actor.maxHp,
        phase: actor.phase,
        x: actor.position.x,
        y: actor.position.y,
      })),
      anchors: session.dungeon.anchors.map((anchor) => ({
        floor: anchor.floor,
        height: anchor.height,
        id: anchor.id,
        kind: anchor.kind,
        roomIndex: anchor.roomIndex,
        width: anchor.width,
        x: anchor.position.x,
        y: anchor.position.y,
      })),
      floor: session.dungeon.floor,
      height: session.dungeon.height,
      playerStart: { ...session.dungeon.playerStart },
      secrets: session.dungeon.secrets.map((secret) => ({
        discovered: secret.discovered,
        door: { ...secret.door },
        id: secret.id,
        reward: { ...secret.reward },
        roomIndex: secret.roomIndex,
      })),
      seed: session.dungeon.seed,
      tiles: session.dungeon.tiles.map((row) => [...row]),
      width: session.dungeon.width,
    },
    floorModifier: { ...session.floorModifier },
  }
}

function tutorialEnabledFromPayload(payload: HostRelayCommand["payload"]) {
  if (payload.tutorialEnabled === true) return true
  if (payload.tutorialEnabled === false) return false
  return payload.tutorialStage === "movement" || payload.tutorialStage === "npc-check" || payload.tutorialStage === "combat"
}

function hydrateTutorialFromPayload(session: GameSession, payload: HostRelayCommand["payload"]) {
  if (payload.tutorialEnabled === false) {
    session.tutorial.enabled = false
    session.tutorial.completed = true
    session.tutorial.stage = "complete"
    return
  }

  const stage = tutorialStageFromPayload(payload.tutorialStage)
  if (!stage || tutorialStageRank(stage) < tutorialStageRank(session.tutorial.stage)) return
  session.tutorial.enabled = true
  session.tutorial.stage = stage
  session.tutorial.completed = stage === "complete" || payload.tutorialCompleted === true

  if (stage === "npc-check" || stage === "combat" || stage === "complete") {
    session.tutorial.movedUp = true
    session.tutorial.movedDown = true
    session.tutorial.movedLeft = true
    session.tutorial.movedRight = true
    session.tutorial.openedBook = true
    session.tutorial.openedInventory = true
    session.tutorial.openedQuests = true
  }
  if (stage === "combat" || stage === "complete") {
    session.tutorial.talkedToNpc = true
    session.tutorial.handledTalentCheck = true
  }
}

function tutorialStageFromPayload(value: unknown): TutorialStageId | null {
  return value === "movement" || value === "npc-check" || value === "combat" || value === "complete" ? value : null
}

function tutorialStageRank(stage: TutorialStageId) {
  if (stage === "movement") return 0
  if (stage === "npc-check") return 1
  if (stage === "combat") return 2
  return 3
}

function classIdFromPayload(value: unknown): HeroClass {
  const classId = typeof value === "string" ? value : undefined
  return isHeroClass(classId) ? classId : "ranger"
}

function tutorialActionFromPayload(value: unknown): TutorialActionId | null {
  if (value === "inventory" || value === "book" || value === "quests") return value
  return null
}

function directionFromCommand(command: HostRelayCommand) {
  const direction = typeof command.payload.direction === "string" ? command.payload.direction.toLowerCase() : ""
  if (direction.includes("north") || direction.includes("up")) return { dx: 0, dy: -1 }
  if (direction.includes("south") || direction.includes("down")) return { dx: 0, dy: 1 }
  if (direction.includes("west") || direction.includes("left")) return { dx: -1, dy: 0 }
  if (direction.includes("east") || direction.includes("right")) return { dx: 1, dy: 0 }
  return null
}

function conversationOptionFromPayload(value: unknown) {
  const index = finitePayloadInt(value)
  return index !== null && index >= 0 ? index : null
}

function interactionActionFromPayload(value: unknown) {
  if (
    value === "cancel-skill-check" ||
    value === "dismiss-skill-check" ||
    value === "roll-skill-check" ||
    value === "leave-conversation" ||
    value === "close-conversation" ||
    value === "advance-conversation" ||
    value === "conversation-option" ||
    value === "world"
  ) {
    return value
  }
  return null
}

function combatActionFromPayload(value: unknown) {
  if (value === "select-skill" || value === "flee" || value === "roll" || value === "resolve") return value
  return null
}

function combatSkillIndexFromPayload(value: unknown) {
  const index = finitePayloadInt(value)
  return index !== null && index >= 0 ? index : null
}

function inventoryActionFromPayload(value: unknown): InventoryActionId | null {
  if (value === "inspect" || value === "use" || value === "equip" || value === "drop" || value === "stash" || value === "sell") return value
  return null
}

function inventoryUtilityActionFromPayload(value: unknown) {
  if (value === "rest" || value === "use-potion") return value
  return null
}

function inventorySlotFromPayload(value: unknown) {
  const index = finitePayloadInt(value)
  return index !== null && index >= 0 ? index : null
}

function villageActionFromPayload(value: unknown) {
  if (
    value === "move" ||
    value === "next-descent" ||
    value === "build-station" ||
    value === "sell-loot" ||
    value === "prepare-food" ||
    value === "craft" ||
    value === "market-sale" ||
    value === "customize-house" ||
    value === "cycle-permission" ||
    value === "visit-location"
  ) {
    return value
  }
  return null
}

function hubStationFromPayload(value: unknown): HubStationId | null {
  if (value === "blacksmith" || value === "kitchen" || value === "farm" || value === "upgrade-bench") return value
  return null
}

function finitePayloadInt(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.floor(number) : null
}

function contextSnapshot(session: GameSession): LobbyContextSnapshot {
  return {
    combat: {
      active: session.combat.active,
      actorIds: [...session.combat.actorIds],
      lastRoll: session.combat.lastRoll ? { ...session.combat.lastRoll } : undefined,
      message: session.combat.message,
      round: session.combat.round,
      selectedSkill: session.combat.selectedSkill,
      selectedTarget: session.combat.selectedTarget,
    },
    conversation: session.conversation
      ? {
          actorId: session.conversation.actorId,
          id: session.conversation.id,
          kind: session.conversation.kind,
          options: session.conversation.options.map((option) => ({ ...option })),
          selectedOption: session.conversation.selectedOption,
          speaker: session.conversation.speaker,
          status: session.conversation.status,
          text: session.conversation.text,
          trade: session.conversation.trade ? { ...session.conversation.trade } : undefined,
        }
      : null,
    skillCheck: session.skillCheck
      ? {
          actor: session.skillCheck.actor,
          dc: session.skillCheck.dc,
          failureText: session.skillCheck.failureText,
          id: session.skillCheck.id,
          prompt: session.skillCheck.prompt,
          roll: session.skillCheck.roll ? { ...session.skillCheck.roll } : undefined,
          source: session.skillCheck.source,
          stat: session.skillCheck.stat,
          status: session.skillCheck.status,
          successText: session.skillCheck.successText,
          title: session.skillCheck.title,
          x: session.skillCheck.point.x,
          y: session.skillCheck.point.y,
        }
      : null,
  }
}

function hubSnapshot(session: GameSession): LobbyHubSnapshot {
  const hub = session.hub
  return {
    calendar: {
      day: hub.calendar.day,
      festival: hub.calendar.festival,
      season: hub.calendar.season,
      weather: hub.calendar.weather,
    },
    coins: hub.coins,
    farm: {
      planted: hub.farm.planted,
      plots: hub.farm.plots,
      ready: hub.farm.ready,
      sprinklers: hub.farm.sprinklers,
    },
    houses: hub.houses.map((house) => ({
      built: house.built,
      name: house.name,
      playerId: house.playerId,
    })),
    lootSold: hub.lootSold,
    preparedFood: hub.preparedFood.slice(0, 12),
    stations: Object.values(hub.stations).map((station) => ({
      built: station.built,
      id: station.id,
      level: station.level,
    })),
    unlocked: hub.unlocked,
    unlockedGear: hub.unlockedGear.slice(0, 20),
    village: {
      market: { ...hub.village.market },
      permissions: { ...hub.village.permissions },
      selectedLocation: hub.village.selectedLocation,
      selectedPermission: hub.village.selectedPermission,
      shopLog: hub.village.shopLog.slice(0, 8),
    },
  }
}

function progressSnapshot(session: GameSession): LobbyProgressSnapshot {
  return {
    equipment: Object.entries(session.equipment ?? {}).flatMap(([slot, item]) =>
      item
        ? [
            {
              activeText: item.activeText,
              bonusDamage: item.bonusDamage,
              id: item.id,
              name: item.name,
              rarity: item.rarity,
              slot,
              statBonuses: Object.fromEntries(Object.entries(item.statBonuses ?? {}).filter(([, value]) => Number.isFinite(value))),
            },
          ]
        : [],
    ),
    knowledge: session.knowledge.slice(0, 40).map((entry) => ({ ...entry })),
    levelUp: session.levelUp ? structuredClone(session.levelUp) : null,
    log: session.log.slice(0, 10),
    statusEffects: session.statusEffects.slice(0, 12).map((effect) => ({ ...effect })),
    talents: [...session.talents],
    toasts: session.toasts.slice(0, 8).map((toast) => ({ ...toast })),
  }
}

function snapshot(session: GameSession) {
  return structuredClone(session)
}

function restore(session: GameSession, state: ReturnType<typeof snapshot>) {
  Object.assign(session, structuredClone(state))
}
