import { createDungeon, enemyAi, setTile, tileAt, type Actor, type Dungeon, type EnemyAi, type Point } from "./dungeon.js"
import { isBossActorId, isEnemyActorId, isNpcActorId, type NpcActorId } from "./domainTypes.js"
import {
  applyLevelGrowth,
  derivedMaxFocus,
  derivedMaxHp,
  normalizeStats,
  statAbbreviations,
  statLabels,
  statModifier,
  statsForClass,
  type HeroStats,
  type StatId,
} from "./stats.js"
import {
  completeFirstMatchingWorldEvent,
  createInitialWorldConfig,
  createWorldLogEntry,
  worldAnchorsFromDungeonAnchors,
  type WorldConfig,
  type WorldEvent,
  type WorldEventType,
  type WorldLogEntry,
} from "../world/worldConfig.js"
import { clamp, wrap } from "../shared/numeric.js"

export type MultiplayerMode = "solo" | "coop" | "race"
export const heroClassIds = ["warden", "arcanist", "ranger", "duelist", "cleric", "engineer", "witch", "grave-knight"] as const
export type HeroClass = (typeof heroClassIds)[number]

export type Hero = {
  name: string
  classId: HeroClass
  title: string
}

export type FloorModifierId = "steady" | "gloom" | "rich-veins" | "unstable-ground" | "focus-draft"

export type FloorModifier = {
  id: FloorModifierId
  name: string
  text: string
  visionBonus: number
  restFocusBonus: number
  trapDamageBonus: number
  goldBonus: number
}

export type CombatSkillId = "strike" | "aimed-shot" | "arcane-burst" | "smite" | "shadow-hex" | "lucky-riposte"
export type StatusEffectId = "guarded" | "weakened" | "burning"

export type StatusEffect = {
  id: StatusEffectId
  targetId: "player" | string
  label: string
  remainingTurns: number
  magnitude: number
  source: string
}

export type CombatSkillEffect = {
  id: StatusEffectId
  target: "self" | "target"
  duration: number
  magnitude: number
  label: string
}

export type CombatSkill = {
  id: CombatSkillId
  name: string
  stat: StatId
  cost: number
  dc: number
  damage: number
  text: string
  area?: "single" | "all"
  effect?: CombatSkillEffect
}

export type CombatRoll = {
  d20: number
  modifier: number
  total: number
  dc: number
  hit: boolean
  critical: boolean
  stat: StatId
  skill: string
  target: string
}

export type CombatInitiativeEntry = {
  id: "player" | string
  kind: "player" | Actor["kind"]
  roll: number
  modifier: number
  total: number
}

export type CombatState = {
  active: boolean
  actorIds: string[]
  selectedTarget: number
  selectedSkill: number
  initiative: CombatInitiativeEntry[]
  round: number
  lastRoll?: CombatRoll
  message: string
}

export type SkillCheckSource = "potion" | "relic" | "chest"

export type SkillCheckRoll = {
  d20: number
  modifier: number
  total: number
  dc: number
  success: boolean
  critical: boolean
  fumble: boolean
  stat: StatId
  consequence: string
}

export type SkillCheckState = {
  id: string
  source: SkillCheckSource
  title: string
  actor: string
  stat: StatId
  dc: number
  point: Point
  prompt: string
  successText: string
  failureText: string
  status: "pending" | "resolved"
  roll?: SkillCheckRoll
}

export type MerchantTrade = {
  item: string
  price: number
  purchased: boolean
}

export type ConversationState = {
  id: string
  actorId: string
  kind: NpcActorId
  speaker: string
  text: string
  status: "open" | "completed"
  trade?: MerchantTrade
}

export type GameSession = {
  mode: MultiplayerMode
  hero: Hero
  stats: HeroStats
  seed: number
  floor: number
  floorModifier: FloorModifier
  player: Point
  hp: number
  maxHp: number
  focus: number
  maxFocus: number
  dungeon: Dungeon
  log: string[]
  inventory: string[]
  turn: number
  status: "running" | "dead" | "victory"
  gold: number
  xp: number
  level: number
  kills: number
  finalFloor: number
  visible: Set<string>
  seen: Set<string>
  combat: CombatState
  skillCheck: SkillCheckState | null
  conversation: ConversationState | null
  statusEffects: StatusEffect[]
  world: WorldConfig
  worldLog: WorldLogEntry[]
  pendingWorldGeneration: boolean
}

const heroTitles: Record<HeroClass, string> = {
  warden: "Warden of Stone",
  arcanist: "Arcanist of Ash",
  ranger: "Ranger of Hollow Paths",
  duelist: "Duelist of Bright Edges",
  cleric: "Cleric of Quiet Bells",
  engineer: "Engineer of Trapworks",
  witch: "Witch of Black Salt",
  "grave-knight": "Grave Knight Errant",
}

const startingLoadouts: Record<HeroClass, string[]> = {
  warden: ["Warden axe", "Stone buckler", "Dew vial"],
  arcanist: ["Ash focus", "Bound spark", "Deploy nerve potion"],
  ranger: ["Rusty blade", "Dew vial", "Rope arrow"],
  duelist: ["Needle rapier", "Parry cloak", "Dew vial"],
  cleric: ["Bell mace", "Shrine charm", "Deploy nerve potion"],
  engineer: ["Gear spanner", "Tripwire kit", "Rollback scroll"],
  witch: ["Salt knife", "Hex pouch", "Cursed shard"],
  "grave-knight": ["Grave blade", "Oath shield", "Bone token"],
}

const floorModifiers: FloorModifier[] = [
  {
    id: "steady",
    name: "Steady Stone",
    text: "No unusual floor pressure.",
    visionBonus: 0,
    restFocusBonus: 0,
    trapDamageBonus: 0,
    goldBonus: 0,
  },
  {
    id: "gloom",
    name: "Gloom",
    text: "Sight lines tighten around the crawler.",
    visionBonus: -2,
    restFocusBonus: 0,
    trapDamageBonus: 0,
    goldBonus: 0,
  },
  {
    id: "rich-veins",
    name: "Rich Veins",
    text: "Caches and relics carry extra gold.",
    visionBonus: 0,
    restFocusBonus: 0,
    trapDamageBonus: 0,
    goldBonus: 5,
  },
  {
    id: "unstable-ground",
    name: "Unstable Ground",
    text: "Trap plates hit harder.",
    visionBonus: 0,
    restFocusBonus: 0,
    trapDamageBonus: 1,
    goldBonus: 0,
  },
  {
    id: "focus-draft",
    name: "Focus Draft",
    text: "Resting restores more focus.",
    visionBonus: 1,
    restFocusBonus: 1,
    trapDamageBonus: 0,
    goldBonus: 0,
  },
]

export function startingLoadout(classId: HeroClass) {
  return [...startingLoadouts[classId]]
}

export function isHeroClass(value: string | undefined): value is HeroClass {
  return Boolean(value && (heroClassIds as readonly string[]).includes(value))
}

export function floorModifierFor(seed: number, floor: number): FloorModifier {
  const index = Math.abs(seed * 31 + floor * 17) % floorModifiers.length
  return { ...floorModifiers[index] }
}

export const combatSkills: CombatSkill[] = [
  {
    id: "strike",
    name: "Strike",
    stat: "strength",
    cost: 0,
    dc: 10,
    damage: 3,
    text: "Reliable melee attack.",
  },
  {
    id: "aimed-shot",
    name: "Aimed Shot",
    stat: "dexterity",
    cost: 1,
    dc: 13,
    damage: 5,
    text: "Harder hit with ranger precision.",
  },
  {
    id: "arcane-burst",
    name: "Arcane Burst",
    stat: "intelligence",
    cost: 2,
    dc: 15,
    damage: 8,
    text: "High-risk focus spender that leaves surviving targets burning.",
    area: "all",
    effect: {
      id: "burning",
      target: "target",
      duration: 2,
      magnitude: 1,
      label: "Burning",
    },
  },
  {
    id: "smite",
    name: "Smite",
    stat: "faith",
    cost: 1,
    dc: 12,
    damage: 4,
    text: "Faith-driven strike that briefly guards the crawler.",
    effect: {
      id: "guarded",
      target: "self",
      duration: 1,
      magnitude: 1,
      label: "Guarded",
    },
  },
  {
    id: "shadow-hex",
    name: "Shadow Hex",
    stat: "mind",
    cost: 1,
    dc: 12,
    damage: 3,
    text: "Careful occult pressure that weakens surviving targets.",
    effect: {
      id: "weakened",
      target: "target",
      duration: 2,
      magnitude: 2,
      label: "Weakened",
    },
  },
  {
    id: "lucky-riposte",
    name: "Lucky Riposte",
    stat: "luck",
    cost: 1,
    dc: 14,
    damage: 6,
    text: "Swingy counterattack that rewards lucky builds with a stronger guard.",
    effect: {
      id: "guarded",
      target: "self",
      duration: 2,
      magnitude: 2,
      label: "Guarded",
    },
  },
]

export function createSession(seed = 2423368, mode: MultiplayerMode = "solo", classId: HeroClass = "ranger", heroName = "Mira"): GameSession {
  const dungeon = createDungeon(seed, 1)
  const stats = statsForClass(classId)
  const maxHp = derivedMaxHp(stats)
  const maxFocus = derivedMaxFocus(stats)
  const finalFloor = 5
  const floorModifier = floorModifierFor(seed, 1)
  const world = createWorldForSeed(seed, finalFloor)
  const session: GameSession = {
    mode,
    hero: {
      name: cleanHeroName(heroName),
      classId,
      title: heroTitles[classId],
    },
    stats,
    seed,
    floor: 1,
    floorModifier,
    player: { ...dungeon.playerStart },
    hp: maxHp,
    maxHp,
    focus: maxFocus,
    maxFocus,
    dungeon,
    log: ["Dev jokes hide in loot."],
    inventory: startingLoadout(classId),
    turn: 0,
    status: "running",
    gold: 0,
    xp: 0,
    level: 1,
    kills: 0,
    finalFloor,
    visible: new Set(),
    seen: new Set(),
    combat: {
      active: false,
      actorIds: [],
      selectedTarget: 0,
      selectedSkill: 0,
      initiative: [],
      round: 0,
      message: "",
    },
    skillCheck: null,
    conversation: null,
    statusEffects: [],
    world,
    worldLog: [
      createWorldLogEntry(world.worldId, 0, {
        type: "world-created",
        message: `World ${world.worldId} created from seed ${seed}.`,
      }),
    ],
    pendingWorldGeneration: false,
  }
  revealAroundPlayer(session)
  return session
}

export function tryMove(session: GameSession, dx: number, dy: number) {
  if (session.status !== "running") return
  if (session.skillCheck) {
    session.log.unshift("Resolve the talent check before moving.")
    trimLog(session)
    return
  }
  if (session.combat.active) {
    session.log.unshift("Initiative is locked. Choose a target and roll.")
    trimLog(session)
    return
  }
  if (session.conversation) session.conversation = null

  const next = { x: session.player.x + dx, y: session.player.y + dy }
  const actor = actorAt(session.dungeon.actors, next)

  if (actor) {
    if (isNpcActorId(actor.kind)) startConversation(session, actor)
    else if (isEnemyActorId(actor.kind)) startCombat(session, [actor])
    return
  }

  const tile = tileAt(session.dungeon, next)
  if (tile === "wall" || tile === "void") {
    session.log.unshift("Cold stone blocks the way.")
    trimLog(session)
    return
  }

  session.player = next

  if (tile === "door") {
    unlockDoor(session, next)
  } else if (tile === "stairs") {
    if (hasFinalGuardian(session)) {
      session.log.unshift("The final gate is sealed by the necromancer.")
      trimLog(session)
      return
    }
    descend(session)
    if (session.status === "running") advanceTurn(session)
    else trimLog(session)
    return
  } else if (isSkillCheckSource(tile)) {
    startSkillCheck(session, tile, next)
    revealAroundPlayer(session)
    return
  } else if (tile === "trap") {
    triggerTrap(session, next)
  } else {
    session.log.unshift("You move through the dark.")
  }

  advanceTurn(session)
}

export function rest(session: GameSession) {
  if (session.status !== "running") return
  if (session.skillCheck) {
    session.log.unshift("The check demands an answer first.")
    trimLog(session)
    return
  }
  if (session.combat.active) {
    session.log.unshift("No resting while blades are out.")
    trimLog(session)
    return
  }
  const focusGain = 1 + Math.max(0, session.floorModifier.restFocusBonus)
  session.focus = Math.min(session.maxFocus, session.focus + focusGain)
  session.log.unshift(focusGain > 1 ? `${session.floorModifier.name} carries your breath. Focus returns.` : "You steady your breath. Focus returns.")
  advanceTurn(session)
}

export function usePotion(session: GameSession) {
  if (session.status !== "running") return
  if (session.skillCheck) {
    session.log.unshift("Hands are busy with the talent check.")
    trimLog(session)
    return
  }
  const index = session.inventory.indexOf("Deploy nerve potion")
  if (index < 0) {
    session.log.unshift("No potion in the pack.")
    trimLog(session)
    return
  }

  session.inventory.splice(index, 1)
  session.hp = Math.min(session.maxHp, session.hp + 5)
  session.log.unshift("Potion used. The pulse settles.")
  if (session.combat.active) finishCombatRound(session, true)
  else trimLog(session)
}

export function interactWithWorld(session: GameSession): ConversationState | null {
  if (session.status !== "running") return null
  if (session.skillCheck?.status === "pending") {
    resolveSkillCheck(session)
    return null
  }
  if (session.skillCheck?.status === "resolved") {
    dismissSkillCheck(session)
    return null
  }
  if (session.combat.active) {
    performCombatAction(session)
    return null
  }
  if (session.conversation) return continueConversation(session)

  const actor = adjacentNpc(session)
  if (actor) return startConversation(session, actor)

  session.log.unshift("Nothing answers here yet.")
  trimLog(session)
  return null
}

export function resolveSkillCheck(session: GameSession): SkillCheckRoll | null {
  const check = session.skillCheck
  if (!check || check.status !== "pending" || session.status !== "running") return null

  const d20 = rollSkillCheckD20(session, check)
  const modifier = skillCheckModifier(session, check.stat)
  const total = d20 + modifier
  const critical = d20 === 20
  const fumble = d20 === 1
  const success = critical || (!fumble && total >= check.dc)
  const consequence = success ? check.successText : check.failureText
  const roll: SkillCheckRoll = {
    d20,
    modifier,
    total,
    dc: check.dc,
    success,
    critical,
    fumble,
    stat: check.stat,
    consequence,
  }

  check.status = "resolved"
  check.roll = roll
  applySkillCheckConsequence(session, check, roll)
  advanceTurn(session)
  return roll
}

export function dismissSkillCheck(session: GameSession) {
  if (session.skillCheck?.status === "resolved") session.skillCheck = null
}

export function combatModifier(session: GameSession, stat: StatId) {
  return session.level + statModifier(session.stats[stat])
}

export function skillCheckModifier(session: GameSession, stat: StatId) {
  const primary = statModifier(session.stats[stat])
  const luck = stat === "luck" ? 0 : Math.max(0, Math.floor(statModifier(session.stats.luck) / 2))
  return Math.floor(session.level / 2) + primary + luck
}

export function currentBiome(session: GameSession) {
  return biomeAt(session, session.player)
}

export function biomeAt(session: GameSession, point: Point) {
  const anchorId = nearestWorldAnchorId(session, point)
  const anchor = anchorId ? session.world.anchors.find((candidate) => candidate.id === anchorId) : null
  return anchor?.biome ?? session.world.anchors.find((candidate) => candidate.floor === session.floor)?.biome ?? "crypt"
}

export function normalizeSessionAfterLoad(session: GameSession): GameSession {
  session.stats = normalizeStats(session.hero.classId, session.stats)
  session.maxHp = Math.max(derivedMaxHp(session.stats), session.maxHp || 0)
  session.maxFocus = Math.max(derivedMaxFocus(session.stats), session.maxFocus || 0)
  session.hp = clamp(session.hp, 0, session.maxHp)
  session.focus = clamp(session.focus, 0, session.maxFocus)
  session.floorModifier = normalizeFloorModifier(session.floorModifier, session.seed, session.floor)
  session.skillCheck ??= null
  session.combat ??= {
    active: false,
    actorIds: [],
    selectedTarget: 0,
    selectedSkill: 0,
    initiative: [],
    round: 0,
    message: "",
  }
  session.combat.initiative = session.combat.active ? normalizeCombatInitiative(session, session.combat.initiative) : []
  session.combat.round = session.combat.active ? Math.max(1, Math.floor(session.combat.round || 1)) : 0
  session.conversation = normalizeConversation(session.conversation)
  session.statusEffects = normalizeStatusEffects(session.statusEffects)
  session.world ??= createWorldForSeed(session.seed, session.finalFloor || 5)
  session.worldLog ??= []
  session.pendingWorldGeneration = Boolean(session.pendingWorldGeneration)
  session.dungeon.actors.forEach((actor, index) => {
    actor.maxHp = Math.max(actor.maxHp ?? actor.hp, actor.hp)
    actor.phase = Math.max(1, Math.floor(actor.phase ?? 1))
    if (isEnemyActorId(actor.kind)) ensureEnemyAi(actor, index, session.floor)
    else actor.ai = undefined
  })
  session.dungeon.secrets ??= []
  pruneStatusEffects(session)
  return session
}

export function actorAt(actors: Actor[], point: Point): Actor | undefined {
  return actors.find((actor) => actor.position.x === point.x && actor.position.y === point.y)
}

export function combatTargets(session: GameSession): Actor[] {
  if (!session.combat.active) return []
  const targets = session.combat.actorIds
    .map((id) => session.dungeon.actors.find((actor) => actor.id === id))
    .filter((actor): actor is Actor => Boolean(actor))

  session.combat.actorIds = targets.map((actor) => actor.id)
  if (targets.length === 0) session.combat.selectedTarget = 0
  else session.combat.selectedTarget = clamp(session.combat.selectedTarget, 0, targets.length - 1)
  syncCombatInitiative(session, targets)

  return targets
}

export function cycleTarget(session: GameSession, delta: number) {
  const targets = combatTargets(session)
  if (targets.length === 0) return
  session.combat.selectedTarget = wrap(session.combat.selectedTarget + delta, targets.length)
  const target = targets[session.combat.selectedTarget]
  session.combat.message = `Targeting ${label(target.kind)}.`
}

export function selectSkill(session: GameSession, index: number) {
  if (!session.combat.active) return
  session.combat.selectedSkill = clamp(index, 0, combatSkills.length - 1)
  const skill = combatSkills[session.combat.selectedSkill]
  const modifier = combatModifier(session, skill.stat)
  session.combat.message = `${skill.name}: d20 ${formatSigned(modifier)} ${statAbbreviations[skill.stat]} vs DC ${skill.dc + enemyDefenseBonus(combatTargets(session)[session.combat.selectedTarget]?.kind)}.`
}

export function statusEffectsFor(session: GameSession, targetId: StatusEffect["targetId"]) {
  return (session.statusEffects ?? []).filter((effect) => effect.targetId === targetId)
}

export function statusEffectMagnitude(session: GameSession, targetId: StatusEffect["targetId"], id: StatusEffectId) {
  return statusEffectsFor(session, targetId)
    .filter((effect) => effect.id === id)
    .reduce((total, effect) => total + effect.magnitude, 0)
}

export function applyStatusEffect(session: GameSession, effect: StatusEffect) {
  const next = normalizeStatusEffect(effect)
  if (!next) return null
  session.statusEffects ??= []
  const existing = session.statusEffects.find((candidate) => candidate.id === next.id && candidate.targetId === next.targetId)
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, next.remainingTurns)
    existing.magnitude = Math.max(existing.magnitude, next.magnitude)
    existing.label = next.label
    existing.source = next.source
    return existing
  }
  session.statusEffects.push(next)
  return next
}

export function fleeModifier(session: GameSession) {
  return (
    session.level +
    statModifier(session.stats.dexterity) +
    Math.max(0, statModifier(session.stats.luck)) +
    Math.max(0, Math.floor(statModifier(session.stats.endurance) / 2))
  )
}

export function fleeDc(session: GameSession) {
  const targets = combatTargets(session)
  const pressure = targets.reduce((highest, target) => Math.max(highest, enemyDefenseBonus(target.kind)), 0)
  return 11 + Math.floor(session.floor / 2) + pressure + Math.min(4, Math.max(0, targets.length - 1))
}

export function attemptFlee(session: GameSession): CombatRoll | null {
  if (session.status !== "running" || !session.combat.active) return null
  const targets = combatTargets(session)
  if (targets.length === 0) {
    endCombat(session, "No threat holds you.")
    return null
  }

  const d20 = rollFleeD20(session, targets)
  const modifier = fleeModifier(session)
  const total = d20 + modifier
  const dc = fleeDc(session)
  const critical = d20 === 20
  const success = critical || (d20 !== 1 && total >= dc)
  const roll: CombatRoll = {
    d20,
    modifier,
    total,
    dc,
    hit: success,
    critical,
    stat: "dexterity",
    skill: "Flee",
    target: "escape",
  }

  session.combat.lastRoll = roll
  if (success) {
    const escape = escapeStep(session, targets)
    if (escape) session.player = escape
    for (const target of targets) ensureEnemyAi(target, 0, session.floor).alerted = true
    endCombat(session, escape ? "You break away from the fight." : "You slip initiative, but the room is tight.")
    session.turn += 1
    revealAroundPlayer(session)
    trimLog(session)
  } else {
    session.combat.message = `Flee fails: d20 ${d20}${formatSigned(modifier)} vs DC ${dc}.`
    session.log.unshift(session.combat.message)
    finishCombatRound(session, true)
  }

  return roll
}

export function performCombatAction(session: GameSession) {
  if (session.status !== "running" || !session.combat.active) return
  const targets = combatTargets(session)
  const target = targets[session.combat.selectedTarget]
  if (!target) return

  const skill = combatSkills[session.combat.selectedSkill]
  if (session.focus < skill.cost) {
    session.combat.message = "Not enough focus for that skill."
    session.log.unshift(session.combat.message)
    trimLog(session)
    return
  }

  session.focus -= skill.cost
  const d20 = rollD20(session, skill, target)
  const modifier = combatModifier(session, skill.stat)
  const total = d20 + modifier
  const dc = skill.dc + enemyDefenseBonus(target.kind)
  const critical = d20 === 20
  const hit = critical || (d20 !== 1 && total >= dc)
  const damageBonus = Math.max(0, statModifier(session.stats[skill.stat]))
  const damage = critical ? skill.damage + session.level + damageBonus + 3 : skill.damage + Math.floor(session.level / 2) + Math.floor(damageBonus / 2)

  session.combat.lastRoll = {
    d20,
    modifier,
    total,
    dc,
    hit,
    critical,
    stat: skill.stat,
    skill: skill.name,
    target: label(target.kind),
  }

  if (hit) {
    const affectedTargets = skill.area === "all" ? [...targets] : [target]
    const appliedEffects: StatusEffect[] = []
    const phaseMessages: string[] = []
    for (const affected of affectedTargets) {
      const nextDamage = affected.id === target.id ? damage : Math.max(1, Math.floor(damage / 2))
      affected.hp -= nextDamage
      const appliedEffect = applyCombatSkillEffect(session, skill, affected)
      if (appliedEffect) appliedEffects.push(appliedEffect)
      const phaseMessage = maybeAdvanceBossPhase(session, affected)
      if (phaseMessage) phaseMessages.push(phaseMessage)
    }
    const targetText = affectedTargets.length > 1 ? `${affectedTargets.length} targets` : label(target.kind)
    const effectText = appliedEffects.length ? ` ${appliedEffects[0].label} applied.` : ""
    const phaseText = phaseMessages.length ? ` ${phaseMessages[0]}` : ""
    session.combat.message = `${skill.name} hits ${targetText} for ${damage}.${effectText}${phaseText}`
    session.log.unshift(`d20 ${d20}${formatSigned(modifier)} vs DC ${dc}: hit.`)
    for (const affected of affectedTargets) {
      if (affected.hp <= 0 && session.dungeon.actors.includes(affected)) defeatActor(session, affected)
    }
  } else {
    session.combat.message = `${skill.name} misses ${label(target.kind)}.`
    session.log.unshift(`d20 ${d20}${formatSigned(modifier)} vs DC ${dc}: miss.`)
  }

  if (combatTargets(session).length > 0) finishCombatRound(session, true)
  else {
    endCombat(session, "The room falls silent.")
    finishCombatRound(session, false)
  }
}

function removeActor(actors: Actor[], actor: Actor) {
  const index = actors.indexOf(actor)
  if (index >= 0) actors.splice(index, 1)
}

function startCombat(session: GameSession, actors: Actor[]) {
  const nearby = nearbyHostiles(session)
  const actorIds = [...actors, ...nearby]
    .filter((actor) => isEnemyActorId(actor.kind))
    .filter((actor, index, list) => list.findIndex((candidate) => candidate.id === actor.id) === index)
    .map((actor) => actor.id)

  if (actorIds.length === 0) return
  session.combat = {
    active: true,
    actorIds,
    selectedTarget: 0,
    selectedSkill: session.combat.selectedSkill,
    initiative: rollCombatInitiative(session, actorIds),
    round: 1,
    lastRoll: session.combat.lastRoll,
    message: "Initiative rolled. Choose target, choose skill, then roll d20.",
  }
  session.log.unshift(`Combat starts. ${initiativeSummary(session.combat.initiative)}.`)
  trimLog(session)
}

function endCombat(session: GameSession, message: string) {
  session.combat.active = false
  session.combat.actorIds = []
  session.combat.selectedTarget = 0
  session.combat.initiative = []
  session.combat.round = 0
  session.combat.message = message
  session.log.unshift(message)
  trimLog(session)
}

function defeatActor(session: GameSession, actor: Actor) {
  const position = { ...actor.position }
  removeActor(session.dungeon.actors, actor)
  removeStatusEffectsFor(session, actor.id)
  session.kills += 1
  session.xp += xpFor(actor.kind)
  session.log.unshift(defeatMessage(actor.kind))
  maybeLevelUp(session)
  completeWorldProgress(session, isBossActorId(actor.kind) ? "boss" : "enemy", position, defeatMessage(actor.kind))
}

function defeatMessage(kind: Actor["kind"]) {
  if (kind === "slime") return "Slime dissolved. Cache warmed."
  if (kind === "ghoul") return "Ghoul banished. Ticket closed."
  if (kind === "gallows-wisp") return "Gallows wisp snuffed. The rope goes slack."
  if (kind === "rust-squire") return "Rust squire collapses. Armor flakes to dust."
  if (kind === "carrion-moth") return "Carrion moth scattered. The air clears."
  if (kind === "crypt-mimic") return "Crypt mimic cracked. False wood stops breathing."
  if (kind === "grave-root-boss") return "Grave-root boss severed. The dungeon root recoils."
  return "Necromancer silenced. Dead branch pruned."
}

function startSkillCheck(session: GameSession, source: SkillCheckSource, point: Point) {
  const event = skillCheckEvent(source, session.floor)
  session.skillCheck = {
    ...event,
    id: `${source}-${session.floor}-${point.x}-${point.y}-${session.turn}`,
    source,
    point: { ...point },
    status: "pending",
  }
  session.log.unshift(`${event.actor}: ${event.title}. Roll ${statLabels[event.stat]}.`)
  trimLog(session)
}

function skillCheckEvent(source: SkillCheckSource, floor: number): Omit<SkillCheckState, "id" | "source" | "point" | "status" | "roll"> {
  if (source === "chest") {
    return {
      title: "Sealed Cache",
      actor: "Quartermaster Shade",
      stat: "dexterity",
      dc: 12 + Math.floor(floor / 2),
      prompt: "Pick the cache without tripping the hooked wire.",
      successText: "The latch gives. You claim gold and a rollback scroll.",
      failureText: "The wire snaps. The cache burns your hand and loses its best goods.",
    }
  }

  if (source === "relic") {
    return {
      title: "Whispering Relic",
      actor: "Hollow Oracle",
      stat: "intelligence",
      dc: 13 + floor,
      prompt: "Decode the inscription before the relic rewrites the room.",
      successText: "You bind the relic, gaining focus and an old secret.",
      failureText: "The relic bites back. Focus drains into the stone.",
    }
  }

  return {
    title: "Shaking Vial",
    actor: "Wounded Courier",
    stat: "luck",
    dc: 10 + Math.floor(floor / 2),
    prompt: "Steady the courier's hand before the medicine cracks.",
    successText: "The courier breathes again and gives you the vial.",
    failureText: "The vial breaks. You salvage a dose, but the glass cuts deep.",
  }
}

function applySkillCheckConsequence(session: GameSession, check: SkillCheckState, roll: SkillCheckRoll) {
  setTile(session.dungeon, check.point, "floor")
  if (roll.success) applySkillCheckSuccess(session, check)
  else applySkillCheckFailure(session, check)
  completeWorldProgress(session, "loot", check.point, `${check.title}: ${roll.success ? "success" : "failure"}.`)
  session.log.unshift(`${check.title}: ${roll.success ? "success" : "failure"} (${roll.total}/${roll.dc}).`)
  trimLog(session)
}

function applySkillCheckSuccess(session: GameSession, check: SkillCheckState) {
  if (check.source === "chest") {
    session.gold += 28 + session.floor * 3
    session.gold += session.floorModifier.goldBonus
    session.inventory.unshift("Rollback scroll")
    session.xp += 2
  } else if (check.source === "relic") {
    session.gold += 14 + session.floor * 2
    session.gold += session.floorModifier.goldBonus
    session.inventory.unshift("Bound relic")
    session.focus = Math.min(session.maxFocus, session.focus + 3)
    session.xp += 3
  } else {
    session.gold += 5
    session.gold += Math.floor(session.floorModifier.goldBonus / 2)
    session.inventory.unshift("Deploy nerve potion")
    session.hp = Math.min(session.maxHp, session.hp + 2)
    session.xp += 1
  }
  maybeLevelUp(session)
}

function applySkillCheckFailure(session: GameSession, check: SkillCheckState) {
  if (check.source === "chest") {
    session.hp -= 3
    session.gold += 4
    session.inventory.unshift("Bent lockpick")
  } else if (check.source === "relic") {
    session.focus = Math.max(0, session.focus - 3)
    session.hp -= 1
    session.inventory.unshift("Cursed shard")
  } else {
    session.hp -= 2
    session.inventory.unshift("Cracked dew vial")
  }
}

function triggerTrap(session: GameSession, point: Point) {
  setTile(session.dungeon, point, "floor")
  const damage = 2 + Math.floor(session.floor / 2) + Math.max(0, session.floorModifier.trapDamageBonus)
  session.hp -= damage
  session.log.unshift(`Trap sprung for ${damage}. The room remembers your step.`)
  completeWorldProgress(session, "interaction", point, `Trap sprung on floor ${session.floor}.`)
}

function unlockDoor(session: GameSession, point: Point) {
  setTile(session.dungeon, point, "floor")
  const secret = session.dungeon.secrets?.find((candidate) => samePoint(candidate.door, point))
  if (secret && !secret.discovered) {
    secret.discovered = true
    session.log.unshift("Locked door opens. A secret room breathes out.")
    completeWorldProgress(session, "interaction", point, `Secret room ${secret.id} discovered.`)
    return
  }

  session.log.unshift("Locked door opens.")
  completeWorldProgress(session, "interaction", point, "Locked door opened.")
}

const npcDialog: Record<NpcActorId, { speaker: string; text: string }> = {
  cartographer: {
    speaker: "Cartographer Venn",
    text: "The stairs stay honest, but rooms shift by seed. Mark the anchor before you chase noise.",
  },
  "wound-surgeon": {
    speaker: "Wound Surgeon Iri",
    text: "Keep pressure on the bright cuts. I can stitch pride later; health comes first.",
  },
  "shrine-keeper": {
    speaker: "Shrine Keeper Sol",
    text: "Every relic asks for a stat. Answer with your best talent, not your loudest one.",
  },
  jailer: {
    speaker: "Jailer Maro",
    text: "Mimics wake slowly. If a cache watches back, make the first roll count.",
  },
  merchant: {
    speaker: "Ash Merchant Pell",
    text: "Twelve gold buys a salve. No haggling in rooms that can hear us.",
  },
}

function startConversation(session: GameSession, actor: Actor): ConversationState {
  const kind = isNpcActorId(actor.kind) ? actor.kind : "cartographer"
  const dialog = npcDialog[kind]
  const conversation: ConversationState = {
    id: `${actor.id}-${session.turn}`,
    actorId: actor.id,
    kind,
    speaker: dialog.speaker,
    text: dialog.text,
    status: "open",
    trade: kind === "merchant" ? { item: "Merchant salve", price: 12, purchased: false } : undefined,
  }

  session.conversation = conversation
  session.log.unshift(`${conversation.speaker}: ${conversation.text}`)
  completeWorldProgress(session, kind === "merchant" ? "interaction" : "quest", actor.position, `${conversation.speaker} shared a lead.`)
  trimLog(session)
  return conversation
}

function continueConversation(session: GameSession): ConversationState | null {
  const conversation = session.conversation
  if (!conversation) return null

  if (conversation.trade && !conversation.trade.purchased) {
    if (session.gold >= conversation.trade.price) {
      session.gold -= conversation.trade.price
      session.inventory.unshift(conversation.trade.item)
      conversation.trade.purchased = true
      conversation.status = "completed"
      conversation.text = `${conversation.trade.item} purchased for ${conversation.trade.price} gold.`
      session.log.unshift(`${conversation.speaker}: ${conversation.text}`)
      const actor = session.dungeon.actors.find((candidate) => candidate.id === conversation.actorId)
      completeWorldProgress(session, "loot", actor?.position ?? session.player, `${conversation.speaker} completed a merchant trade.`)
      trimLog(session)
      return conversation
    }

    conversation.status = "completed"
    conversation.text = `${conversation.trade.price} gold needed for ${conversation.trade.item}.`
    session.log.unshift(`${conversation.speaker}: ${conversation.text}`)
    trimLog(session)
    return conversation
  }

  session.conversation = null
  session.log.unshift(`${conversation.speaker} returns to the dark.`)
  trimLog(session)
  return null
}

function adjacentNpc(session: GameSession) {
  return cardinalNeighbors(session.player)
    .map((point) => actorAt(session.dungeon.actors, point))
    .find((actor): actor is Actor => Boolean(actor && isNpcActorId(actor.kind))) ?? null
}

function isSkillCheckSource(tile: string): tile is SkillCheckSource {
  return tile === "potion" || tile === "relic" || tile === "chest"
}

function xpFor(kind: Actor["kind"]) {
  if (kind === "grave-root-boss") return 12
  if (kind === "necromancer") return 7
  if (kind === "crypt-mimic") return 6
  if (kind === "ghoul") return 4
  if (kind === "rust-squire" || kind === "gallows-wisp") return 3
  if (kind === "carrion-moth") return 2
  return 2
}

function maybeLevelUp(session: GameSession) {
  const needed = session.level * 10
  if (session.xp < needed) return
  session.xp -= needed
  session.level += 1
  applyLevelGrowth(session.hero.classId, session.stats, session.level)
  session.maxHp = derivedMaxHp(session.stats)
  session.maxFocus = derivedMaxFocus(session.stats)
  session.hp = Math.min(session.maxHp, session.hp + 4)
  session.focus = session.maxFocus
  session.log.unshift(`Level ${session.level}. The oath hardens.`)
}

function descend(session: GameSession) {
  if (session.floor >= session.finalFloor) {
    session.status = "victory"
    session.log.unshift("The final gate opens. The dungeon releases you.")
    return
  }
  session.floor += 1
  session.dungeon = createDungeon(session.seed, session.floor)
  session.floorModifier = floorModifierFor(session.seed, session.floor)
  session.player = { ...session.dungeon.playerStart }
  session.visible = new Set()
  session.seen = new Set()
  session.hp = Math.min(session.maxHp, session.hp + 3)
  session.focus = Math.min(session.maxFocus, session.focus + 2)
  revealAroundPlayer(session)
  completeWorldProgress(session, "biome", session.player, `Reached floor ${session.floor}.`)
  session.log.unshift(`Floor ${session.floor}. ${session.floorModifier.name}. Same seed, darker shape.`)
}

function advanceTurn(session: GameSession) {
  session.turn += 1
  tickStatusEffects(session)
  if (!session.combat.active) moveEnemies(session)
  revealAroundPlayer(session)
  if (session.hp <= 0) {
    session.hp = 0
    session.status = "dead"
    session.log.unshift("You fall beneath the dungeon's build.")
  }
  trimLog(session)
}

function moveEnemies(session: GameSession) {
  for (const [index, actor] of [...session.dungeon.actors].entries()) {
    if (!isEnemyActorId(actor.kind)) continue
    const ai = ensureEnemyAi(actor, index, session.floor)
    const distance = manhattan(actor.position, session.player)
    if (distance === 1) {
      startCombat(session, [actor])
      return
    }

    if (canSensePlayer(session, actor, ai)) ai.alerted = true
    else if (ai.alerted && distance > ai.leashRadius) ai.alerted = false

    const step = ai.alerted ? chaseStep(session, actor) : patrolStep(session, actor, index)
    if (step) {
      actor.position = step
      if (manhattan(actor.position, session.player) === 1) {
        startCombat(session, [actor])
        return
      }
    }
  }
}

function finishCombatRound(session: GameSession, enemiesAct: boolean) {
  if (enemiesAct) combatEnemyTurn(session)
  tickStatusEffects(session)
  if (session.combat.active) session.combat.round += 1
  session.turn += 1
  revealAroundPlayer(session)
  if (session.hp <= 0) {
    session.hp = 0
    session.status = "dead"
    session.log.unshift("You fall beneath the dungeon's build.")
  }
  combatTargets(session)
  if (session.status === "running" && session.combat.active && session.combat.actorIds.length === 0) endCombat(session, "The room falls silent.")
  trimLog(session)
}

function combatEnemyTurn(session: GameSession) {
  for (const actor of combatTargetsInInitiativeOrder(session)) {
    ensureEnemyAi(actor, 0, session.floor).alerted = true
    if (manhattan(actor.position, session.player) === 1) {
      const weakened = statusEffectMagnitude(session, actor.id, "weakened")
      const guardEffects = statusEffectsFor(session, "player").filter((effect) => effect.id === "guarded")
      const guarded = guardEffects.reduce((total, effect) => total + effect.magnitude, 0)
      const damage = Math.max(0, actor.damage - weakened - guarded)
      const blocked = Math.max(0, actor.damage - weakened - damage)
      session.hp -= damage
      const reduction = actor.damage === damage ? "" : ` (${actor.damage - damage} blocked by status)`
      session.log.unshift(`${label(actor.kind)} hits for ${damage}${reduction}.`)
      if (blocked > 0) session.log.unshift(`Block reaction absorbs ${blocked}.`)
      if (guardEffects.some((effect) => effect.source === "Lucky Riposte")) {
        actor.hp -= 1
        session.log.unshift(`Riposte reaction clips ${label(actor.kind)} for 1.`)
        if (actor.hp <= 0 && session.dungeon.actors.includes(actor)) defeatActor(session, actor)
      }
      continue
    }

    const step = chaseStep(session, actor)
    if (step) actor.position = step
  }
}

function rollCombatInitiative(session: GameSession, actorIds: string[]): CombatInitiativeEntry[] {
  const actors = actorIds
    .map((id) => session.dungeon.actors.find((actor) => actor.id === id))
    .filter((actor): actor is Actor => Boolean(actor))
  return sortInitiative([
    playerInitiativeEntry(session),
    ...actors.map((actor) => actorInitiativeEntry(session, actor)),
  ])
}

function normalizeCombatInitiative(session: GameSession, entries: CombatInitiativeEntry[] | undefined): CombatInitiativeEntry[] {
  if (!Array.isArray(entries)) return rollCombatInitiative(session, session.combat.actorIds)
  const actorIds = new Set(session.combat.actorIds)
  const normalized = entries.flatMap((entry) => {
    if (!entry || typeof entry.id !== "string") return []
    if (entry.id !== "player" && !actorIds.has(entry.id)) return []
    const roll = clamp(Math.floor(Number(entry.roll) || 1), 1, 20)
    const modifier = Math.floor(Number(entry.modifier) || 0)
    const kind = entry.id === "player" ? "player" : session.dungeon.actors.find((actor) => actor.id === entry.id)?.kind
    if (!kind) return []
    return [{ id: entry.id, kind, roll, modifier, total: roll + modifier }]
  })
  if (!normalized.some((entry) => entry.id === "player")) normalized.push(playerInitiativeEntry(session))
  for (const actorId of actorIds) {
    if (!normalized.some((entry) => entry.id === actorId)) {
      const actor = session.dungeon.actors.find((candidate) => candidate.id === actorId)
      if (actor) normalized.push(actorInitiativeEntry(session, actor))
    }
  }
  return sortInitiative(normalized)
}

function syncCombatInitiative(session: GameSession, targets: Actor[]) {
  if (!session.combat.active) return
  const targetIds = new Set(targets.map((target) => target.id))
  session.combat.initiative = sortInitiative(
    session.combat.initiative.filter((entry) => entry.id === "player" || targetIds.has(entry.id)),
  )
  if (!session.combat.initiative.some((entry) => entry.id === "player")) session.combat.initiative.push(playerInitiativeEntry(session))
  for (const target of targets) {
    if (!session.combat.initiative.some((entry) => entry.id === target.id)) session.combat.initiative.push(actorInitiativeEntry(session, target))
  }
  session.combat.initiative = sortInitiative(session.combat.initiative)
}

function combatTargetsInInitiativeOrder(session: GameSession) {
  const targets = combatTargets(session)
  const order = new Map(session.combat.initiative.map((entry, index) => [entry.id, index]))
  return [...targets].sort((left, right) => (order.get(left.id) ?? 99) - (order.get(right.id) ?? 99))
}

function playerInitiativeEntry(session: GameSession): CombatInitiativeEntry {
  const roll = initiativeD20(session, "player")
  const modifier = session.level + statModifier(session.stats.dexterity) + Math.max(0, Math.floor(statModifier(session.stats.luck) / 2))
  return {
    id: "player",
    kind: "player",
    roll,
    modifier,
    total: roll + modifier,
  }
}

function actorInitiativeEntry(session: GameSession, actor: Actor): CombatInitiativeEntry {
  const roll = initiativeD20(session, actor.id)
  const modifier = enemyDefenseBonus(actor.kind) + Math.max(0, (actor.phase ?? 1) - 1)
  return {
    id: actor.id,
    kind: actor.kind,
    roll,
    modifier,
    total: roll + modifier,
  }
}

function sortInitiative(entries: CombatInitiativeEntry[]) {
  return [...entries].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total
    if (right.roll !== left.roll) return right.roll - left.roll
    return initiativeTieBreaker(left) - initiativeTieBreaker(right)
  })
}

function initiativeTieBreaker(entry: CombatInitiativeEntry) {
  if (entry.id === "player") return -1
  return entry.id.split("").reduce((total, char) => total + char.charCodeAt(0), 0)
}

function initiativeSummary(entries: CombatInitiativeEntry[]) {
  const enemies = entries.filter((entry) => entry.id !== "player").slice(0, 3).map((entry) => label(entry.kind as Actor["kind"]))
  const order = ["You", ...enemies].join(" > ")
  return `Initiative: ${order}`
}

function applyCombatSkillEffect(session: GameSession, skill: CombatSkill, target: Actor) {
  if (!skill.effect) return null
  if (skill.effect.target === "target" && target.hp <= 0) return null
  const targetId = skill.effect.target === "self" ? "player" : target.id
  return applyStatusEffect(session, {
    id: skill.effect.id,
    targetId,
    label: skill.effect.label,
    remainingTurns: skill.effect.duration,
    magnitude: skill.effect.magnitude,
    source: skill.name,
  })
}

function maybeAdvanceBossPhase(session: GameSession, actor: Actor) {
  if (!isBossActorId(actor.kind) || actor.hp <= 0 || (actor.phase ?? 1) >= 2) return null
  const maxHp = actor.maxHp ?? Math.max(actor.hp, 1)
  if (actor.hp > Math.floor(maxHp / 2)) return null
  actor.phase = 2
  actor.damage += 2
  const ai = ensureEnemyAi(actor, 0, session.floor)
  ai.alerted = true
  ai.aggroRadius += 2
  ai.leashRadius += 2
  const message = `${label(actor.kind)} enters phase 2.`
  session.log.unshift(message)
  return message
}

function tickStatusEffects(session: GameSession) {
  if (!session.statusEffects?.length) return

  for (const effect of [...session.statusEffects]) {
    if (effect.id !== "burning") continue
    if (effect.targetId === "player") {
      session.hp -= effect.magnitude
      session.log.unshift(`Burning deals ${effect.magnitude}.`)
      continue
    }

    const actor = session.dungeon.actors.find((candidate) => candidate.id === effect.targetId)
    if (!actor) continue
    actor.hp -= effect.magnitude
    session.log.unshift(`${label(actor.kind)} burns for ${effect.magnitude}.`)
    if (actor.hp <= 0) defeatActor(session, actor)
  }

  for (const effect of session.statusEffects) effect.remainingTurns -= 1
  pruneStatusEffects(session)
}

function normalizeStatusEffects(effects: StatusEffect[] | undefined): StatusEffect[] {
  if (!Array.isArray(effects)) return []
  return effects.flatMap((effect) => {
    const next = normalizeStatusEffect(effect)
    return next ? [next] : []
  })
}

function normalizeStatusEffect(effect: Partial<StatusEffect> | undefined): StatusEffect | null {
  if (!effect || !isStatusEffectId(effect.id) || typeof effect.targetId !== "string") return null
  const remainingTurns = Math.max(1, Math.floor(Number(effect.remainingTurns)))
  const magnitude = Math.max(1, Math.floor(Number(effect.magnitude)))
  if (!Number.isFinite(remainingTurns) || !Number.isFinite(magnitude)) return null
  return {
    id: effect.id,
    targetId: effect.targetId === "player" ? "player" : effect.targetId,
    label: cleanStatusLabel(effect.label || statusEffectLabel(effect.id)),
    remainingTurns,
    magnitude,
    source: cleanStatusLabel(effect.source || "Unknown"),
  }
}

function normalizeConversation(conversation: Partial<ConversationState> | null | undefined): ConversationState | null {
  const kind = String(conversation?.kind ?? "")
  if (!conversation || typeof conversation.actorId !== "string" || !isNpcActorId(kind)) return null
  const trade = conversation.trade
  const normalizedTrade =
    trade && typeof trade === "object"
      ? {
          item: cleanConversationText(trade.item || "Merchant salve", 40),
          price: Math.max(1, Math.floor(Number(trade.price) || 12)),
          purchased: Boolean(trade.purchased),
        }
      : undefined

  return {
    id: cleanConversationText(conversation.id || `${conversation.actorId}-loaded`, 48),
    actorId: cleanConversationText(conversation.actorId, 48),
    kind,
    speaker: cleanConversationText(conversation.speaker || npcDialog[kind].speaker, 48),
    text: cleanConversationText(conversation.text || npcDialog[kind].text, 180),
    status: conversation.status === "completed" ? "completed" : "open",
    trade: normalizedTrade,
  }
}

function pruneStatusEffects(session: GameSession) {
  const actorIds = new Set(session.dungeon.actors.map((actor) => actor.id))
  session.statusEffects = session.statusEffects.filter((effect) => effect.remainingTurns > 0 && (effect.targetId === "player" || actorIds.has(effect.targetId)))
}

function removeStatusEffectsFor(session: GameSession, targetId: StatusEffect["targetId"]) {
  session.statusEffects = session.statusEffects.filter((effect) => effect.targetId !== targetId)
}

function isStatusEffectId(value: unknown): value is StatusEffectId {
  return value === "guarded" || value === "weakened" || value === "burning"
}

function statusEffectLabel(id: StatusEffectId) {
  if (id === "guarded") return "Guarded"
  if (id === "weakened") return "Weakened"
  return "Burning"
}

function cleanStatusLabel(text: string) {
  return text.replace(/[^\w .:/'()-]/g, "").trim().slice(0, 40) || "Status"
}

function cleanConversationText(text: string, maxLength: number) {
  return text.replace(/[^\w .:/'(),;-]/g, "").trim().slice(0, maxLength) || "Conversation"
}

function cleanHeroName(text: string) {
  return text.replace(/[^\w .'-]/g, "").trim().slice(0, 24) || "Mira"
}

function normalizeFloorModifier(modifier: FloorModifier | undefined, seed: number, floor: number): FloorModifier {
  const fallback = floorModifierFor(seed, floor)
  if (!modifier || !floorModifiers.some((candidate) => candidate.id === modifier.id)) return fallback
  const source = floorModifiers.find((candidate) => candidate.id === modifier.id) ?? fallback
  return { ...source }
}

function stepToward(from: Point, to: Point): Point {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  if (Math.abs(to.x - from.x) > Math.abs(to.y - from.y)) return { x: from.x + dx, y: from.y }
  return { x: from.x, y: from.y + dy }
}

function chaseStep(session: GameSession, actor: Actor): Point | null {
  const preferred = stepToward(actor.position, session.player)
  const candidates = cardinalNeighbors(actor.position).sort((left, right) => {
    const preferredLeft = samePoint(left, preferred) ? -1 : 0
    const preferredRight = samePoint(right, preferred) ? -1 : 0
    return manhattan(left, session.player) + preferredLeft - (manhattan(right, session.player) + preferredRight)
  })
  return candidates.find((candidate) => canActorStepTo(session, actor, candidate)) ?? null
}

function patrolStep(session: GameSession, actor: Actor, index: number): Point | null {
  const ai = ensureEnemyAi(actor, index, session.floor)
  if (ai.pattern === "sentinel") return null

  if (ai.pattern === "wander" || ai.pattern === "stalker") {
    if (ai.pattern === "wander" && (session.turn + index) % 2 !== 0) return null
    const directions = cardinalDirections()
    for (let offset = 0; offset < directions.length; offset++) {
      const direction = directions[(session.turn + index + offset) % directions.length]
      const candidate = { x: actor.position.x + direction.x, y: actor.position.y + direction.y }
      if (manhattan(candidate, ai.origin) <= Math.max(2, Math.floor(ai.leashRadius / 2)) && canActorStepTo(session, actor, candidate)) return candidate
    }
    return null
  }

  const horizontal = ai.pattern === "patrol-horizontal"
  const forward = { x: actor.position.x + (horizontal ? ai.direction : 0), y: actor.position.y + (horizontal ? 0 : ai.direction) }
  if (manhattan(forward, ai.origin) <= Math.floor(ai.leashRadius / 2) && canActorStepTo(session, actor, forward)) return forward
  ai.direction = ai.direction === 1 ? -1 : 1
  const backward = { x: actor.position.x + (horizontal ? ai.direction : 0), y: actor.position.y + (horizontal ? 0 : ai.direction) }
  if (canActorStepTo(session, actor, backward)) return backward
  return null
}

function canSensePlayer(session: GameSession, actor: Actor, ai: EnemyAi) {
  return manhattan(actor.position, session.player) <= ai.aggroRadius && hasLineOfSight(session, actor.position)
}

function canActorStepTo(session: GameSession, actor: Actor, point: Point) {
  if (tileAt(session.dungeon, point) !== "floor") return false
  if (samePoint(point, session.player)) return false
  const occupied = session.dungeon.actors.some((candidate) => candidate.id !== actor.id && samePoint(candidate.position, point))
  return !occupied
}

function escapeStep(session: GameSession, targets: Actor[]): Point | null {
  return cardinalNeighbors(session.player)
    .filter((candidate) => tileAt(session.dungeon, candidate) === "floor")
    .filter((candidate) => !actorAt(session.dungeon.actors, candidate))
    .sort((left, right) => distanceFromThreats(right, targets) - distanceFromThreats(left, targets))[0] ?? null
}

function distanceFromThreats(point: Point, targets: Actor[]) {
  return targets.reduce((nearest, target) => Math.min(nearest, manhattan(point, target.position)), Number.POSITIVE_INFINITY)
}

function cardinalNeighbors(point: Point) {
  return cardinalDirections().map((direction) => ({ x: point.x + direction.x, y: point.y + direction.y }))
}

function cardinalDirections() {
  return [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
  ]
}

function samePoint(left: Point, right: Point) {
  return left.x === right.x && left.y === right.y
}

function manhattan(a: Point, b: Point) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function nearbyHostiles(session: GameSession) {
  return session.dungeon.actors.filter((actor) => {
    if (!isEnemyActorId(actor.kind)) return false
    const ai = ensureEnemyAi(actor, 0, session.floor)
    const key = pointKey(actor.position)
    return session.visible.has(key) && manhattan(actor.position, session.player) <= Math.max(6, ai.aggroRadius)
  })
}

export function enemyBehaviorText(actor: Actor) {
  const ai = actor.ai
  const phase = actor.phase && actor.phase > 1 ? ` P${actor.phase}` : ""
  if (!ai) return "Watching"
  if (ai.alerted) return `Chasing R${ai.aggroRadius}${phase}`
  if (ai.pattern === "patrol-horizontal") return `Patrol east/west R${ai.aggroRadius}${phase}`
  if (ai.pattern === "patrol-vertical") return `Patrol north/south R${ai.aggroRadius}${phase}`
  if (ai.pattern === "stalker") return `Stalker R${ai.aggroRadius}${phase}`
  if (ai.pattern === "wander") return `Wander R${ai.aggroRadius}${phase}`
  return `Guard R${ai.aggroRadius}${phase}`
}

function enemyDefenseBonus(kind: Actor["kind"] | undefined) {
  if (kind === "grave-root-boss") return 5
  if (kind === "necromancer") return 4
  if (kind === "crypt-mimic") return 3
  if (kind === "ghoul") return 2
  if (kind === "rust-squire" || kind === "gallows-wisp") return 1
  return 0
}

function rollD20(session: GameSession, skill: CombatSkill, target: Actor) {
  const skillSalt = combatSkills.findIndex((candidate) => candidate.id === skill.id) + 1
  const targetSalt = target.id.split("").reduce((total, char) => total + char.charCodeAt(0), 0)
  const value = session.seed * 1103515245 + session.floor * 9973 + session.turn * 7919 + session.kills * 313 + skillSalt * 101 + targetSalt
  return (Math.abs(value) % 20) + 1
}

function rollFleeD20(session: GameSession, targets: Actor[]) {
  const targetSalt = targets.reduce((total, target) => total + target.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0), 0)
  const value = session.seed * 134775813 + session.floor * 9127 + session.turn * 4567 + session.player.x * 313 + session.player.y * 733 + targetSalt
  return (Math.abs(value) % 20) + 1
}

function initiativeD20(session: GameSession, id: string) {
  const salt = id.split("").reduce((total, char) => total + char.charCodeAt(0), id === "player" ? 17 : 0)
  const value = session.seed * 1664525 + session.floor * 1013904223 + session.turn * 22695477 + salt * 1109
  return (Math.abs(value) % 20) + 1
}

function rollSkillCheckD20(session: GameSession, check: SkillCheckState) {
  const sourceSalt = check.source.split("").reduce((total, char) => total + char.charCodeAt(0), 0)
  const statSalt = check.stat.split("").reduce((total, char) => total + char.charCodeAt(0), 0)
  const value =
    session.seed * 1664525 +
    session.floor * 22695477 +
    session.turn * 1109 +
    check.point.x * 421 +
    check.point.y * 173 +
    sourceSalt * 47 +
    statSalt
  return (Math.abs(value) % 20) + 1
}

function formatSigned(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function label(kind: Actor["kind"]) {
  if (kind === "slime") return "Slime"
  if (kind === "ghoul") return "Ghoul"
  if (kind === "gallows-wisp") return "Gallows Wisp"
  if (kind === "rust-squire") return "Rust Squire"
  if (kind === "carrion-moth") return "Carrion Moth"
  if (kind === "crypt-mimic") return "Crypt Mimic"
  if (kind === "grave-root-boss") return "Grave-root Boss"
  if (kind === "merchant") return "Merchant"
  if (kind === "cartographer") return "Cartographer"
  if (kind === "wound-surgeon") return "Wound Surgeon"
  if (kind === "shrine-keeper") return "Shrine Keeper"
  if (kind === "jailer") return "Jailer"
  return "Necromancer"
}

function ensureEnemyAi(actor: Actor, index: number, floor: number) {
  const fallback = enemyAi(actor.kind, actor.position, index, floor)
  actor.ai ??= fallback
  actor.ai.origin ??= { ...actor.position }
  actor.ai.aggroRadius = Math.max(1, actor.ai.aggroRadius || fallback.aggroRadius)
  actor.ai.leashRadius = Math.max(actor.ai.aggroRadius, actor.ai.leashRadius || actor.ai.aggroRadius + 3)
  actor.ai.direction = actor.ai.direction === -1 ? -1 : 1
  actor.ai.alerted = Boolean(actor.ai.alerted)
  return actor.ai
}

function hasFinalGuardian(session: GameSession) {
  return session.dungeon.actors.some((actor) => actor.id === "final-guardian")
}

function createWorldForSeed(seed: number, finalFloor: number) {
  const anchors = []
  for (let floor = 1; floor <= finalFloor; floor++) {
    anchors.push(...worldAnchorsFromDungeonAnchors(createDungeon(seed, floor).anchors))
  }
  return createInitialWorldConfig(seed, anchors)
}

function completeWorldProgress(session: GameSession, type: WorldEventType, point: Point, message: string) {
  const event = completeFirstMatchingWorldEvent(session.world, type, nearestWorldAnchorId(session, point)) ?? completeFirstMatchingWorldEvent(session.world, type)
  if (!event) return
  session.worldLog.push(
    createWorldLogEntry(session.world.worldId, session.turn, {
      type: "event-completed",
      message,
      eventId: event.id,
      metadata: { eventType: event.type, completed: completedWorldEventCount(session.world) },
    }),
  )
  queueWorldMilestones(session, event)
}

function queueWorldMilestones(session: GameSession, event: WorldEvent) {
  const completed = completedWorldEventCount(session.world)
  while (completed >= session.world.nextMilestoneAt) {
    const milestone = session.world.nextMilestoneAt
    session.world.nextMilestoneAt += 20
    session.pendingWorldGeneration = true
    const message = `AI admin generation queued after ${milestone} completed events.`
    session.log.unshift(message)
    session.worldLog.push(
      createWorldLogEntry(session.world.worldId, session.turn, {
        type: "milestone-queued",
        message,
        eventId: event.id,
        metadata: { milestone, completed },
      }),
    )
  }
}

function completedWorldEventCount(world: WorldConfig) {
  return world.events.filter((event) => event.status === "completed").length
}

function nearestWorldAnchorId(session: GameSession, point: Point) {
  const floorAnchors = session.world.anchors.filter((anchor) => anchor.floor === session.floor)
  if (!floorAnchors.length) return undefined
  return floorAnchors
    .map((anchor) => ({ anchor, distance: manhattan(anchor.position, point) }))
    .sort((left, right) => left.distance - right.distance || left.anchor.roomIndex - right.anchor.roomIndex)[0]?.anchor.id
}

function trimLog(session: GameSession) {
  while (session.log.length > 8) session.log.pop()
}

function revealAroundPlayer(session: GameSession) {
  const nextVisible = new Set<string>()
  const radius = Math.max(4, 10 + Math.floor(session.focus / 2) + session.floorModifier.visionBonus)
  for (let y = session.player.y - radius; y <= session.player.y + radius; y++) {
    for (let x = session.player.x - radius; x <= session.player.x + radius; x++) {
      if (x < 0 || y < 0 || x >= session.dungeon.width || y >= session.dungeon.height) continue
      const point = { x, y }
      if (manhattan(session.player, point) > radius) continue
      if (!hasLineOfSight(session, point)) continue
      const key = pointKey(point)
      nextVisible.add(key)
      session.seen.add(key)
    }
  }
  session.visible = nextVisible
}

function hasLineOfSight(session: GameSession, target: Point) {
  const dx = Math.abs(target.x - session.player.x)
  const dy = Math.abs(target.y - session.player.y)
  const sx = session.player.x < target.x ? 1 : -1
  const sy = session.player.y < target.y ? 1 : -1
  let error = dx - dy
  let x = session.player.x
  let y = session.player.y

  while (x !== target.x || y !== target.y) {
    const doubledError = error * 2
    if (doubledError > -dy) {
      error -= dy
      x += sx
    }
    if (doubledError < dx) {
      error += dx
      y += sy
    }
    if (x === target.x && y === target.y) return true
    if (tileAt(session.dungeon, { x, y }) === "wall") return false
  }

  return true
}

export function pointKey(point: Point) {
  return `${point.x},${point.y}`
}
