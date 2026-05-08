import { createDungeon, enemyAi, setTile, tileAt, type Actor, type Dungeon, type EnemyAi, type Point } from "./dungeon.js"
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
export type HeroClass = "warden" | "arcanist" | "ranger"

export type Hero = {
  name: string
  classId: HeroClass
  title: string
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

export type CombatState = {
  active: boolean
  actorIds: string[]
  selectedTarget: number
  selectedSkill: number
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

export type GameSession = {
  mode: MultiplayerMode
  hero: Hero
  stats: HeroStats
  seed: number
  floor: number
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
  statusEffects: StatusEffect[]
  world: WorldConfig
  worldLog: WorldLogEntry[]
  pendingWorldGeneration: boolean
}

const heroTitles: Record<HeroClass, string> = {
  warden: "Warden of Stone",
  arcanist: "Arcanist of Ash",
  ranger: "Ranger of Hollow Paths",
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

export function createSession(seed = 2423368, mode: MultiplayerMode = "solo", classId: HeroClass = "ranger"): GameSession {
  const dungeon = createDungeon(seed, 1)
  const stats = statsForClass(classId)
  const maxHp = derivedMaxHp(stats)
  const maxFocus = derivedMaxFocus(stats)
  const finalFloor = 5
  const world = createWorldForSeed(seed, finalFloor)
  const session: GameSession = {
    mode,
    hero: {
      name: "Mira",
      classId,
      title: heroTitles[classId],
    },
    stats,
    seed,
    floor: 1,
    player: { ...dungeon.playerStart },
    hp: maxHp,
    maxHp,
    focus: maxFocus,
    maxFocus,
    dungeon,
    log: ["Dev jokes hide in loot."],
    inventory: ["Rusty blade", "Dew vial"],
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
      message: "",
    },
    skillCheck: null,
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

  const next = { x: session.player.x + dx, y: session.player.y + dy }
  const actor = actorAt(session.dungeon.actors, next)

  if (actor) {
    startCombat(session, [actor])
    return
  }

  const tile = tileAt(session.dungeon, next)
  if (tile === "wall" || tile === "void") {
    session.log.unshift("Cold stone blocks the way.")
    trimLog(session)
    return
  }

  session.player = next

  if (tile === "stairs") {
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
  session.focus = Math.min(session.maxFocus, session.focus + 1)
  session.log.unshift("You steady your breath. Focus returns.")
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

export function normalizeSessionAfterLoad(session: GameSession): GameSession {
  session.stats = normalizeStats(session.hero.classId, session.stats)
  session.maxHp = Math.max(derivedMaxHp(session.stats), session.maxHp || 0)
  session.maxFocus = Math.max(derivedMaxFocus(session.stats), session.maxFocus || 0)
  session.hp = clamp(session.hp, 0, session.maxHp)
  session.focus = clamp(session.focus, 0, session.maxFocus)
  session.skillCheck ??= null
  session.combat ??= {
    active: false,
    actorIds: [],
    selectedTarget: 0,
    selectedSkill: 0,
    message: "",
  }
  session.statusEffects = normalizeStatusEffects(session.statusEffects)
  session.world ??= createWorldForSeed(session.seed, session.finalFloor || 5)
  session.worldLog ??= []
  session.pendingWorldGeneration = Boolean(session.pendingWorldGeneration)
  session.dungeon.actors.forEach((actor, index) => ensureEnemyAi(actor, index, session.floor))
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
    target.hp -= damage
    const appliedEffect = applyCombatSkillEffect(session, skill, target)
    const effectText = appliedEffect ? ` ${appliedEffect.label} applied.` : ""
    session.combat.message = `${skill.name} hits ${label(target.kind)} for ${damage}.${effectText}`
    session.log.unshift(`d20 ${d20}${formatSigned(modifier)} vs DC ${dc}: hit.`)
    if (target.hp <= 0) defeatActor(session, target)
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
    .filter((actor, index, list) => list.findIndex((candidate) => candidate.id === actor.id) === index)
    .map((actor) => actor.id)

  if (actorIds.length === 0) return
  session.combat = {
    active: true,
    actorIds,
    selectedTarget: 0,
    selectedSkill: session.combat.selectedSkill,
    lastRoll: session.combat.lastRoll,
    message: "Initiative rolled. Choose target, choose skill, then roll d20.",
  }
  session.log.unshift("Combat starts. The d20 waits.")
  trimLog(session)
}

function endCombat(session: GameSession, message: string) {
  session.combat.active = false
  session.combat.actorIds = []
  session.combat.selectedTarget = 0
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
  completeWorldProgress(session, actor.kind === "necromancer" ? "boss" : "enemy", position, defeatMessage(actor.kind))
}

function defeatMessage(kind: Actor["kind"]) {
  if (kind === "slime") return "Slime dissolved. Cache warmed."
  if (kind === "ghoul") return "Ghoul banished. Ticket closed."
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
    session.inventory.unshift("Rollback scroll")
    session.xp += 2
  } else if (check.source === "relic") {
    session.gold += 14 + session.floor * 2
    session.inventory.unshift("Bound relic")
    session.focus = Math.min(session.maxFocus, session.focus + 3)
    session.xp += 3
  } else {
    session.gold += 5
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

function isSkillCheckSource(tile: string): tile is SkillCheckSource {
  return tile === "potion" || tile === "relic" || tile === "chest"
}

function xpFor(kind: Actor["kind"]) {
  if (kind === "necromancer") return 7
  if (kind === "ghoul") return 4
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
  session.player = { ...session.dungeon.playerStart }
  session.visible = new Set()
  session.seen = new Set()
  session.hp = Math.min(session.maxHp, session.hp + 3)
  session.focus = Math.min(session.maxFocus, session.focus + 2)
  revealAroundPlayer(session)
  completeWorldProgress(session, "biome", session.player, `Reached floor ${session.floor}.`)
  session.log.unshift(`Floor ${session.floor}. Same seed, darker shape.`)
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
  for (const actor of combatTargets(session)) {
    ensureEnemyAi(actor, 0, session.floor).alerted = true
    if (manhattan(actor.position, session.player) === 1) {
      const weakened = statusEffectMagnitude(session, actor.id, "weakened")
      const guarded = statusEffectMagnitude(session, "player", "guarded")
      const damage = Math.max(0, actor.damage - weakened - guarded)
      session.hp -= damage
      const reduction = actor.damage === damage ? "" : ` (${actor.damage - damage} blocked by status)`
      session.log.unshift(`${label(actor.kind)} hits for ${damage}${reduction}.`)
      continue
    }

    const step = chaseStep(session, actor)
    if (step) actor.position = step
  }
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
    const ai = ensureEnemyAi(actor, 0, session.floor)
    const key = pointKey(actor.position)
    return session.visible.has(key) && manhattan(actor.position, session.player) <= Math.max(6, ai.aggroRadius)
  })
}

export function enemyBehaviorText(actor: Actor) {
  const ai = actor.ai
  if (!ai) return "Watching"
  if (ai.alerted) return `Chasing R${ai.aggroRadius}`
  if (ai.pattern === "patrol-horizontal") return `Patrol east/west R${ai.aggroRadius}`
  if (ai.pattern === "patrol-vertical") return `Patrol north/south R${ai.aggroRadius}`
  if (ai.pattern === "stalker") return `Stalker R${ai.aggroRadius}`
  if (ai.pattern === "wander") return `Wander R${ai.aggroRadius}`
  return `Guard R${ai.aggroRadius}`
}

function enemyDefenseBonus(kind: Actor["kind"] | undefined) {
  if (kind === "necromancer") return 4
  if (kind === "ghoul") return 2
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
  const radius = 10 + Math.floor(session.focus / 2)
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
