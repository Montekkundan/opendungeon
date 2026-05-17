import { createDungeon, enemyAi, setTile, tileAt, type Actor, type Dungeon, type EnemyAi, type Point } from "./dungeon.js"
import { isBossActorId, isEnemyActorId, isNpcActorId, type EnemyActorId, type NpcActorId } from "./domainTypes.js"
import { actorLabel as label } from "./glyphs.js"
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
  type WorldQuest,
} from "../world/worldConfig.js"
import { clamp, wrap } from "../shared/numeric.js"
import { normalizeHeroAppearance, type HeroAppearance } from "./appearance.js"
import type { ChallengeCadence } from "./descentSeed.js"
import { defaultFinalFloor } from "./progression.js"
import {
  bossStoryLine,
  collectibleKnowledgeEntry,
  floorKnowledgeEntry,
  floorTacticalPlan,
  initialKnowledgeEntries,
  localNpcStoryDialog,
  openingStoryBranches,
  openingStoryText,
  skillCheckKnowledgeEntry,
  victoryStoryText,
  type StoryKnowledge,
} from "./story.js"

export type MultiplayerMode = "solo" | "coop" | "race"
export const heroClassIds = ["warden", "arcanist", "ranger", "duelist", "cleric", "engineer", "witch", "grave-knight"] as const
export type HeroClass = (typeof heroClassIds)[number]
const tutorialStartingWound = 6
const tutorialGateHalfSpan = 3

export type Hero = {
  name: string
  classId: HeroClass
  title: string
  appearance: HeroAppearance
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
export type CombatAffinity = "physical" | "precision" | "arcane" | "holy" | "shadow" | "luck"
export type StatusEffectId = "guarded" | "weakened" | "burning" | "poisoned"
export type TalentId =
  | "iron-vow"
  | "shield-wall"
  | "ash-channel"
  | "cinder-script"
  | "pathfinder"
  | "hawkeye"
  | "perfect-form"
  | "riposte-chain"
  | "mercy-bell"
  | "sanctuary-bell"
  | "field-rig"
  | "turret-kit"
  | "black-salt"
  | "coven-pact"
  | "grave-oath"
  | "boneguard"
  | "deep-breath"
  | "quick-hands"
  | "hard-lessons"
  | "relic-savant"
  | "boss-breaker"

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
  affinity: CombatAffinity
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
  affinity?: CombatAffinity
  matchup?: "weak" | "resisted" | "neutral"
}

export type CombatRollVariant = "none" | "natural-20" | "natural-1" | "flee-success" | "flee-failed" | "hit" | "miss"

export function combatRollVariant(roll: CombatRoll | null | undefined): CombatRollVariant {
  if (!roll) return "none"
  if (roll.d20 === 20) return "natural-20"
  if (roll.d20 === 1) return "natural-1"
  if (roll.skill === "Flee") return roll.hit ? "flee-success" : "flee-failed"
  return roll.hit ? "hit" : "miss"
}

export function combatRollCue(roll: CombatRoll | null | undefined) {
  const variant = combatRollVariant(roll)
  if (!roll || variant === "none") return "Enter rolls the selected move. F tries to escape."
  if (variant === "natural-20") return `Natural 20: ${roll.skill} lands a critical result against ${roll.target}.`
  if (variant === "natural-1") return `Natural 1: ${roll.skill} fails before modifiers can save it.`
  if (variant === "flee-success") return `Flee succeeds: you slip initiative and the nearest enemies hesitate.`
  if (variant === "flee-failed") return `Flee fails: enemies keep pressure and the round continues.`
  if (variant === "hit") return `${roll.skill} hits ${roll.target}; ${roll.total}/${roll.dc} beats the difficulty.`
  return `${roll.skill} misses ${roll.target}; ${roll.total}/${roll.dc} does not beat the difficulty.`
}

export function statusEffectMarker(id: StatusEffectId) {
  if (id === "guarded") return "[G]"
  if (id === "weakened") return "[W]"
  if (id === "poisoned") return "[P]"
  return "[B]"
}

export function statusEffectCue(effect: Pick<StatusEffect, "id" | "magnitude" | "remainingTurns">) {
  if (effect.id === "guarded") return `${statusEffectMarker(effect.id)} Guarded reduces the next incoming hit by ${effect.magnitude}.`
  if (effect.id === "weakened") return `${statusEffectMarker(effect.id)} Weakened lowers outgoing damage by ${effect.magnitude}.`
  if (effect.id === "poisoned") return `${statusEffectMarker(effect.id)} Poison ticks for ${effect.magnitude} after each round.`
  return `${statusEffectMarker(effect.id)} Burning ticks for ${effect.magnitude} after each round.`
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

export type CombatBalanceSnapshot = {
  target: string
  skill: string
  hitChance: number
  fleeChance: number
  focusPressure: number
  deathRisk: number
  projectedClassWinRate: number
  weaknessNote: string
  focusNote: string
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

export type ConversationOption = {
  id: string
  label: string
  text: string
}

export type ConversationMemory = {
  actorId: string
  kind: NpcActorId
  floor: number
  askedOptionIds: string[]
}

export type ConversationState = {
  id: string
  actorId: string
  kind: NpcActorId
  speaker: string
  text: string
  status: "open" | "completed"
  options: ConversationOption[]
  selectedOption: number
  trade?: MerchantTrade
}

export type LevelUpChoice = {
  id: TalentId
  name: string
  text: string
}

export type LevelUpState = {
  level: number
  choices: LevelUpChoice[]
}

export type KnowledgeEntryKind = "memory" | "note" | "npc" | "tutorial" | "hub" | "monster"

export type KnowledgeEntry = {
  id: string
  title: string
  text: string
  kind: KnowledgeEntryKind
  floor?: number
  discoveredAtTurn: number
}

export type ToastTone = "info" | "success" | "warning" | "danger"

export type RunToast = {
  id: string
  title: string
  text: string
  tone: ToastTone
  turn: number
}

export type TutorialStageId = "movement" | "npc-check" | "combat" | "complete"
export type TutorialActionId = "move" | "move-up" | "move-down" | "move-left" | "move-right" | "inventory" | "quests" | "book" | "npc" | "talent-check" | "combat-start" | "combat-end"
export type TutorialCoopGateHold = {
  stage: Exclude<TutorialStageId, "complete">
  waitingNames: string[]
}

export type RunTutorialState = {
  enabled: boolean
  completed: boolean
  stage: TutorialStageId
  coopGateHold: TutorialCoopGateHold | null
  gatePoints: Point[]
  movementSteps: number
  movedUp: boolean
  movedDown: boolean
  movedLeft: boolean
  movedRight: boolean
  openedInventory: boolean
  openedQuests: boolean
  openedBook: boolean
  talkedToNpc: boolean
  handledTalentCheck: boolean
  combatStarted: boolean
  combatFinished: boolean
  disabledAfterDeath: boolean
  handoffShown: boolean
}

export const hubStationIds = ["quarry", "blacksmith", "kitchen", "storage", "farm", "upgrade-bench"] as const
export type HubStationId = (typeof hubStationIds)[number]
export const villageNpcIds = ["blacksmith", "cook", "farmer", "cartographer", "guildmaster"] as const
export type VillageNpcId = (typeof villageNpcIds)[number]
export const runMutatorIds = ["daily-seed", "hard-mode", "cursed-floors", "class-challenge", "boss-rush"] as const
export type RunMutatorId = (typeof runMutatorIds)[number]
export const villageLocationIds = ["portal", "blacksmith", "market", "farm", "houses", "guildhall"] as const
export type VillageLocationId = (typeof villageLocationIds)[number]
export type VillageCustomerTaste = "relic" | "tool" | "food" | "material" | "memory"
export type FarmPermission = "owner-only" | "friends" | "everyone"
export const villagePermissionAreas = ["houses", "farm", "storage", "shop", "upgrades"] as const
export type VillagePermissionArea = (typeof villagePermissionAreas)[number]
export type VillagePermissionState = Record<VillagePermissionArea, FarmPermission>
export type CutsceneId = "waking-cell" | "first-clear" | "village-unlock" | "ending-rooted" | "ending-remixed"
export const contentPackIds = ["opendungeon", "high-contrast", "mono-terminal"] as const
export type ContentPackId = (typeof contentPackIds)[number]
export const villageSeasonIds = ["spring", "summer", "autumn", "winter"] as const
export type VillageSeasonId = (typeof villageSeasonIds)[number]
export const villageWeatherIds = ["clear", "rain", "fog", "storm", "emberfall"] as const
export type VillageWeatherId = (typeof villageWeatherIds)[number]
export const villageDayPhases = ["morning", "day", "night"] as const
export type VillageDayPhase = (typeof villageDayPhases)[number]
export type VillageFestivalId = "none" | "market-day" | "forge-fair" | "harvest-night" | "final-gate-vigil"
export type EquipmentSlot = "weapon" | "armor" | "relic"
export type EquipmentRarity = "common" | "uncommon" | "rare" | "legendary"

export type EquipmentItem = {
  id: string
  name: string
  slot: EquipmentSlot
  rarity: EquipmentRarity
  bonusDamage: number
  statBonuses: Partial<HeroStats>
  activeText: string
}

export type InventoryActionId = "inspect" | "use" | "equip" | "drop" | "stash" | "sell"

export type InventoryAction = {
  id: InventoryActionId
  key: string
  label: string
  enabled: boolean
  hint: string
}

export type HubStation = {
  id: HubStationId
  name: string
  built: boolean
  level: number
  cost: number
}

export type VillageTrust = {
  id: VillageNpcId
  name: string
  level: number
  xp: number
  questsCompleted: number
}

export type FarmState = {
  plots: number
  planted: number
  ready: number
  sprinklers: number
}

export type VillageHouse = {
  playerId: string
  name: string
  built: boolean
}

export type VillageNpcSchedule = {
  npc: VillageNpcId
  location: VillageLocationId
  phase: VillageDayPhase
  available: boolean
  scene: string
  requiredTrust: number
  text: string
}

export type VillageCustomer = {
  id: string
  name: string
  taste: VillageCustomerTaste
  patience: number
  trustNpc: VillageNpcId
}

export type VillageLocation = {
  id: VillageLocationId
  label: string
  position: Point
  glyph: string
  text: string
}

export type VillageMapState = {
  player: Point
  selectedLocation: VillageLocationId
  selectedPermission: VillagePermissionArea
  schedules: VillageNpcSchedule[]
  customers: VillageCustomer[]
  shopLog: string[]
  market: VillageMarketState
  permissions: VillagePermissionState
  sharedFarm: {
    permissions: FarmPermission
    storage: string[]
  }
}

export type VillageMarketState = {
  selectedItemIndex: number
  askingPrice: number
  reputation: number
  lastDemand: "untested" | "bargain" | "fair" | "expensive" | "walked"
}

export type VillageCalendarState = {
  day: number
  phase: VillageDayPhase
  season: VillageSeasonId
  weather: VillageWeatherId
  festival: VillageFestivalId
  dungeonModifier: string
  note: string
}

export type CutsceneState = {
  id: CutsceneId
  title: string
  lines: string[]
  seen: boolean
}

export type ContentPackState = {
  active: ContentPackId
  available: ContentPackId[]
  preview: string
  lastChangedTurn: number
}

export type BalanceDashboardState = {
  runs: number
  classWinRate: Record<HeroClass, number>
  mutatorDifficulty: Record<RunMutatorId, number>
  averageGold: number
  averageHubCoins: number
  upgradePacing: number
  notes: string[]
}

export type ChallengeMedal = "none" | "bronze" | "silver" | "gold"

export type ChallengeRunMetadata = {
  id: string
  cadence: ChallengeCadence
  seed: number
  classId: HeroClass
  mutators: RunMutatorId[]
  startedAtTurn: number
  replayKey: string
  ghostTrail: ChallengeReplayPoint[]
}

export type ChallengeReplayPoint = {
  turn: number
  floor: number
  x: number
  y: number
  event: string
}

export type ChallengeLeaderboardEntry = ChallengeRunMetadata & {
  name: string
  status: "running" | "dead" | "victory"
  floor: number
  turns: number
  kills: number
  gold: number
  score: number
  medal: ChallengeMedal
}

export type ChallengeReplayGhost = {
  replayKey: string
  name: string
  classId: HeroClass
  cadence: ChallengeCadence
  seed: number
  medal: ChallengeMedal
  score: number
  status: "running" | "dead" | "victory"
  summary: string
  trail: ChallengeReplayPoint[]
}

export type ChallengeBoardState = {
  activeRun: ChallengeRunMetadata | null
  leaderboard: ChallengeLeaderboardEntry[]
  classMedals: Record<HeroClass, ChallengeMedal>
  replayGhosts: ChallengeReplayGhost[]
}

export type VillageShopSale = {
  customer: VillageCustomer
  item: string
  value: number
  askingPrice: number
  fairValue: number
  accepted: boolean
  demand: VillageMarketState["lastDemand"]
  reaction: string
}

export type VillageShopPreview = {
  customer: VillageCustomer
  item: string | null
  category: VillageCustomerTaste | null
  baseValue: number
  askingPrice: number
  fairValue: number
  reputation: number
  demand: VillageMarketState["lastDemand"]
  selectedItemIndex: number
  itemCount: number
}

export type VillageCraftKind = "food" | "tool" | "charm"

export type VillageCraftResult = {
  kind: VillageCraftKind
  item: string
  consumed: string[]
  message: string
}

export type VillagePermissionResult = {
  area: VillagePermissionArea
  permission: FarmPermission
  message: string
}

export type HubState = {
  unlocked: boolean
  coins: number
  lootSold: number
  stations: Record<HubStationId, HubStation>
  trust: Record<VillageNpcId, VillageTrust>
  farm: FarmState
  houses: VillageHouse[]
  helpers: {
    pets: number
    butlers: number
    sellingAssistants: number
  }
  preparedFood: string[]
  unlockedGear: string[]
  activeMutators: RunMutatorId[]
  relationshipLog: string[]
  village: VillageMapState
  calendar: VillageCalendarState
  cutscenes: CutsceneState[]
  lastCutsceneId: CutsceneId | null
  contentPacks: ContentPackState
  balanceDashboard: BalanceDashboardState
  challengeBoard: ChallengeBoardState
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
  talents: TalentId[]
  levelUp: LevelUpState | null
  kills: number
  finalFloor: number
  visible: Set<string>
  seen: Set<string>
  combat: CombatState
  skillCheck: SkillCheckState | null
  conversation: ConversationState | null
  conversationMemory: Record<string, ConversationMemory>
  tutorial: RunTutorialState
  deaths: number
  statusEffects: StatusEffect[]
  world: WorldConfig
  worldLog: WorldLogEntry[]
  pendingWorldGeneration: boolean
  knowledge: KnowledgeEntry[]
  toasts: RunToast[]
  hub: HubState
  equipment: Partial<Record<EquipmentSlot, EquipmentItem>>
}

export type GmPatchOperationInput = {
  path?: unknown
  reason?: unknown
  value?: unknown
}

export type GmPatchApplyResult = {
  applied: number
  message: string
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

const hubStationDefinitions: Record<HubStationId, Omit<HubStation, "built" | "level">> = {
  quarry: { id: "quarry", name: "Quarry", cost: 45 },
  blacksmith: { id: "blacksmith", name: "Blacksmith", cost: 60 },
  kitchen: { id: "kitchen", name: "Kitchen", cost: 35 },
  storage: { id: "storage", name: "Storage", cost: 30 },
  farm: { id: "farm", name: "Farm Plots", cost: 40 },
  "upgrade-bench": { id: "upgrade-bench", name: "Upgrade Bench", cost: 70 },
}

const villageTrustDefinitions: Record<VillageNpcId, string> = {
  blacksmith: "Rook the Blacksmith",
  cook: "Sela the Cook",
  farmer: "Marn the Farmer",
  cartographer: "Venn the Cartographer",
  guildmaster: "Iris the Guildmaster",
}

export const villageLocations: Record<VillageLocationId, VillageLocation> = {
  portal: { id: "portal", label: "Portal Room", position: { x: 9, y: 4 }, glyph: "P", text: "Return point between dungeon runs." },
  blacksmith: { id: "blacksmith", label: "Blacksmith", position: { x: 3, y: 2 }, glyph: "B", text: "Upgrade weapons and trade tool parts for trust." },
  market: { id: "market", label: "Market", position: { x: 14, y: 2 }, glyph: "M", text: "Customers test prices for dungeon loot." },
  farm: { id: "farm", label: "Farm", position: { x: 3, y: 7 }, glyph: "F", text: "Plant, harvest, and manage shared farm permissions." },
  houses: { id: "houses", label: "Player Houses", position: { x: 14, y: 7 }, glyph: "H", text: "Customize co-op houses around the village." },
  guildhall: { id: "guildhall", label: "Guildhall", position: { x: 9, y: 8 }, glyph: "G", text: "NPC quests, trust rewards, and run reports." },
}

const villageCustomerNames = ["Ari", "Nell", "Juno", "Orrin", "Pax", "Lio"] as const
const villageCustomerTastes: VillageCustomerTaste[] = ["relic", "tool", "food", "material", "memory"]

const starterWeapons: Record<HeroClass, string> = {
  warden: "Warden axe",
  arcanist: "Ash focus",
  ranger: "Rusty blade",
  duelist: "Needle rapier",
  cleric: "Bell mace",
  engineer: "Gear spanner",
  witch: "Salt knife",
  "grave-knight": "Grave blade",
}

type TalentDefinition = {
  id: TalentId
  classId?: HeroClass
  name: string
  text: string
  statBonuses?: Partial<HeroStats>
  skillId?: CombatSkillId
  damageBonus?: number
  focusDiscount?: number
  restFocusBonus?: number
}

export type TalentSummary = {
  id: TalentId
  name: string
  text: string
  effect: string
}

const talentDefinitions: Record<TalentId, TalentDefinition> = {
  "iron-vow": {
    id: "iron-vow",
    classId: "warden",
    name: "Iron Vow",
    text: "Strike and Smite hit 1 harder, and Endurance rises.",
    statBonuses: { endurance: 1 },
    skillId: "strike",
    damageBonus: 1,
  },
  "shield-wall": {
    id: "shield-wall",
    classId: "warden",
    name: "Shield Wall",
    text: "Late warden branch: Smite hits harder, and Endurance and Vigor rise.",
    statBonuses: { endurance: 1, vigor: 1 },
    skillId: "smite",
    damageBonus: 2,
  },
  "ash-channel": {
    id: "ash-channel",
    classId: "arcanist",
    name: "Ash Channel",
    text: "Arcane Burst costs 1 less focus, and Intelligence rises.",
    statBonuses: { intelligence: 1 },
    skillId: "arcane-burst",
    focusDiscount: 1,
  },
  "cinder-script": {
    id: "cinder-script",
    classId: "arcanist",
    name: "Cinder Script",
    text: "Late arcanist branch: Arcane Burst hits harder and Intelligence rises.",
    statBonuses: { intelligence: 2 },
    skillId: "arcane-burst",
    damageBonus: 2,
  },
  pathfinder: {
    id: "pathfinder",
    classId: "ranger",
    name: "Pathfinder",
    text: "Aimed Shot hits 1 harder, and Dexterity rises.",
    statBonuses: { dexterity: 1 },
    skillId: "aimed-shot",
    damageBonus: 1,
  },
  hawkeye: {
    id: "hawkeye",
    classId: "ranger",
    name: "Hawkeye",
    text: "Late ranger branch: Aimed Shot costs less focus and hits harder.",
    statBonuses: { dexterity: 1, luck: 1 },
    skillId: "aimed-shot",
    damageBonus: 1,
    focusDiscount: 1,
  },
  "perfect-form": {
    id: "perfect-form",
    classId: "duelist",
    name: "Perfect Form",
    text: "Lucky Riposte costs 1 less focus, and Luck rises.",
    statBonuses: { luck: 1 },
    skillId: "lucky-riposte",
    focusDiscount: 1,
  },
  "riposte-chain": {
    id: "riposte-chain",
    classId: "duelist",
    name: "Riposte Chain",
    text: "Late duelist branch: Lucky Riposte hits harder and Luck rises.",
    statBonuses: { luck: 2 },
    skillId: "lucky-riposte",
    damageBonus: 2,
  },
  "mercy-bell": {
    id: "mercy-bell",
    classId: "cleric",
    name: "Mercy Bell",
    text: "Smite hits 1 harder, and Faith rises.",
    statBonuses: { faith: 1 },
    skillId: "smite",
    damageBonus: 1,
  },
  "sanctuary-bell": {
    id: "sanctuary-bell",
    classId: "cleric",
    name: "Sanctuary Bell",
    text: "Late cleric branch: Smite costs less focus and Faith rises.",
    statBonuses: { faith: 2 },
    skillId: "smite",
    focusDiscount: 1,
  },
  "field-rig": {
    id: "field-rig",
    classId: "engineer",
    name: "Field Rig",
    text: "Strike costs nothing and hits 1 harder, and Intelligence rises.",
    statBonuses: { intelligence: 1 },
    skillId: "strike",
    damageBonus: 1,
  },
  "turret-kit": {
    id: "turret-kit",
    classId: "engineer",
    name: "Turret Kit",
    text: "Late engineer branch: Strike hits harder, and Intelligence and Endurance rise.",
    statBonuses: { intelligence: 1, endurance: 1 },
    skillId: "strike",
    damageBonus: 2,
  },
  "black-salt": {
    id: "black-salt",
    classId: "witch",
    name: "Black Salt",
    text: "Shadow Hex costs 1 less focus, and Mind rises.",
    statBonuses: { mind: 1 },
    skillId: "shadow-hex",
    focusDiscount: 1,
  },
  "coven-pact": {
    id: "coven-pact",
    classId: "witch",
    name: "Coven Pact",
    text: "Late witch branch: Shadow Hex hits harder, and Mind and Luck rise.",
    statBonuses: { mind: 1, luck: 1 },
    skillId: "shadow-hex",
    damageBonus: 2,
  },
  "grave-oath": {
    id: "grave-oath",
    classId: "grave-knight",
    name: "Grave Oath",
    text: "Strike hits 1 harder, and Vigor rises.",
    statBonuses: { vigor: 1 },
    skillId: "strike",
    damageBonus: 1,
  },
  boneguard: {
    id: "boneguard",
    classId: "grave-knight",
    name: "Boneguard",
    text: "Late grave-knight branch: Strike hits harder, and Vigor and Faith rise.",
    statBonuses: { vigor: 1, faith: 1 },
    skillId: "strike",
    damageBonus: 2,
  },
  "deep-breath": {
    id: "deep-breath",
    name: "Deep Breath",
    text: "Rest restores 1 extra focus, and Mind rises.",
    statBonuses: { mind: 1 },
    restFocusBonus: 1,
  },
  "quick-hands": {
    id: "quick-hands",
    name: "Quick Hands",
    text: "Dexterity and Luck rise for attacks, checks, and fleeing.",
    statBonuses: { dexterity: 1, luck: 1 },
  },
  "hard-lessons": {
    id: "hard-lessons",
    name: "Hard Lessons",
    text: "Vigor and Endurance rise for a safer late floor.",
    statBonuses: { vigor: 1, endurance: 1 },
  },
  "relic-savant": {
    id: "relic-savant",
    name: "Relic Savant",
    text: "Mid branch: Mind and Intelligence rise for relic checks and costly skills.",
    statBonuses: { mind: 1, intelligence: 1 },
  },
  "boss-breaker": {
    id: "boss-breaker",
    name: "Boss Breaker",
    text: "Late branch: core attacks hit bosses harder through extra Strike damage.",
    statBonuses: { vigor: 1 },
    skillId: "strike",
    damageBonus: 2,
  },
}

const classTalentIds: Record<HeroClass, TalentId> = {
  warden: "iron-vow",
  arcanist: "ash-channel",
  ranger: "pathfinder",
  duelist: "perfect-form",
  cleric: "mercy-bell",
  engineer: "field-rig",
  witch: "black-salt",
  "grave-knight": "grave-oath",
}

const classAdvancedTalentIds: Record<HeroClass, TalentId> = {
  warden: "shield-wall",
  arcanist: "cinder-script",
  ranger: "hawkeye",
  duelist: "riposte-chain",
  cleric: "sanctuary-bell",
  engineer: "turret-kit",
  witch: "coven-pact",
  "grave-knight": "boneguard",
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

export function createHubState(mode: MultiplayerMode = "solo", heroName = "Mira"): HubState {
  return {
    unlocked: false,
    coins: 0,
    lootSold: 0,
    stations: Object.fromEntries(
      hubStationIds.map((id) => {
        const station = hubStationDefinitions[id]
        return [id, { ...station, built: false, level: 0 }]
      }),
    ) as Record<HubStationId, HubStation>,
    trust: Object.fromEntries(
      villageNpcIds.map((id) => [
        id,
        {
          id,
          name: villageTrustDefinitions[id],
          level: 0,
          xp: 0,
          questsCompleted: 0,
        },
      ]),
    ) as Record<VillageNpcId, VillageTrust>,
    farm: { plots: mode === "coop" ? 4 : 2, planted: 0, ready: 0, sprinklers: 0 },
    houses: createVillageHouses(mode, heroName),
    helpers: { pets: 0, butlers: 0, sellingAssistants: 0 },
    preparedFood: [],
    unlockedGear: [],
    activeMutators: [],
    relationshipLog: [],
    village: createVillageMapState(mode),
    calendar: createVillageCalendarState(1, 0),
    cutscenes: createCutscenes(heroName),
    lastCutsceneId: null,
    contentPacks: createContentPackState(),
    balanceDashboard: createBalanceDashboardState(),
    challengeBoard: createChallengeBoardState(),
  }
}

export function createStartingEquipment(classId: HeroClass): Partial<Record<EquipmentSlot, EquipmentItem>> {
  return {
    weapon: {
      id: `starter-${classId}`,
      name: starterWeapons[classId],
      slot: "weapon",
      rarity: "common",
      bonusDamage: 0,
      statBonuses: {},
      activeText: "A familiar weapon from the first waking cell.",
    },
  }
}

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

export function rememberKnowledge(session: GameSession, entry: StoryKnowledge | Omit<KnowledgeEntry, "discoveredAtTurn">) {
  session.knowledge ??= []
  const normalized = normalizeKnowledgeEntry({ ...entry, discoveredAtTurn: session.turn })
  if (!normalized) return null
  const existing = session.knowledge.find((candidate) => candidate.id === normalized.id)
  if (existing) {
    const discoveredAtTurn = existing.discoveredAtTurn
    Object.assign(existing, normalized, { discoveredAtTurn })
    return existing
  }
  session.knowledge.unshift(normalized)
  while (session.knowledge.length > 80) session.knowledge.pop()
  return normalized
}

export function addToast(session: GameSession, title: string, text: string, tone: ToastTone = "info") {
  session.toasts ??= []
  const toast: RunToast = {
    id: `${session.turn}-${session.toasts.length}-${slug(title)}`,
    title: cleanToastText(title, 32),
    text: cleanToastText(text, 96),
    tone,
    turn: session.turn,
  }
  session.toasts.unshift(toast)
  while (session.toasts.length > 6) session.toasts.pop()
  return toast
}

export function unlockHub(session: GameSession, reason = "The first clear opens the road home.") {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (session.hub.unlocked) return false
  session.hub.unlocked = true
  session.hub.coins += Math.max(25, Math.floor(session.gold / 2))
  session.hub.relationshipLog.unshift(reason)
  rememberKnowledge(session, {
    id: "hub-unlocked",
    title: "Portal Room Opened",
    text: "The first dungeon clear opens a personal portal room and a village route. Loot can now become stations, food, trust, houses, and stronger next-run gear.",
    kind: "hub",
    floor: session.floor,
  })
  addToast(session, "Hub unlocked", "Portal room, village route, and build stations are now available.", "success")
  playLocalCutscene(session, "village-unlock")
  trimHubLog(session.hub)
  return true
}

export function sellLootToVillage(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const sellable = session.inventory.filter((item) => sellValue(item) > 0)
  const helperBonus = session.hub.helpers.sellingAssistants * 2 + session.hub.helpers.pets
  const total = sellable.reduce((sum, item) => sum + sellValue(item), 0) + helperBonus
  if (total <= 0) {
    pushSessionMessage(session, "No village-ready loot to sell.")
    addToast(session, "Sale skipped", "No sellable loot is in the pack.", "warning")
    return 0
  }

  session.inventory = session.inventory.filter((item) => sellValue(item) <= 0)
  session.hub.coins += total
  session.hub.lootSold += sellable.length
  gainNpcTrust(session, "guildmaster", Math.max(1, Math.floor(sellable.length / 2)), false)
  pushSessionMessage(session, `Village sale earned ${total} coins from ${sellable.length} item${sellable.length === 1 ? "" : "s"}.`)
  addToast(session, "Loot sold", `${total} village coins added for upgrades.`, "success")
  return total
}

export function buildHubStation(session: GameSession, id: HubStationId) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (!session.hub.unlocked) unlockHub(session, "A deed opens the portal-room foundation early.")
  const station = session.hub.stations[id]
  if (!station) return false
  const cost = station.built ? station.cost + station.level * 25 : station.cost
  if (session.hub.coins < cost) {
    pushSessionMessage(session, `${station.name} needs ${cost} village coins.`)
    addToast(session, "Build blocked", `${station.name} needs ${cost} coins.`, "warning")
    return false
  }

  session.hub.coins -= cost
  station.built = true
  station.level += 1
  applyStationUnlock(session, id)
  pushSessionMessage(session, `${station.name} level ${station.level} is ready in the hub.`)
  addToast(session, "Station built", `${station.name} level ${station.level}.`, "success")
  return true
}

export function prepareFood(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const kitchen = session.hub.stations.kitchen
  if (!kitchen.built) {
    pushSessionMessage(session, "Build the kitchen before preparing food.")
    addToast(session, "Kitchen missing", "Prepared food needs the kitchen station.", "warning")
    return null
  }
  const cost = Math.max(5, 12 - kitchen.level * 2)
  if (session.hub.coins < cost) {
    pushSessionMessage(session, `Travel rations need ${cost} village coins.`)
    return null
  }
  const food = kitchen.level >= 2 ? "Focus broth" : "Travel rations"
  session.hub.coins -= cost
  session.hub.preparedFood.unshift(food)
  session.inventory.unshift(food)
  session.maxFocus += food === "Focus broth" ? 1 : 0
  gainNpcTrust(session, "cook", 2, false)
  pushSessionMessage(session, `${food} prepared for the next descent.`)
  addToast(session, "Food prepared", `${food} added to the pack.`, "success")
  return food
}

export function craftVillageRecipe(session: GameSession): VillageCraftResult | null {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (!session.hub.unlocked) {
    pushSessionMessage(session, "The village must be unlocked before crafting recipes.")
    return null
  }
  const recipe = nextVillageCraftRecipe(session)
  if (!recipe) {
    pushSessionMessage(session, "No ready recipe. Bring tool parts, relics, crops, or build the kitchen/upgrade bench.")
    addToast(session, "Crafting waiting", "Recipes need station access and ingredients.", "warning")
    return null
  }
  if (session.hub.coins < recipe.cost) {
    pushSessionMessage(session, `${recipe.item} needs ${recipe.cost} village coins.`)
    return null
  }
  session.hub.coins -= recipe.cost
  const consumed = consumeCraftIngredients(session, recipe)
  session.inventory.unshift(recipe.item)
  if (recipe.kind === "food") session.hub.preparedFood.unshift(recipe.item)
  if (recipe.kind === "charm") session.hub.unlockedGear.unshift(recipe.item)
  gainNpcTrust(session, recipe.trustNpc, recipe.trust, false)
  const message = `${recipe.item} crafted from ${consumed.join(", ") || "village stock"}.`
  pushSessionMessage(session, message)
  rememberKnowledge(session, {
    id: `craft-${slug(recipe.item)}`,
    title: `${recipe.item} Recipe`,
    text: `${recipe.item} is a ${recipe.kind} craft. Ingredients: ${consumed.join(", ") || "village stock"}. It carries into the next descent through the village preparation loop.`,
    kind: "hub",
    floor: session.floor,
  })
  addToast(session, "Recipe crafted", message, "success")
  return { kind: recipe.kind, item: recipe.item, consumed, message }
}

type VillageCraftRecipe = {
  kind: VillageCraftKind
  item: string
  cost: number
  trustNpc: VillageNpcId
  trust: number
  consumeItem?: RegExp
  consumeCrop?: boolean
}

function nextVillageCraftRecipe(session: GameSession): VillageCraftRecipe | null {
  if (session.hub.stations["upgrade-bench"].built && findInventoryIndex(session, /tool|lockpick|scrap|bundle/i) >= 0) {
    return { kind: "tool", item: "Gate bomb", cost: 8, trustNpc: "blacksmith", trust: 2, consumeItem: /tool|lockpick|scrap|bundle/i }
  }
  if (session.hub.stations.kitchen.built && findInventoryIndex(session, /keepsake|relic|shard/i) >= 0 && session.hub.trust.cook.level >= 1) {
    return { kind: "charm", item: "Hearth charm", cost: 10, trustNpc: "cook", trust: 2, consumeItem: /keepsake|relic|shard/i }
  }
  if (session.hub.stations.kitchen.built && (session.hub.farm.ready > 0 || session.inventory.some((item) => /recipe/i.test(item)))) {
    return { kind: "food", item: session.hub.stations.kitchen.level >= 2 ? "Focus broth" : "Travel rations", cost: 5, trustNpc: "farmer", trust: 1, consumeCrop: session.hub.farm.ready > 0 }
  }
  return null
}

function consumeCraftIngredients(session: GameSession, recipe: VillageCraftRecipe) {
  const consumed: string[] = []
  if (recipe.consumeCrop && session.hub.farm.ready > 0) {
    session.hub.farm.ready -= 1
    consumed.push("village crop")
  }
  if (recipe.consumeItem) {
    const index = findInventoryIndex(session, recipe.consumeItem)
    if (index >= 0) {
      const [item] = session.inventory.splice(index, 1)
      consumed.push(item)
    }
  }
  return consumed
}

function findInventoryIndex(session: GameSession, pattern: RegExp) {
  return session.inventory.findIndex((item) => pattern.test(item))
}

export function upgradeWeapon(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const blacksmith = session.hub.stations.blacksmith
  if (!blacksmith.built) {
    pushSessionMessage(session, "Build the blacksmith before upgrading weapons.")
    addToast(session, "Blacksmith missing", "Weapon upgrades need the blacksmith.", "warning")
    return null
  }
  const current = normalizeEquipmentItem(session.equipment.weapon, session.hero.classId, "weapon") ?? createStartingEquipment(session.hero.classId).weapon!
  const nextLevel = current.bonusDamage + 1
  const cost = 18 + nextLevel * 14 - Math.min(8, session.hub.trust.blacksmith.level * 2)
  if (session.hub.coins < cost) {
    pushSessionMessage(session, `Weapon upgrade needs ${cost} village coins.`)
    return null
  }
  const rarity: EquipmentRarity = nextLevel >= 5 ? "legendary" : nextLevel >= 3 ? "rare" : nextLevel >= 1 ? "uncommon" : "common"
  const upgraded: EquipmentItem = {
    ...current,
    id: `${current.id}-plus-${nextLevel}`,
    name: `${starterWeapons[session.hero.classId]} +${nextLevel}`,
    rarity,
    bonusDamage: nextLevel,
    statBonuses: { strength: Math.floor(nextLevel / 2) },
    activeText: nextLevel >= 3 ? "Active: once per run this can anchor a safer boss opening." : "A sharpened weapon that changes the run damage curve.",
  }
  session.hub.coins -= cost
  session.equipment.weapon = upgraded
  session.hub.unlockedGear.unshift(upgraded.name)
  gainNpcTrust(session, "blacksmith", 3, false)
  pushSessionMessage(session, `${upgraded.name} forged.`)
  addToast(session, "Weapon upgraded", `${upgraded.name}: +${nextLevel} damage.`, "success")
  return upgraded
}

export function plantCrop(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const farm = session.hub.stations.farm
  if (!farm.built) {
    pushSessionMessage(session, "Build farm plots before planting.")
    return false
  }
  const openPlots = Math.max(0, session.hub.farm.plots - session.hub.farm.planted - session.hub.farm.ready)
  if (openPlots <= 0) {
    pushSessionMessage(session, "No open farm plots.")
    return false
  }
  session.hub.farm.planted += 1
  session.hub.coins = Math.max(0, session.hub.coins - 3)
  gainNpcTrust(session, "farmer", 1, false)
  pushSessionMessage(session, "A village crop is planted for a later sale or meal.")
  addToast(session, "Crop planted", "Farm progress will feed selling and kitchen loops.", "info")
  return true
}

export function harvestFarm(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const grown = session.hub.farm.planted + session.hub.farm.sprinklers
  if (grown <= 0 && session.hub.farm.ready <= 0) {
    pushSessionMessage(session, "No crops are ready.")
    return 0
  }
  session.hub.farm.ready += grown
  session.hub.farm.planted = 0
  const value = session.hub.farm.ready * (7 + session.hub.stations.farm.level)
  session.hub.farm.ready = 0
  session.hub.coins += value
  gainNpcTrust(session, "farmer", Math.max(1, Math.floor(value / 12)), false)
  pushSessionMessage(session, `Farm harvest sold for ${value} coins.`)
  addToast(session, "Harvest sold", `${value} village coins earned.`, "success")
  return value
}

export function completeVillageQuest(session: GameSession, npc: VillageNpcId = "guildmaster") {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const trust = gainNpcTrust(session, npc, 6, true)
  session.hub.coins += 10 + trust.level * 3
  pushSessionMessage(session, `${trust.name} trust is now level ${trust.level}.`)
  addToast(session, "Trust gained", `${trust.name} trust level ${trust.level}.`, "success")
  return trust
}

export function toggleRunMutator(session: GameSession, id: RunMutatorId) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const active = new Set(session.hub.activeMutators)
  if (active.has(id)) active.delete(id)
  else active.add(id)
  session.hub.activeMutators = runMutatorIds.filter((candidate) => active.has(candidate))
  pushSessionMessage(session, `${runMutatorLabel(id)} ${active.has(id) ? "enabled" : "disabled"}.`)
  addToast(session, "Run mutator", `${runMutatorLabel(id)} ${active.has(id) ? "enabled" : "disabled"}.`, "info")
  applyMutatorPressure(session)
  return active.has(id)
}

export function challengeMutatorsFor(seed: number, cadence: ChallengeCadence): RunMutatorId[] {
  const pool: RunMutatorId[] = ["hard-mode", "cursed-floors", "class-challenge", "boss-rush"]
  const first = pool[Math.abs(seed) % pool.length] ?? "hard-mode"
  if (cadence === "daily") return ["daily-seed", first]
  const second = pool[Math.abs(Math.floor(seed / 7) + 2) % pool.length] ?? "cursed-floors"
  const mutators: RunMutatorId[] = ["daily-seed", first, second]
  return mutators.filter((id, index, list) => list.indexOf(id) === index)
}

export function applyChallengeRun(session: GameSession, cadence: ChallengeCadence) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const mutators = challengeMutatorsFor(session.seed, cadence)
  const active = new Set(session.hub.activeMutators)
  for (const mutator of mutators) active.add(mutator)
  session.hub.activeMutators = runMutatorIds.filter((candidate) => active.has(candidate))
  const id = `${cadence}-${session.seed}`
  const replayKey = `${id}-${session.hero.classId}-${session.mode}`
  session.hub.challengeBoard.activeRun = {
    id,
    cadence,
    seed: session.seed,
    classId: session.hero.classId,
    mutators,
    startedAtTurn: session.turn,
    replayKey,
    ghostTrail: [challengeReplayPoint(session, "start")],
  }
  applyMutatorPressure(session)
  applyStrategicDescentPressure(session)
  rememberKnowledge(session, {
    id: `challenge-${id}`,
    title: `${cadence === "weekly" ? "Weekly" : "Daily"} Challenge`,
    text: `Fixed seed ${session.seed}. Mutators: ${mutators.map(runMutatorLabel).join(", ")}. Replay key ${replayKey}. Results are stored locally in the village leaderboard.`,
    kind: "hub",
    floor: session.floor,
  })
  addToast(session, "Challenge run", `${cadence} seed ${session.seed} with ${mutators.length} mutators.`, "warning")
  pushSessionMessage(session, `${cadence} challenge started. Replay key ${replayKey}.`)
  return session.hub.challengeBoard.activeRun
}

export function recordChallengeResult(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const active = session.hub.challengeBoard.activeRun
  if (!active) return null
  recordChallengeTrail(session, "finish")
  const score = challengeScore(session, active)
  const entry: ChallengeLeaderboardEntry = {
    ...active,
    name: session.hero.name,
    status: session.status,
    floor: session.floor,
    turns: session.turn,
    kills: session.kills,
    gold: session.gold,
    score,
    medal: challengeMedal(score),
  }
  const existingIndex = session.hub.challengeBoard.leaderboard.findIndex((candidate) => candidate.replayKey === entry.replayKey && candidate.name === entry.name)
  if (existingIndex >= 0) session.hub.challengeBoard.leaderboard.splice(existingIndex, 1, entry)
  else session.hub.challengeBoard.leaderboard.unshift(entry)
  session.hub.challengeBoard.leaderboard = session.hub.challengeBoard.leaderboard.sort((left, right) => right.score - left.score || left.turns - right.turns).slice(0, 12)
  session.hub.challengeBoard.classMedals[entry.classId] = betterChallengeMedal(session.hub.challengeBoard.classMedals[entry.classId], entry.medal)
  const ghost = challengeReplayGhostFor(entry)
  const ghostIndex = session.hub.challengeBoard.replayGhosts.findIndex((candidate) => candidate.replayKey === ghost.replayKey && candidate.name === ghost.name)
  if (ghostIndex >= 0) session.hub.challengeBoard.replayGhosts.splice(ghostIndex, 1, ghost)
  else session.hub.challengeBoard.replayGhosts.unshift(ghost)
  session.hub.challengeBoard.replayGhosts = session.hub.challengeBoard.replayGhosts.slice(0, 12)
  session.hub.relationshipLog.unshift(`${entry.cadence} challenge ${entry.medal} medal: ${entry.score} score.`)
  trimHubLog(session.hub)
  addToast(session, "Challenge recorded", `${entry.medal} medal, score ${entry.score}. Ghost saved.`, entry.medal === "gold" ? "success" : "info")
  session.hub.challengeBoard.activeRun = null
  return entry
}

function recordChallengeTrail(session: GameSession, event: string) {
  const active = session.hub.challengeBoard.activeRun
  if (!active) return
  const point = challengeReplayPoint(session, event)
  const previous = active.ghostTrail.at(-1)
  if (previous && previous.turn === point.turn && previous.floor === point.floor && previous.x === point.x && previous.y === point.y && previous.event === point.event) return
  active.ghostTrail.push(point)
  if (active.ghostTrail.length > 48) active.ghostTrail = [active.ghostTrail[0]!, ...active.ghostTrail.slice(-47)]
}

function challengeReplayPoint(session: GameSession, event: string): ChallengeReplayPoint {
  return {
    turn: Math.max(0, Math.floor(session.turn)),
    floor: Math.max(1, Math.floor(session.floor)),
    x: clamp(Math.floor(session.player.x), 1, 999),
    y: clamp(Math.floor(session.player.y), 1, 999),
    event: cleanId(event || "move"),
  }
}

function challengeReplayGhostFor(entry: ChallengeLeaderboardEntry): ChallengeReplayGhost {
  const start = entry.ghostTrail[0]
  const end = entry.ghostTrail.at(-1)
  const path = start && end ? `F${start.floor}:${start.x},${start.y}->F${end.floor}:${end.x},${end.y}` : `F${entry.floor}`
  return {
    replayKey: entry.replayKey,
    name: entry.name,
    classId: entry.classId,
    cadence: entry.cadence,
    seed: entry.seed,
    medal: entry.medal,
    score: entry.score,
    status: entry.status,
    summary: `${entry.name} ${entry.classId} ${entry.medal} ${entry.score} ${path}`,
    trail: entry.ghostTrail.slice(0, 48),
  }
}

function betterChallengeMedal(current: ChallengeMedal | undefined, next: ChallengeMedal): ChallengeMedal {
  return challengeMedalRank(next) > challengeMedalRank(current ?? "none") ? next : (current ?? "none")
}

function challengeMedalRank(medal: ChallengeMedal) {
  if (medal === "gold") return 3
  if (medal === "silver") return 2
  if (medal === "bronze") return 1
  return 0
}

function challengeScore(session: GameSession, active: ChallengeRunMetadata) {
  const clearBonus = session.status === "victory" ? 1_000 : 0
  const survival = session.floor * 250 + session.kills * 35 + session.gold * 3
  const mutatorBonus = active.mutators.length * 120
  const turnPenalty = Math.min(500, session.turn * 2)
  return Math.max(0, clearBonus + survival + mutatorBonus - turnPenalty)
}

function challengeMedal(score: number): ChallengeMedal {
  if (score >= 1_700) return "gold"
  if (score >= 1_100) return "silver"
  if (score >= 650) return "bronze"
  return "none"
}

export function refreshVillageSchedules(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  refreshVillageCalendar(session)
  const phase = session.hub.calendar.phase
  const routes: Record<VillageNpcId, Record<VillageDayPhase, { location: VillageLocationId; scene: string; trustGate?: number; bossScene?: string }>> = {
    blacksmith: {
      morning: { location: "blacksmith", scene: "sets the forge for weapon repairs" },
      day: { location: "market", scene: "prices tool parts for the next descent" },
      night: { location: "houses", scene: "opens a private armor ledger", trustGate: 1 },
    },
    cook: {
      morning: { location: "market", scene: "buys herbs and ration scraps" },
      day: { location: "farm", scene: "tests meal prep with fresh crops" },
      night: { location: "houses", scene: "shares kitchen rumors over stew", trustGate: 1 },
    },
    farmer: {
      morning: { location: "farm", scene: "checks crop rows and sprinkler lines" },
      day: { location: "market", scene: "trades harvest stock for dungeon loot" },
      night: { location: "houses", scene: "offers seed planning at the porch", trustGate: 1 },
    },
    cartographer: {
      morning: { location: "portal", scene: "measures portal drift before sunrise", bossScene: "charts {memory} echoes near the portal" },
      day: { location: "guildhall", scene: "compares route notes with the guild", bossScene: "marks aftermath paths from {memory}" },
      night: { location: "houses", scene: "shares hidden-room maps indoors", trustGate: 1, bossScene: "guards {memory} route notes after dark" },
    },
    guildmaster: {
      morning: { location: "guildhall", scene: "posts new contracts and gate rules", bossScene: "posts reports about {memory}" },
      day: { location: "portal", scene: "audits final-gate clues with patrols", bossScene: "briefs scouts after {memory}" },
      night: { location: "houses", scene: "reviews private trust ledgers", trustGate: 2, bossScene: "hosts a late council about {memory}" },
    },
  }
  const trustedScenes: Partial<Record<VillageNpcId, string>> = {
    blacksmith: "offers a relationship scene about rebuilding the broken hut",
    cook: "shares a relationship scene about food before hard descents",
    farmer: "talks through a relationship scene about village recovery",
    cartographer: "shows a relationship scene about routes nobody else sees",
    guildmaster: "opens a relationship scene about why the final gate matters",
  }
  const bossMemory = villageBossMemory(session)
  session.hub.village.schedules = villageNpcIds.map((npc) => {
    const route = routes[npc][phase]
    const trust = session.hub.trust[npc]
    const requiredTrust = route.trustGate ?? 0
    const available = session.hub.unlocked && trust.level >= requiredTrust
    const place = villageLocations[route.location].label
    const baseScene = bossMemory && route.bossScene ? route.bossScene.replace("{memory}", bossMemory) : trust.level >= 2 ? trustedScenes[npc] ?? route.scene : route.scene
    const phaseLabel = villageDayPhaseLabel(phase)
    return {
      npc,
      location: route.location,
      phase,
      available,
      scene: baseScene,
      requiredTrust,
      text: available ? `${phaseLabel}: ${trust.name} ${baseScene} at ${place}.` : `${phaseLabel}: ${trust.name}'s ${place} scene needs trust ${requiredTrust}.`,
    }
  })
  return session.hub.village.schedules
}

export function refreshVillageCalendar(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  session.hub.calendar = createVillageCalendarState(session.seed, session.turn)
  return session.hub.calendar
}

export function moveVillagePlayer(session: GameSession, dx: number, dy: number) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (!session.hub.unlocked) {
    pushSessionMessage(session, "The village road is still locked.")
    return session.hub.village.selectedLocation
  }
  const player = session.hub.village.player
  player.x = clamp(player.x + dx, 1, 17)
  player.y = clamp(player.y + dy, 1, 8)
  session.hub.village.selectedLocation = nearestVillageLocation(player)
  refreshVillageSchedules(session)
  session.turn += 1
  pushSessionMessage(session, `${villageLocations[session.hub.village.selectedLocation].label} is closest on the village road.`)
  return session.hub.village.selectedLocation
}

export function visitVillageLocation(session: GameSession, id: VillageLocationId = session.hub.village.selectedLocation) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (!session.hub.unlocked) {
    pushSessionMessage(session, "The portal room needs a deed or clear before the village opens.")
    return "locked"
  }
  session.hub.village.selectedLocation = id
  refreshVillageSchedules(session)
  if (id === "market") {
    const sale = runVillageShopSale(session)
    return sale ? sale.reaction : session.log[0] ?? "No market sale."
  }
  if (id === "blacksmith") {
    if (!session.hub.stations.blacksmith.built) buildHubStation(session, "blacksmith")
    else upgradeWeapon(session)
    return session.log[0] ?? "The forge waits."
  }
  if (id === "farm") {
    if (!session.hub.stations.farm.built) buildHubStation(session, "farm")
    else if (!plantCrop(session)) harvestFarm(session)
    return session.log[0] ?? "The farm is quiet."
  }
  if (id === "houses") {
    const house = customizeVillageHouse(session)
    return `${house.name} updated.`
  }
  if (id === "guildhall") {
    const trust = completeVillageQuest(session, "guildmaster")
    return `${trust.name} trust ${trust.level}.`
  }
  playLocalCutscene(session, "village-unlock")
  const bossMemory = villageBossMemory(session)
  pushSessionMessage(session, bossMemory ? `The portal room echoes with ${bossMemory}. The next descent is marked.` : "The portal room steadies the next descent.")
  return "portal"
}

type VillageShopCandidate = {
  item: string
  index: number
  category: VillageCustomerTaste
  value: number
}

function currentVillageCustomer(session: GameSession) {
  const customers = session.hub.village.customers.length ? session.hub.village.customers : createVillageCustomers()
  return customers[Math.abs(session.seed + session.turn + session.hub.lootSold) % customers.length]
}

function villageShopMultiplier(session: GameSession, customer: VillageCustomer, category: VillageCustomerTaste) {
  const trust = session.hub.trust[customer.trustNpc]
  const matched = category === customer.taste
  return 1 + (matched ? 0.45 : -0.12) + trust.level * 0.08 + customer.patience * 0.03
}

function villageShopCandidates(session: GameSession, customer: VillageCustomer): VillageShopCandidate[] {
  return session.inventory
    .map((item, index) => ({ item, index, category: classifyShopItem(item), value: sellValue(item) }))
    .filter((entry) => entry.value > 0)
    .sort((left, right) => Number(right.category === customer.taste) - Number(left.category === customer.taste) || right.value - left.value)
}

function villageShopFairValue(session: GameSession, customer: VillageCustomer, candidate: VillageShopCandidate | undefined) {
  if (!candidate) return 0
  return Math.max(1, Math.round(candidate.value * villageShopMultiplier(session, customer, candidate.category)))
}

function villageDemandForPrice(askingPrice: number, fairValue: number): VillageMarketState["lastDemand"] {
  if (fairValue <= 0) return "untested"
  const ratio = askingPrice / fairValue
  if (ratio <= 0.75) return "bargain"
  if (ratio <= 1.15) return "fair"
  if (ratio <= 1.55) return "expensive"
  return "walked"
}

export function previewVillageShop(session: GameSession): VillageShopPreview {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const customer = currentVillageCustomer(session)
  const candidates = villageShopCandidates(session, customer)
  const selectedItemIndex = clamp(Math.floor(Number(session.hub.village.market.selectedItemIndex) || 0), 0, Math.max(0, candidates.length - 1))
  session.hub.village.market.selectedItemIndex = selectedItemIndex
  const selected = candidates[selectedItemIndex]
  const fairValue = villageShopFairValue(session, customer, selected)
  if (selected && session.hub.village.market.askingPrice <= 0) session.hub.village.market.askingPrice = fairValue
  const askingPrice = selected ? clamp(Math.floor(Number(session.hub.village.market.askingPrice) || fairValue), 1, 999) : 0
  if (selected) session.hub.village.market.askingPrice = askingPrice
  const demand = selected ? villageDemandForPrice(askingPrice, fairValue) : "untested"
  return {
    customer,
    item: selected?.item ?? null,
    category: selected?.category ?? null,
    baseValue: selected?.value ?? 0,
    askingPrice,
    fairValue,
    reputation: session.hub.village.market.reputation,
    demand,
    selectedItemIndex,
    itemCount: candidates.length,
  }
}

export function cycleVillageShopItem(session: GameSession, direction = 1): VillageShopPreview {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const preview = previewVillageShop(session)
  if (preview.itemCount > 0) {
    session.hub.village.market.selectedItemIndex = (preview.selectedItemIndex + direction + preview.itemCount) % preview.itemCount
    const nextPreview = previewVillageShop(session)
    session.hub.village.market.askingPrice = Math.max(1, nextPreview.fairValue)
    return previewVillageShop(session)
  }
  return preview
}

export function adjustVillageShopPrice(session: GameSession, delta: number): VillageShopPreview {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const preview = previewVillageShop(session)
  if (preview.item) session.hub.village.market.askingPrice = clamp(preview.askingPrice + delta, 1, 999)
  return previewVillageShop(session)
}

export function runVillageShopSale(session: GameSession): VillageShopSale | null {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (!session.hub.unlocked) {
    pushSessionMessage(session, "The market is locked behind the village route.")
    return null
  }
  const customers = session.hub.village.customers.length ? session.hub.village.customers : createVillageCustomers()
  session.hub.village.customers = customers
  const customer = currentVillageCustomer(session)
  const candidates = villageShopCandidates(session, customer)

  const selectedIndex = clamp(Math.floor(Number(session.hub.village.market.selectedItemIndex) || 0), 0, Math.max(0, candidates.length - 1))
  session.hub.village.market.selectedItemIndex = selectedIndex
  const selected = candidates[selectedIndex]
  if (!selected) {
    const reaction = `${customer.name} checks the counter, but you have no village-ready loot.`
    session.hub.village.shopLog.unshift(reaction)
    session.hub.village.shopLog = session.hub.village.shopLog.slice(0, 8)
    pushSessionMessage(session, reaction)
    addToast(session, "Market waiting", "Bring relics, food, tools, fossils, or memory loot to test prices.", "info")
    return null
  }

  const trust = session.hub.trust[customer.trustNpc]
  const matched = selected.category === customer.taste
  const fairValue = villageShopFairValue(session, customer, selected)
  const askingPrice = clamp(Math.floor(Number(session.hub.village.market.askingPrice) || fairValue), 1, 999)
  session.hub.village.market.askingPrice = askingPrice
  const demand = villageDemandForPrice(askingPrice, fairValue)
  const accepted = demand !== "walked"
  if (!accepted) {
    session.hub.village.market.lastDemand = demand
    session.hub.village.market.reputation = Math.max(0, session.hub.village.market.reputation - 1)
    const reaction = `${customer.name} walked away from ${selected.item} at ${askingPrice} coins; fair demand is near ${fairValue}.`
    session.hub.village.shopLog.unshift(reaction)
    session.hub.village.shopLog = session.hub.village.shopLog.slice(0, 8)
    pushSessionMessage(session, reaction)
    addToast(session, "Price too high", reaction, "info")
    return { customer, item: selected.item, value: 0, askingPrice, fairValue, accepted, demand, reaction }
  }

  const [item] = session.inventory.splice(selected.index, 1)
  const value = askingPrice
  session.hub.coins += value
  session.hub.lootSold += 1
  session.hub.village.market.lastDemand = demand
  session.hub.village.market.reputation += demand === "bargain" ? 2 : demand === "fair" ? 3 : 1
  gainNpcTrust(session, customer.trustNpc, matched ? 3 : 1, false)
  const reaction = matched
    ? `${customer.name} wanted ${selected.category} loot and paid ${value} coins for ${item}; demand looked ${demand}.`
    : `${customer.name} haggled on ${item}; ${value} coins changed hands and demand looked ${demand}.`
  session.hub.village.shopLog.unshift(reaction)
  session.hub.village.shopLog = session.hub.village.shopLog.slice(0, 8)
  pushSessionMessage(session, reaction)
  addToast(session, "Price discovered", reaction, matched ? "success" : "info")
  session.hub.village.market.selectedItemIndex = 0
  session.hub.village.market.askingPrice = 0
  return { customer, item, value, askingPrice, fairValue, accepted, demand, reaction }
}

export function customizeVillageHouse(session: GameSession, playerId = "player-1") {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const id = cleanId(playerId)
  let house = session.hub.houses.find((candidate) => candidate.playerId === id)
  if (!house) {
    house = { playerId: id, name: `Co-op House ${session.hub.houses.length + 1}`, built: false }
    session.hub.houses.push(house)
  }
  const suffixes = ["Cottage", "Forge Loft", "Garden House", "Moon Room"]
  const suffix = suffixes[(session.turn + session.hub.houses.indexOf(house)) % suffixes.length]
  house.name = id === "player-1" ? `${cleanHeroName(session.hero.name)}'s ${suffix}` : `${id.replace(/-/g, " ")} ${suffix}`
  house.built = true
  session.hub.relationshipLog.unshift(`${house.name} customized for shared village play.`)
  trimHubLog(session.hub)
  addToast(session, "House updated", `${house.name} is ready.`, "success")
  pushSessionMessage(session, `${house.name} is now customized.`)
  return house
}

export function cycleSharedFarmPermission(session: GameSession) {
  return cycleCoopVillagePermission(session, "farm").permission
}

export function cycleCoopVillagePermission(session: GameSession, area?: VillagePermissionArea): VillagePermissionResult {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const selectedArea = area ?? permissionAreaForLocation(session.hub.village.selectedLocation)
  const order: FarmPermission[] = ["owner-only", "friends", "everyone"]
  const current = order.indexOf(session.hub.village.permissions[selectedArea])
  const permission = order[wrap(current + 1, order.length)] ?? "friends"
  session.hub.village.permissions[selectedArea] = permission
  session.hub.village.selectedPermission = selectedArea
  if (selectedArea === "farm") session.hub.village.sharedFarm.permissions = permission
  const message = `${villagePermissionLabel(selectedArea)} permissions set to ${permission}.`
  session.hub.relationshipLog.unshift(message)
  trimHubLog(session.hub)
  pushSessionMessage(session, message)
  addToast(session, "Village permissions", message, "info")
  return { area: selectedArea, permission, message }
}

function permissionAreaForLocation(location: VillageLocationId): VillagePermissionArea {
  if (location === "houses") return "houses"
  if (location === "farm") return "farm"
  if (location === "market") return "shop"
  if (location === "blacksmith" || location === "guildhall") return "upgrades"
  return "storage"
}

function villagePermissionLabel(area: VillagePermissionArea) {
  const labels: Record<VillagePermissionArea, string> = {
    houses: "House",
    farm: "Farm",
    storage: "Storage",
    shop: "Shop shelf",
    upgrades: "Upgrade spending",
  }
  return labels[area]
}

export function selectContentPack(session: GameSession, id: ContentPackId) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (!contentPackIds.includes(id)) return session.hub.contentPacks
  session.hub.contentPacks.active = id
  session.hub.contentPacks.available = [...contentPackIds]
  session.hub.contentPacks.preview = contentPackPreview(id)
  session.hub.contentPacks.lastChangedTurn = session.turn
  pushSessionMessage(session, `${contentPackLabel(id)} content pack selected. Saves keep gameplay state unchanged.`)
  addToast(session, "Content pack", `${contentPackLabel(id)} selected.`, "info")
  return session.hub.contentPacks
}

export function cycleContentPack(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const current = contentPackIds.indexOf(session.hub.contentPacks.active)
  const next = contentPackIds[wrap(current + 1, contentPackIds.length)] ?? "opendungeon"
  return selectContentPack(session, next)
}

export function refreshBalanceDashboard(session: GameSession) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const builtStations = hubStationIds.filter((id) => session.hub.stations[id].built)
  const stationLevels = builtStations.reduce((sum, id) => sum + session.hub.stations[id].level, 0)
  const pressure = session.hub.activeMutators.length * 5
  const classWinRate = Object.fromEntries(
    heroClassIds.map((id, index) => {
      const stats = statsForClass(id)
      const base = 42 + statModifier(stats.vigor + stats.dexterity) * 3 + stationLevels * 2 - pressure + (index % 3) * 2
      return [id, clamp(base, 8, 88)]
    }),
  ) as Record<HeroClass, number>
  const combatBalance = combatBalanceSnapshot(session)
  classWinRate[session.hero.classId] = combatBalance.projectedClassWinRate
  const mutatorDifficulty = Object.fromEntries(
    runMutatorIds.map((id, index) => {
      const activeBonus = session.hub.activeMutators.includes(id) ? 18 : 0
      return [id, clamp(35 + index * 9 + activeBonus - stationLevels, 10, 95)]
    }),
  ) as Record<RunMutatorId, number>
  const averageGold = Math.max(0, Math.round((session.gold + session.hub.coins + session.hub.lootSold * 9 + stationLevels * 6) / Math.max(1, session.floor)))
  const averageHubCoins = Math.max(0, Math.round((session.hub.coins + session.hub.lootSold * 4) / Math.max(1, builtStations.length || 1)))
  const upgradePacing = clamp(Math.round((builtStations.length / hubStationIds.length) * 100 + stationLevels * 4), 0, 100)
  const notes = [
    `${builtStations.length}/${hubStationIds.length} village stations affect next-run pacing.`,
    session.hub.activeMutators.length ? `${session.hub.activeMutators.length} mutator(s) are raising projected difficulty.` : "No active mutators in the projected balance run.",
    `Combat balance: ${combatBalance.hitChance}% hit, ${combatBalance.fleeChance}% flee, ${combatBalance.deathRisk}% death risk.`,
    `Current class ${session.hero.classId} projects ${combatBalance.projectedClassWinRate}% win rate.`,
  ]
  session.hub.balanceDashboard = {
    runs: 32 + session.hub.activeMutators.length * 8,
    classWinRate,
    mutatorDifficulty,
    averageGold,
    averageHubCoins,
    upgradePacing,
    notes,
  }
  pushSessionMessage(session, `Balance dashboard refreshed: ${classWinRate[session.hero.classId]}% projected ${session.hero.classId} win rate.`)
  return session.hub.balanceDashboard
}

export function playLocalCutscene(session: GameSession, id: CutsceneId = session.status === "victory" ? (session.pendingWorldGeneration ? "ending-remixed" : "ending-rooted") : session.hub.unlocked ? "village-unlock" : "first-clear") {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const existing = session.hub.cutscenes.find((scene) => scene.id === id)
  const scene = existing ?? createCutscene(id, session.hero.name)
  scene.lines = cutsceneLinesFor(id, session)
  scene.seen = true
  if (!existing) session.hub.cutscenes.push(scene)
  session.hub.lastCutsceneId = id
  session.hub.relationshipLog.unshift(`Cutscene: ${scene.title}`)
  rememberKnowledge(session, {
    id: `cutscene-${id}`,
    title: scene.title,
    text: scene.lines.join(" "),
    kind: "hub",
    floor: session.floor,
  })
  trimHubLog(session.hub)
  addToast(session, "Cutscene", scene.title, "info")
  return scene
}

export function gainNpcTrust(session: GameSession, npc: VillageNpcId, amount: number, quest = false) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const trust = session.hub.trust[npc]
  trust.xp += Math.max(0, Math.floor(amount))
  if (quest) trust.questsCompleted += 1
  const nextLevel = Math.min(5, Math.floor(trust.xp / 8))
  if (nextLevel > trust.level) {
    trust.level = nextLevel
    session.hub.relationshipLog.unshift(`${trust.name} reached trust level ${trust.level}.`)
    trimHubLog(session.hub)
  }
  return trust
}

export const combatSkills: CombatSkill[] = [
  {
    id: "strike",
    name: "Strike",
    stat: "strength",
    affinity: "physical",
    cost: 0,
    dc: 10,
    damage: 3,
    text: "Reliable physical attack. Good when Strength is your best stat.",
  },
  {
    id: "aimed-shot",
    name: "Aimed Shot",
    stat: "dexterity",
    affinity: "precision",
    cost: 1,
    dc: 13,
    damage: 5,
    text: "Precision hit. Good against fragile or evasive enemies.",
  },
  {
    id: "arcane-burst",
    name: "Arcane Burst",
    stat: "intelligence",
    affinity: "arcane",
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
    affinity: "holy",
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
    affinity: "shadow",
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
    affinity: "luck",
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

export function talentSummaryFor(id: TalentId): TalentSummary {
  const talent = talentDefinitions[id]
  return {
    id,
    name: talent.name,
    text: talent.text,
    effect: talentEffectSummary(talent),
  }
}

export function talentSummariesForSession(session: GameSession): TalentSummary[] {
  return session.talents.map((id) => talentSummaryFor(id))
}

function talentEffectSummary(talent: TalentDefinition) {
  const parts: string[] = []
  for (const [stat, value] of Object.entries(talent.statBonuses ?? {}) as Array<[StatId, number]>) {
    if (value) parts.push(`${formatSigned(value)} ${statLabels[stat]}`)
  }
  if (talent.skillId) {
    const skillName = combatSkills.find((skill) => skill.id === talent.skillId)?.name ?? talent.skillId
    if (talent.damageBonus) parts.push(`${skillName} ${formatSigned(talent.damageBonus)} damage`)
    if (talent.focusDiscount) parts.push(`${skillName} -${talent.focusDiscount} focus cost`)
  }
  if (talent.restFocusBonus) parts.push(`Rest ${formatSigned(talent.restFocusBonus)} focus`)
  return parts.join("; ") || "Passive unlock"
}

type MonsterProfile = {
  family: string
  behavior: string
  strategy: string
  lore: string
  weaknesses: CombatAffinity[]
  resists: CombatAffinity[]
}

const monsterProfiles: Record<EnemyActorId, MonsterProfile> = {
  slime: {
    family: "ooze",
    behavior: "Slow pursuit. It blocks corridors and wins if you let it grind down turns.",
    strategy: "Use Arcane Burst or Aimed Shot before it pins you. Strike works, but it does not teach much.",
    lore: "Slimes are failed storage spells. Heat and precise cuts keep them from splitting around the blade.",
    weaknesses: ["arcane", "precision"],
    resists: ["physical"],
  },
  ghoul: {
    family: "undead",
    behavior: "Direct chase with punishing contact damage.",
    strategy: "Smite is the clean answer. Guard before trading hits if your HP is low.",
    lore: "A ghoul is hunger with old bones wrapped around it. Shrine light makes the hunger lose its shape.",
    weaknesses: ["holy"],
    resists: ["shadow"],
  },
  necromancer: {
    family: "caster",
    behavior: "Ranged pressure. Protected necromancers are harder while rust squires stand near them.",
    strategy: "Close distance, break guards, then use Smite or Strike. Shadow Hex buys time but is resisted.",
    lore: "Necromancers read the dungeon ledger backward. Interrupting the body matters more than arguing with the spell.",
    weaknesses: ["holy", "physical"],
    resists: ["shadow", "arcane"],
  },
  "gallows-wisp": {
    family: "spirit",
    behavior: "Stalker movement that pressures lines of sight.",
    strategy: "Shadow Hex or Lucky Riposte catches it when normal weapon timing feels wrong.",
    lore: "Wisps pull fear into a loop. Luck and shadow break the loop because neither follows a straight road.",
    weaknesses: ["shadow", "luck"],
    resists: ["physical"],
  },
  "rust-squire": {
    family: "armored",
    behavior: "Guard pattern. It protects casters and bosses nearby.",
    strategy: "Arcane Burst or Shadow Hex cracks the armor. Do not waste weak physical hits into the shell.",
    lore: "The armor remembers its orders better than the person inside. Hexes make the order stutter.",
    weaknesses: ["arcane", "shadow"],
    resists: ["physical", "precision"],
  },
  "carrion-moth": {
    family: "skittish",
    behavior: "Fragile, evasive movement. It flees when hurt and can waste turns.",
    strategy: "Aimed Shot is best. Lucky Riposte also works if you expect it to dart back in.",
    lore: "Carrion moths follow breath, not blood. A careful shot pins the wing before the swarm scatters.",
    weaknesses: ["precision", "luck"],
    resists: ["holy"],
  },
  "crypt-mimic": {
    family: "ambush",
    behavior: "Ambush threat hidden around loot routes.",
    strategy: "Strike or Smite after it reveals itself. Precision shots glance off the false box.",
    lore: "A mimic learns the shape of greed. Force and faith both remind it that the shape is not real.",
    weaknesses: ["physical", "holy"],
    resists: ["precision"],
  },
  "grave-root-boss": {
    family: "root boss",
    behavior: "Phase-shifting boss. The second phase gets meaner after half HP.",
    strategy: "Smite and Arcane Burst are the best finishers. Keep focus for phase two instead of spending everything early.",
    lore: "The grave-root binds every failed ending together. Light severs the knot; arcane fire cauterizes it.",
    weaknesses: ["holy", "arcane"],
    resists: ["shadow"],
  },
}

export function createSession(
  seed = 2423368,
  mode: MultiplayerMode = "solo",
  classId: HeroClass = "ranger",
  heroName = "Mira",
  appearance?: Partial<HeroAppearance> | null,
  startWithTutorial = false,
  showTutorialOffStart = false,
): GameSession {
  const dungeon = createDungeon(seed, 1)
  const stats = statsForClass(classId)
  const maxHp = derivedMaxHp(stats)
  const maxFocus = derivedMaxFocus(stats)
  const finalFloor = defaultFinalFloor
  const floorModifier = floorModifierFor(seed, 1)
  const world = createWorldForSeed(seed, finalFloor)
  const session: GameSession = {
    mode,
    hero: {
      name: cleanHeroName(heroName),
      classId,
      title: heroTitles[classId],
      appearance: normalizeHeroAppearance(classId, appearance),
    },
    stats,
    seed,
    floor: 1,
    floorModifier,
    player: { ...dungeon.playerStart },
    hp: startWithTutorial ? Math.max(1, maxHp - tutorialStartingWound) : maxHp,
    maxHp,
    focus: maxFocus,
    maxFocus,
    dungeon,
    log: [openingStoryText()],
    inventory: startingLoadout(classId),
    turn: 0,
    status: "running",
    gold: 0,
    xp: 0,
    level: 1,
    talents: [],
    levelUp: null,
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
    conversationMemory: {},
    tutorial: createTutorialState(startWithTutorial),
    deaths: 0,
    statusEffects: [],
    world,
    worldLog: [
      createWorldLogEntry(world.worldId, 0, {
        type: "world-created",
        message: `World ${world.worldId} created from seed ${seed}.`,
      }),
    ],
    pendingWorldGeneration: false,
    knowledge: [],
    toasts: [],
    hub: createHubState(mode, heroName),
    equipment: createStartingEquipment(classId),
  }
  if (session.tutorial.enabled) prepareTutorialArea(session)
  for (const entry of initialKnowledgeEntries()) rememberKnowledge(session, entry)
  rememberKnowledge(session, floorKnowledgeEntry(1))
  addToast(session, "Awake", "No memory, one weapon, and a dungeon that knows your steps.", "info")
  if (!session.tutorial.enabled && showTutorialOffStart) applyTutorialOffStart(session)
  revealAroundPlayer(session)
  return session
}

export function createNextDescentSession(previous: GameSession, seed: number): GameSession {
  const next = createSession(seed, previous.mode, previous.hero.classId, previous.hero.name, previous.hero.appearance, false)
  next.hub = normalizeHubState(previous.hub, previous.mode, previous.hero.name)
  next.hub.calendar = createVillageCalendarState(previous.seed, previous.turn)
  next.hub.lastCutsceneId = null
  next.hub.relationshipLog.unshift(`New descent opened from the village with seed ${seed}.`)
  trimHubLog(next.hub)
  next.equipment = normalizeEquipment(previous.equipment, previous.hero.classId)

  const preparedFood = next.hub.preparedFood.filter((item) => !item.startsWith("Recipe:")).slice(0, 2)
  for (const food of preparedFood.reverse()) {
    if (!next.inventory.includes(food)) next.inventory.unshift(food)
    if (food === "Focus broth") next.maxFocus += 1
  }
  next.focus = next.maxFocus
  applyVillageCalendarModifier(next)
  applyMutatorPressure(next)
  applyStrategicDescentPressure(next)
  refreshBalanceDashboard(next)
  focusFinalGateQuest(next)
  rememberKnowledge(next, {
    id: "village-next-descent",
    title: "Prepared Descent",
    text: "The village can preserve coins, stations, trust, houses, farm state, food, weapons, content packs, and active mutators between runs.",
    kind: "hub",
    floor: next.floor,
  })
  addToast(next, "Next descent", "Village progress carried forward. Find the Final Gate.", "success")
  if (strategicPressureTier(next)) addToast(next, "Sharper descent", "Enemies now guard, pressure range, and punish one-note attacks.", "warning")
  pushSessionMessage(next, "Village preparations carried into the next descent.")
  return next
}

function createTutorialState(enabled = false): RunTutorialState {
  return {
    enabled,
    completed: !enabled,
    stage: enabled ? "movement" : "complete",
    coopGateHold: null,
    gatePoints: [],
    movementSteps: 0,
    movedUp: false,
    movedDown: false,
    movedLeft: false,
    movedRight: false,
    openedInventory: false,
    openedQuests: false,
    openedBook: false,
    talkedToNpc: false,
    handledTalentCheck: false,
    combatStarted: false,
    combatFinished: false,
    disabledAfterDeath: false,
    handoffShown: false,
  }
}

function prepareTutorialArea(session: GameSession) {
  const roomW = 11
  const roomH = 9
  const totalW = roomW * 3 + 2
  const start = session.player
  const x0 = clamp(start.x - Math.floor(roomW / 2), 2, Math.max(2, session.dungeon.width - totalW - 2))
  const y0 = clamp(start.y - Math.floor(roomH / 2), 2, Math.max(2, session.dungeon.height - roomH - 2))
  const centerY = y0 + Math.floor(roomH / 2)
  const gateOne = { x: x0 + roomW, y: centerY }
  const gateTwo = { x: x0 + roomW * 2 + 1, y: centerY }
  const rooms = [
    { x: x0, y: y0, width: roomW, height: roomH },
    { x: x0 + roomW + 1, y: y0, width: roomW, height: roomH },
    { x: x0 + roomW * 2 + 2, y: y0, width: roomW, height: roomH },
  ]
  const bounds = {
    x: x0 - 1,
    y: y0 - 1,
    width: totalW + 2,
    height: roomH + 2,
  }

  for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x++) setTile(session.dungeon, { x, y }, "wall")
  }
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) setTile(session.dungeon, { x, y }, "floor")
    }
  }

  session.tutorial.gatePoints = [gateOne, gateTwo]
  closeTutorialGate(session, 0)
  closeTutorialGate(session, 1)
  session.player = { x: x0 + Math.floor(roomW / 2), y: centerY }
  session.dungeon.playerStart = { ...session.player }
  session.dungeon.actors = session.dungeon.actors.filter((actor) => !pointInRect(actor.position, bounds))

  const npcPoint = { x: rooms[1].x + 3, y: centerY }
  const checkPoint = { x: rooms[1].x + 7, y: centerY }
  const enemyPoint = { x: rooms[2].x + 3, y: centerY }
  const stairsPoint = { x: rooms[2].x + roomW - 2, y: centerY }

  if (npcPoint) {
    session.dungeon.actors.push({
      id: "tutorial-wound-surgeon",
      kind: "wound-surgeon",
      position: { ...npcPoint },
      hp: 1,
      maxHp: 1,
      damage: 0,
    })
  }

  setTile(session.dungeon, checkPoint, "relic")
  setTile(session.dungeon, stairsPoint, "stairs")

  if (enemyPoint) {
    session.dungeon.actors.push({
      id: "tutorial-slime",
      kind: "slime",
      position: { ...enemyPoint },
      hp: 3,
      maxHp: 3,
      damage: 1,
      phase: 1,
      ai: {
        ...enemyAi("slime", enemyPoint, 0, session.floor),
        pattern: "sentinel",
        alerted: false,
        aggroRadius: 1,
        leashRadius: 2,
      },
    })
  }
}

export function tryMove(session: GameSession, dx: number, dy: number) {
  if (session.status !== "running") return
  if (session.levelUp) {
    session.log.unshift("Choose a level-up talent before moving.")
    trimLog(session)
    return
  }
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

  const previous = { ...session.player }
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

  const gateMessage = tutorialGateMessageForPoint(session, next)
  if (gateMessage) {
    session.log.unshift(gateMessage)
    revealAroundPlayer(session)
    trimLog(session)
    return
  }

  session.player = next
  recordChallengeTrail(session, "move")
  recordTutorialAction(session, tutorialMoveAction(dx, dy))

  if (tile === "door") {
    unlockDoor(session, next)
  } else if (tile === "stairs") {
    if (hasFinalGuardian(session)) {
      session.player = previous
      session.log.unshift("The final gate is sealed by the necromancer.")
      trimLog(session)
      return
    }
    const stairsGateMessage = tutorialGateMessage(session)
    if (stairsGateMessage) {
      session.player = previous
      session.log.unshift(stairsGateMessage)
      revealAroundPlayer(session)
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
  } else if (isKnowledgeCollectible(tile)) {
    collectKnowledgePickup(session, next, tile)
  } else {
    session.log.unshift("You move through the dark.")
  }

  advanceTurn(session)
}

export function rest(session: GameSession) {
  if (session.status !== "running") return
  if (session.levelUp) {
    session.log.unshift("Choose a level-up talent before resting.")
    trimLog(session)
    return
  }
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
  const focusGain = 1 + Math.max(0, session.floorModifier.restFocusBonus) + talentRestFocusBonus(session)
  const beforeFocus = session.focus
  const beforeHp = session.hp
  session.focus = Math.min(session.maxFocus, session.focus + focusGain)
  if (session.hp < session.maxHp) session.hp = Math.min(session.maxHp, session.hp + 1)
  const restoredFocus = session.focus - beforeFocus
  const restoredHp = session.hp - beforeHp
  const restored = [`${restoredFocus ? `+${restoredFocus} focus` : ""}`, `${restoredHp ? `+${restoredHp} HP` : ""}`].filter(Boolean).join(", ")
  const message = restored
    ? focusGain > 1
      ? `${session.floorModifier.name} steadies you. ${restored}.`
      : `You rest for a breath. ${restored}.`
    : "You hold position and listen. Already steady."
  session.log.unshift(message)
  addToast(session, "Rested", restored || "Time passes; HP and focus are already full.", restored ? "success" : "info")
  advanceTurn(session)
}

export function usePotion(session: GameSession) {
  if (session.status !== "running") return
  if (session.levelUp) {
    session.log.unshift("Choose a level-up talent before using items.")
    trimLog(session)
    return
  }
  if (session.skillCheck) {
    session.log.unshift("Hands are busy with the talent check.")
    trimLog(session)
    return
  }
  const index = session.inventory.findIndex((item) => /deploy nerve potion|vial|potion/i.test(item))
  if (index < 0) {
    session.log.unshift("No potion in the pack.")
    trimLog(session)
    return
  }

  useInventoryItemAt(session, index)
}

export function useInventoryItemAt(session: GameSession, index: number) {
  const item = session.inventory[index]
  if (!item) return { used: false, message: "Empty slot selected." }
  const lower = item.toLowerCase()

  if (session.status !== "running") return { used: false, message: `${item}: use, sell, or prepare items during an active descent or in the village.` }
  if (session.levelUp) return { used: false, message: "Choose a level-up talent before using items." }
  if (session.skillCheck && !lower.includes("rollback scroll")) return { used: false, message: "Hands are busy with the talent check. Press Esc to step away first." }
  if (lower.includes("rollback scroll")) return useRollbackScroll(session, index, item)
  if (lower.includes("tripwire") || lower.includes("bomb")) return useCombatTool(session, index, item)
  if (lower.includes("rope arrow") || lower.includes("lockpick")) return useTraversalTool(session, index, item)
  if (lower.includes("cursed shard")) return useCursedReward(session, index, item)

  if (lower.includes("deploy nerve potion")) return consumeInventoryItem(session, index, item, { hp: 5, focus: 0, title: "Potion used", text: "Health returns and the pulse settles." })
  if (lower.includes("vial") || lower.includes("potion")) return consumeInventoryItem(session, index, item, { hp: 5, focus: 0, title: "Item used", text: `${item} restored health.` })
  if (lower.includes("focus broth")) return consumeInventoryItem(session, index, item, { hp: 1, focus: 5, maxFocus: 1, title: "Food used", text: `${item} restored focus and raised max focus for this descent.` })
  if (lower.includes("ration") || lower.includes("food")) return consumeInventoryItem(session, index, item, { hp: 3, focus: 1, maxHp: 1, title: "Food used", text: `${item} restored HP and raised max HP for this descent.` })

  return { used: false, message: `${item}: ${inventoryItemUseHint(item)}` }
}

export function inventoryActionsForItem(session: GameSession, index: number): InventoryAction[] {
  const item = session.inventory[index]
  if (!item) {
    return [
      { id: "inspect", key: "?", label: "inspect", enabled: false, hint: "Empty slot." },
      { id: "use", key: "Enter", label: "use", enabled: false, hint: "No item selected." },
      { id: "equip", key: "E", label: "equip", enabled: false, hint: "No gear selected." },
      { id: "drop", key: "X", label: "drop", enabled: false, hint: "No item selected." },
      { id: "stash", key: "S", label: "stash", enabled: false, hint: "No item selected." },
      { id: "sell", key: "V", label: "sell", enabled: false, hint: "No item selected." },
    ]
  }

  const slot = inventoryEquipmentSlot(item)
  const sellableValue = sellValue(item)
  const usable = isConsumableInventoryItem(item)
  const storageBuilt = Boolean(session.hub.unlocked && session.hub.stations.storage.built)
  return [
    { id: "inspect", key: "?", label: "inspect", enabled: true, hint: inventoryItemDescription(item) },
    { id: "use", key: "Enter", label: "use", enabled: usable, hint: usable ? "Consumes the item now." : inventoryItemUseHint(item) },
    { id: "equip", key: "E", label: "equip", enabled: Boolean(slot), hint: slot ? `Equip as ${slot}.` : "This item is not gear." },
    { id: "drop", key: "X", label: "drop", enabled: true, hint: "Remove this item from the pack." },
    { id: "stash", key: "S", label: "stash", enabled: storageBuilt, hint: storageBuilt ? "Move to village storage." : "Build Storage in the village first." },
    { id: "sell", key: "V", label: "sell", enabled: session.hub.unlocked && sellableValue > 0, hint: sellableValue > 0 ? `Sell for ${sellableValue} village coins.` : "No village sale value." },
  ]
}

export function performInventoryAction(session: GameSession, index: number, action: InventoryActionId) {
  if (action === "use") return useInventoryItemAt(session, index)
  const item = session.inventory[index]
  if (!item) return { used: false, message: "Empty slot selected." }

  if (action === "inspect") return { used: false, message: `${item}: ${inventoryItemDescription(item)} ${inventoryItemUseHint(item)}` }
  if (action === "equip") return equipInventoryItem(session, index, item)
  if (action === "drop") return dropInventoryItem(session, index, item)
  if (action === "stash") return stashInventoryItem(session, index, item)
  if (action === "sell") return sellInventoryItem(session, index, item)
  return { used: false, message: `${item}: no action mapped.` }
}

function equipInventoryItem(session: GameSession, _index: number, item: string) {
  const slot = inventoryEquipmentSlot(item)
  if (!slot) return { used: false, message: `${item} is not gear.` }
  const equipped = equipmentFromInventoryItem(item, slot)
  session.equipment[slot] = equipped
  const message = `${item} equipped as ${slot}.`
  pushSessionMessage(session, message)
  addToast(session, "Equipped", `${item} is now your ${slot}.`, "success")
  return { used: true, message }
}

function dropInventoryItem(session: GameSession, index: number, item: string) {
  session.inventory.splice(index, 1)
  const message = `${item} dropped from the pack.`
  pushSessionMessage(session, message)
  addToast(session, "Dropped", item, "info")
  return { used: true, message }
}

function stashInventoryItem(session: GameSession, index: number, item: string) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (!session.hub.unlocked) return { used: false, message: "Village storage is locked until the first clear." }
  if (!session.hub.stations.storage.built) return { used: false, message: "Build Storage in the village before stashing pack items." }
  session.inventory.splice(index, 1)
  session.hub.village.sharedFarm.storage.unshift(item)
  session.hub.village.sharedFarm.storage = session.hub.village.sharedFarm.storage.slice(0, 50)
  const message = `${item} moved to village storage.`
  pushSessionMessage(session, message)
  addToast(session, "Stashed", item, "success")
  return { used: true, message }
}

function sellInventoryItem(session: GameSession, index: number, item: string) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (!session.hub.unlocked) return { used: false, message: "Village market is locked until the first clear." }
  const value = sellValue(item)
  if (value <= 0) return { used: false, message: `${item} has no village sale value.` }
  session.inventory.splice(index, 1)
  session.hub.coins += value
  session.hub.lootSold += 1
  const message = `${item} sold for ${value} village coins.`
  pushSessionMessage(session, message)
  addToast(session, "Sold", `${item} +${value} village coins.`, "success")
  return { used: true, message }
}

function useRollbackScroll(session: GameSession, index: number, item: string) {
  if (!session.combat.active && !session.skillCheck) return { used: false, message: `${item} waits for combat or a talent check gone wrong.` }
  session.inventory.splice(index, 1)
  if (session.skillCheck) {
    session.skillCheck = null
    const message = `${item} rewound the talent check before the roll landed.`
    pushSessionMessage(session, message)
    addToast(session, "Check rewound", "The check was cancelled without a consequence.", "success")
    return { used: true, message }
  }
  endCombat(session, `${item} pulled the crawler out of initiative.`)
  return { used: true, message: `${item} ended the fight before another exchange.` }
}

function useTraversalTool(session: GameSession, index: number, item: string) {
  session.inventory.splice(index, 1)
  session.focus = Math.min(session.maxFocus, session.focus + 1)
  session.turn += 1
  revealAroundPlayer(session)
  const message = `${item} marked a safer route. +1 focus and nearby paths revealed.`
  pushSessionMessage(session, message)
  addToast(session, "Tool used", message, "success")
  return { used: true, message }
}

function useCombatTool(session: GameSession, index: number, item: string) {
  if (!session.combat.active) return { used: false, message: `${item} needs an active fight.` }
  const target = combatTargets(session)[session.combat.selectedTarget]
  if (!target) return { used: false, message: `${item} has no target.` }
  session.inventory.splice(index, 1)
  const damage = item.toLowerCase().includes("bomb") ? 6 : 4
  target.hp -= damage
  session.statusEffects.push({
    id: "weakened",
    targetId: target.id,
    label: "Pinned",
    remainingTurns: 2,
    magnitude: 1,
    source: item,
  })
  const message = `${item} pins ${label(target.kind)} for ${damage} damage and weakens the next exchange.`
  session.combat.message = message
  session.log.unshift(message)
  addToast(session, "Tactical tool", message, "success")
  if (target.hp <= 0) defeatActor(session, target)
  if (combatTargets(session).length > 0) finishCombatRound(session, true)
  else {
    endCombat(session, "The room falls silent.")
    finishCombatRound(session, false)
  }
  return { used: true, message }
}

function useCursedReward(session: GameSession, index: number, item: string) {
  session.inventory.splice(index, 1)
  const hpCost = Math.min(4, Math.max(0, session.hp - 1))
  session.hp = Math.max(1, session.hp - hpCost)
  session.focus = Math.max(0, session.focus - 1)
  session.gold += 14
  session.xp += 2
  maybeLevelUp(session)
  const message = `${item} paid out 14g and 2 XP, but took ${hpCost} HP and 1 focus.`
  pushSessionMessage(session, message)
  addToast(session, "Cursed reward", message, "warning")
  if (session.combat.active) finishCombatRound(session, true)
  return { used: true, message }
}

function consumeInventoryItem(session: GameSession, index: number, item: string, effect: { hp: number; focus: number; maxHp?: number; maxFocus?: number; title: string; text: string }) {
  const beforeHp = session.hp
  const beforeFocus = session.focus
  const maxHpGain = Math.max(0, effect.maxHp ?? 0)
  const maxFocusGain = Math.max(0, effect.maxFocus ?? 0)
  const nextMaxHp = session.maxHp + maxHpGain
  const nextMaxFocus = session.maxFocus + maxFocusGain
  const nextHp = Math.min(nextMaxHp, session.hp + effect.hp)
  const nextFocus = Math.min(nextMaxFocus, session.focus + effect.focus)
  if (nextHp === beforeHp && nextFocus === beforeFocus && !maxHpGain && !maxFocusGain) return { used: false, message: `${item} kept. HP and focus are already full.` }

  session.inventory.splice(index, 1)
  session.maxHp = nextMaxHp
  session.maxFocus = nextMaxFocus
  session.hp = nextHp
  session.focus = nextFocus
  const restored = [
    `${nextHp - beforeHp ? `+${nextHp - beforeHp} HP` : ""}`,
    `${nextFocus - beforeFocus ? `+${nextFocus - beforeFocus} focus` : ""}`,
    `${maxHpGain ? `+${maxHpGain} max HP` : ""}`,
    `${maxFocusGain ? `+${maxFocusGain} max focus` : ""}`,
  ]
    .filter(Boolean)
    .join(", ")
  const message = `${item} used. ${restored}.`
  session.log.unshift(message)
  addToast(session, effect.title, effect.text, "success")
  if (session.combat.active) finishCombatRound(session, true)
  else trimLog(session)
  return { used: true, message }
}

function isConsumableInventoryItem(item: string) {
  return /potion|vial|broth|food|ration|tripwire|bomb|rope arrow|lockpick|rollback scroll|cursed shard/i.test(item)
}

function inventoryEquipmentSlot(item: string): EquipmentSlot | null {
  const lower = item.toLowerCase()
  if (/blade|sword|axe|mace|rapier|focus|spanner|knife/i.test(lower)) return "weapon"
  if (/shield|buckler|cloak/i.test(lower)) return "armor"
  if (/relic|charm|token|spark|shard/i.test(lower)) return "relic"
  return null
}

function equipmentFromInventoryItem(item: string, slot: EquipmentSlot): EquipmentItem {
  const lower = item.toLowerCase()
  const explicitBonus = Number(item.match(/\+(\d+)/)?.[1] ?? 0)
  const rarity: EquipmentRarity = /boss|grave|bound|shrine/i.test(item) ? "rare" : /cursed|ash|parry|oath/i.test(item) ? "uncommon" : "common"
  const statBonuses: Partial<HeroStats> = {}
  if (slot === "weapon") {
    if (/focus|spark|scroll/i.test(lower)) statBonuses.intelligence = rarity === "rare" ? 2 : 1
    else if (/rapier|knife|blade|arrow/i.test(lower)) statBonuses.dexterity = rarity === "rare" ? 2 : 1
    else statBonuses.strength = rarity === "rare" ? 2 : 1
  }
  if (slot === "armor") {
    statBonuses.endurance = rarity === "rare" ? 2 : 1
    if (/cloak/i.test(lower)) statBonuses.dexterity = 1
    if (/shield|buckler/i.test(lower)) statBonuses.vigor = 1
  }
  if (slot === "relic") {
    statBonuses.luck = rarity === "rare" ? 2 : 1
    if (/shrine|bell|charm/i.test(lower)) statBonuses.faith = 1
    if (/cursed|hex|spark/i.test(lower)) statBonuses.intelligence = 1
  }
  return {
    id: cleanId(`${slot}-${item}`),
    name: cleanBookText(item, 48),
    slot,
    rarity,
    bonusDamage: slot === "weapon" ? Math.max(explicitBonus, rarity === "rare" ? 2 : rarity === "uncommon" ? 1 : 0) : 0,
    statBonuses,
    activeText: equipmentActiveText(item, slot, rarity),
  }
}

function equipmentActiveText(item: string, slot: EquipmentSlot, rarity: EquipmentRarity) {
  const lower = item.toLowerCase()
  if (slot === "weapon") return `${item} changes damage math; ${rarity} weapons add more base pressure.`
  if (slot === "armor") return /cloak/i.test(lower) ? `${item} helps evasive defenses and escape plans.` : `${item} raises survivability against longer fights.`
  if (/cursed/i.test(lower)) return `${item} is a risky relic: better checks, worse decisions if you spend it.`
  return `${item} sharpens talent checks and story-event odds.`
}

export function equipmentComparisonText(session: GameSession, item: string) {
  const slot = inventoryEquipmentSlot(item)
  if (!slot) return `Compare: utility or loot item. ${inventoryItemUseHint(item)}`
  const candidate = equipmentFromInventoryItem(item, slot)
  const equipped = session.equipment[slot]
  const equippedText = equipped ? equipmentBonusText(equipped) : "empty slot"
  return `Compare ${slot}: ${candidate.name} gives ${equipmentBonusText(candidate)}. Current ${equipped?.name ?? "empty"} gives ${equippedText}. ${candidate.activeText}`
}

function equipmentBonusText(item: EquipmentItem) {
  const stats = Object.entries(item.statBonuses)
    .filter(([, value]) => value)
    .map(([stat, value]) => `${statAbbreviations[stat as StatId]} ${formatSigned(value ?? 0)}`)
  const damage = item.bonusDamage ? [`damage +${item.bonusDamage}`] : []
  return [...damage, ...stats, item.rarity].join(", ")
}

export function inventoryItemDescription(item: string) {
  const lower = item.toLowerCase()
  if (lower.includes("potion") || lower.includes("vial")) return "Consumable: restores HP during a descent."
  if (lower.includes("focus broth")) return "Prepared food buff: restores focus and raises max focus for this descent."
  if (lower.includes("food") || lower.includes("ration")) return "Prepared food buff: restores HP/focus and raises max HP for this descent."
  if (lower.includes("tripwire") || lower.includes("bomb")) return "Combat tool: use during a fight to damage and weaken the selected enemy."
  if (lower.includes("rope arrow") || lower.includes("lockpick")) return "Traversal tool: reveals nearby routes and restores a little focus."
  if (lower.includes("rollback scroll")) return "Emergency tool: cancels a talent check or escapes combat before the next exchange."
  if (lower.includes("bound relic")) return "Passive relic: adds +1 to talent checks."
  if (lower.includes("cursed shard")) return "Risk relic: valuable in the village, dangerous in checks."
  if (lower.includes("relic") || lower.includes("shard")) return "Relic: lore, checks, or village sale value."
  if (lower.includes("blade") || lower.includes("sword") || lower.includes("axe") || lower.includes("mace") || lower.includes("rapier")) return "Equipped weapon: affects your combat plan."
  if (lower.includes("shield") || lower.includes("cloak") || lower.includes("charm")) return "Passive gear: defensive or class flavor equipment."
  if (lower.includes("lockpick") || lower.includes("tool") || lower.includes("rope")) return "Tool: useful for events, doors, or village work."
  if (lower.includes("scroll") || lower.includes("map") || lower.includes("ledger")) return "Record: open the Book for lore and routing clues."
  if (lower.includes("deed")) return "Village deed: unlocks or improves village work."
  if (lower.includes("memory") || lower.includes("fossil") || lower.includes("keepsake")) return "Village treasure: sell, study, or keep for story."
  return "Stored item: keep for later or sell in the village."
}

function inventoryItemUseHint(item: string) {
  const lower = item.toLowerCase()
  if (lower.includes("bound relic")) return "passive +1 to talent checks; no manual use needed."
  if (lower.includes("cursed shard")) return "use for gold and XP at an HP/focus cost, or sell it in the village market."
  if (lower.includes("tripwire") || lower.includes("bomb")) return "active combat tool; use it while a fight is open."
  if (lower.includes("rope arrow") || lower.includes("lockpick")) return "active traversal tool; spend it to reveal space and regain focus."
  if (lower.includes("rollback scroll")) return "emergency tool; use during combat or a talent check."
  if (lower.includes("relic") || lower.includes("shard")) return "passive lore/check item; sell extras from the village market."
  if (lower.includes("blade") || lower.includes("sword") || lower.includes("axe") || lower.includes("mace") || lower.includes("rapier")) return "already equipped as your weapon; upgrade weapons in the village."
  if (lower.includes("shield") || lower.includes("cloak") || lower.includes("charm")) return "passive gear; keep it equipped or sell later in the village."
  if (lower.includes("lockpick") || lower.includes("tool") || lower.includes("rope")) return "tool item; doors, events, and village projects use it automatically."
  if (lower.includes("scroll") || lower.includes("map") || lower.includes("ledger")) return "record item; open B Book to read what it taught you."
  if (lower.includes("deed")) return "village item; return home to build or upgrade with it."
  if (lower.includes("memory") || lower.includes("fossil") || lower.includes("keepsake")) return "treasure/story item; sell or study it in the village."
  return "stored for later. Sell it in the village if it is loot."
}

export function interactWithWorld(session: GameSession): ConversationState | null {
  if (session.status !== "running") return null
  if (session.levelUp) {
    chooseLevelUpTalent(session, 0)
    return null
  }
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
  recordTutorialAction(session, "talent-check")
  applySkillCheckConsequence(session, check, roll)
  advanceTurn(session)
  return roll
}

export function dismissSkillCheck(session: GameSession) {
  if (session.skillCheck?.status === "resolved") session.skillCheck = null
}

export function cancelSkillCheck(session: GameSession) {
  const check = session.skillCheck
  if (!check || check.status !== "pending") return false
  session.skillCheck = null
  recordTutorialAction(session, "talent-check")
  session.log.unshift(`${check.title}: skipped. You step away before the roll.`)
  addToast(session, "Talent check skipped", "Esc leaves the check unresolved.", "info")
  trimLog(session)
  return true
}

export function recordTutorialAction(session: GameSession, action: TutorialActionId) {
  const tutorial = session.tutorial
  if (!tutorial.enabled || tutorial.completed || tutorial.disabledAfterDeath || session.deaths > 0) return

  if (action === "move" || action.startsWith("move-")) tutorial.movementSteps += 1
  if (action === "move-up") tutorial.movedUp = true
  if (action === "move-down") tutorial.movedDown = true
  if (action === "move-left") tutorial.movedLeft = true
  if (action === "move-right") tutorial.movedRight = true
  if (action === "inventory") tutorial.openedInventory = true
  if (action === "quests") tutorial.openedQuests = true
  if (action === "book") tutorial.openedBook = true
  if (action === "npc") tutorial.talkedToNpc = true
  if (action === "talent-check") tutorial.handledTalentCheck = true
  if (action === "combat-start") tutorial.combatStarted = true
  if (action === "combat-end") tutorial.combatFinished = true

  advanceTutorial(session)
}

function tutorialMoveAction(dx: number, dy: number): TutorialActionId {
  if (dy < 0) return "move-up"
  if (dy > 0) return "move-down"
  if (dx < 0) return "move-left"
  if (dx > 0) return "move-right"
  return "move"
}

export function currentTutorialPrompt(session: GameSession) {
  const tutorial = session.tutorial
  if (!tutorial.enabled || tutorial.completed || tutorial.disabledAfterDeath || session.deaths > 0) return null
  const coopNote = session.mode === "coop" ? " In co-op, every connected crawler must finish this checkpoint." : ""
  if (tutorial.stage === "movement") {
    const hold = tutorialGateHold(session, "movement")
    return {
      title: "Area I - Movement",
      text: `Use arrows, WASD, or Vim keys to move in each direction. Open the basic journals before the east gate unlocks.${coopNote}`,
      steps: [
        `Up ${doneText(tutorial.movedUp)}`,
        `Down ${doneText(tutorial.movedDown)}`,
        `Left ${doneText(tutorial.movedLeft)}`,
        `Right ${doneText(tutorial.movedRight)}`,
        `Pack I ${doneText(tutorial.openedInventory)}`,
        `Quests J/O ${doneText(tutorial.openedQuests)}`,
        `Book B ${doneText(tutorial.openedBook)}`,
      ],
      footer: hold ? `Waiting for ${formatCoopWaitingNames(hold.waitingNames)} before Area II opens.` : movementTutorialComplete(tutorial) ? "Gate open. Go east into Area II." : "The gate opens when every row is done.",
    }
  }
  if (tutorial.stage === "npc-check") {
    const talked = tutorial.talkedToNpc
    const hold = tutorialGateHold(session, "npc-check")
    return {
      title: "Area II - People and Artifacts",
      text: talked
        ? `Take the relic artifact. Talent checks roll d20 + stat + luck + level, and Bound relics add +1 to later checks. Enter rolls; Esc steps away.${coopNote}`
        : `Walk to the NPC and bump or press E nearby. Conversations use 1-3 to choose, Enter to confirm, and Esc to leave. NPCs remember what you already asked.${coopNote}`,
      steps: [
        `Talk to NPC ${doneText(tutorial.talkedToNpc)}`,
        `Take relic check ${doneText(tutorial.handledTalentCheck)}`,
      ],
      footer: hold ? `Waiting for ${formatCoopWaitingNames(hold.waitingNames)} before Area III opens.` : tutorial.handledTalentCheck ? "Second gate open. Go east into Area III." : "Finish the relic lesson to unlock the next gate.",
    }
  }
  if (tutorial.stage === "combat") {
    const hold = tutorialGateHold(session, "combat")
    return {
      title: "Area III - Fighting",
      text: tutorial.combatStarted
        ? `Finish the fight. Choose skills with 1-6 or up/down, Tab changes target, Enter rolls, H uses a potion, and F tries to flee.${coopNote}`
        : `Bump the enemy to start combat. Initiative locks movement until the fight is resolved.${coopNote}`,
      steps: [
        `Start combat ${doneText(tutorial.combatStarted)}`,
        `Finish combat ${doneText(tutorial.combatFinished)}`,
      ],
      footer: hold ? `Waiting for ${formatCoopWaitingNames(hold.waitingNames)} before the tutorial closes.` : tutorial.combatFinished ? "Tutorial complete. Use the stairs when ready." : "The exit stays gated until the fight is over.",
    }
  }
  return null
}

export function tutorialCoopCheckpoint(session: GameSession) {
  const tutorial = session.tutorial
  if (!tutorial.enabled || tutorial.disabledAfterDeath || session.deaths > 0) return { stage: "complete" as TutorialStageId, ready: true, completed: true }
  if (tutorial.completed || tutorial.stage === "complete") return { stage: "complete" as TutorialStageId, ready: true, completed: true }
  if (tutorial.stage === "movement") return { stage: tutorial.stage, ready: movementTutorialComplete(tutorial), completed: false }
  if (tutorial.stage === "npc-check") return { stage: tutorial.stage, ready: tutorial.talkedToNpc && tutorial.handledTalentCheck, completed: false }
  return { stage: tutorial.stage, ready: tutorial.combatStarted && tutorial.combatFinished, completed: false }
}

export function setTutorialCoopGateHold(session: GameSession, stage: Exclude<TutorialStageId, "complete"> | null, waitingNames: string[]) {
  const tutorial = session.tutorial
  if (!tutorial.enabled || tutorial.completed || tutorial.disabledAfterDeath || session.deaths > 0) return
  const names = [...new Set(waitingNames.map((name) => cleanConversationText(name, 24)).filter(Boolean))].slice(0, 4)
  tutorial.coopGateHold = stage && names.length ? { stage, waitingNames: names } : null
  advanceTutorial(session)
}

function advanceTutorial(session: GameSession) {
  const tutorial = session.tutorial
  if (!tutorial.enabled || tutorial.completed || tutorial.disabledAfterDeath || session.deaths > 0) return

  if (tutorial.stage === "movement" && movementTutorialComplete(tutorial)) {
    const hold = tutorialGateHold(session, "movement")
    if (hold) {
      pushTutorialHoldLog(session, "Area I gate", hold)
      return
    }
    tutorial.stage = "npc-check"
    tutorial.coopGateHold = null
    openTutorialGate(session, 0)
    session.log.unshift("Area I gate opens. Move east and talk to the NPC.")
    trimLog(session)
    return
  }

  if (tutorial.stage === "npc-check" && tutorial.talkedToNpc && tutorial.handledTalentCheck) {
    const hold = tutorialGateHold(session, "npc-check")
    if (hold) {
      pushTutorialHoldLog(session, "Area II gate", hold)
      return
    }
    tutorial.stage = "combat"
    tutorial.coopGateHold = null
    openTutorialGate(session, 1)
    session.log.unshift("Area II gate opens. Move east and finish the fight.")
    trimLog(session)
    return
  }

  if (tutorial.stage === "combat" && tutorial.combatStarted && tutorial.combatFinished) {
    const hold = tutorialGateHold(session, "combat")
    if (hold) {
      pushTutorialHoldLog(session, "Tutorial", hold)
      return
    }
    tutorial.stage = "complete"
    tutorial.coopGateHold = null
    tutorial.completed = true
    session.log.unshift("Tutorial complete. The descent is open.")
    trimLog(session)
  }
}

function tutorialGateMessage(session: GameSession) {
  const prompt = currentTutorialPrompt(session)
  if (!prompt || session.floor !== 1) return null
  return `${prompt.title}: ${prompt.text}`
}

function tutorialGateMessageForPoint(session: GameSession, point: Point) {
  const tutorial = session.tutorial
  if (!tutorial.enabled || tutorial.completed || tutorial.disabledAfterDeath || session.deaths > 0) return null
  const gateIndex = tutorialGateIndexForPoint(session, point)
  if (gateIndex < 0) return null
  if (gateIndex === 0 && tutorial.stage === "movement") {
    const hold = tutorialGateHold(session, "movement")
    if (hold) return `Area I gate waits for ${formatCoopWaitingNames(hold.waitingNames)}.`
    return "Area I gate is locked. Finish the movement, Pack, Quest, and Book rows first."
  }
  if (gateIndex === 1 && (tutorial.stage === "movement" || tutorial.stage === "npc-check")) {
    const hold = tutorialGateHold(session, "npc-check")
    if (hold) return `Area II gate waits for ${formatCoopWaitingNames(hold.waitingNames)}.`
    return "Area II gate is locked. Talk to the NPC and finish the relic talent check first."
  }
  return null
}

function openTutorialGate(session: GameSession, index: number) {
  const point = session.tutorial.gatePoints[index]
  if (!point) return
  for (let dy = -tutorialGateHalfSpan; dy <= tutorialGateHalfSpan; dy++) {
    const gateTile = { x: point.x, y: point.y + dy }
    const tile = tileAt(session.dungeon, gateTile)
    if (tile === "door" || tile === "wall") setTile(session.dungeon, gateTile, "floor")
  }
}

function closeTutorialGate(session: GameSession, index: number) {
  const point = session.tutorial.gatePoints[index]
  if (!point) return
  for (let dy = -tutorialGateHalfSpan; dy <= tutorialGateHalfSpan; dy++) {
    setTile(session.dungeon, { x: point.x, y: point.y + dy }, "door")
  }
}

function tutorialGateIndexForPoint(session: GameSession, point: Point) {
  if (tileAt(session.dungeon, point) !== "door") return -1
  return session.tutorial.gatePoints.findIndex(
    (gate) => point.x === gate.x && Math.abs(point.y - gate.y) <= tutorialGateHalfSpan,
  )
}

function movementTutorialComplete(tutorial: RunTutorialState) {
  const movedAllDirections = tutorial.movedUp && tutorial.movedDown && tutorial.movedLeft && tutorial.movedRight
  return (movedAllDirections || tutorial.movementSteps >= 4) && tutorial.openedInventory && tutorial.openedQuests && tutorial.openedBook
}

function tutorialGateHold(session: GameSession, stage: Exclude<TutorialStageId, "complete">) {
  const hold = session.tutorial.coopGateHold
  return hold?.stage === stage && hold.waitingNames.length ? hold : null
}

function pushTutorialHoldLog(session: GameSession, labelText: string, hold: TutorialCoopGateHold) {
  const message = `${labelText} waits for ${formatCoopWaitingNames(hold.waitingNames)}.`
  if (session.log[0] !== message) {
    session.log.unshift(message)
    trimLog(session)
  }
}

function formatCoopWaitingNames(names: string[]) {
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

function doneText(done: boolean) {
  return done ? "done" : "needed"
}

export function combatModifier(session: GameSession, stat: StatId) {
  return session.level + statModifier(session.stats[stat] + equipmentStatBonus(session, stat))
}

export function skillCheckModifier(session: GameSession, stat: StatId) {
  const primary = statModifier(session.stats[stat] + equipmentStatBonus(session, stat))
  const luck = stat === "luck" ? 0 : Math.max(0, Math.floor(statModifier(session.stats.luck + equipmentStatBonus(session, "luck")) / 2))
  return Math.floor(session.level / 2) + primary + luck + skillCheckArtifactBonus(session)
}

function skillCheckArtifactBonus(session: GameSession) {
  return session.inventory.includes("Bound relic") ? 1 : 0
}

export function currentBiome(session: GameSession) {
  return biomeAt(session, session.player)
}

function biomeAt(session: GameSession, point: Point) {
  const anchorId = nearestWorldAnchorId(session, point)
  const anchor = anchorId ? session.world.anchors.find((candidate) => candidate.id === anchorId) : null
  return anchor?.biome ?? session.world.anchors.find((candidate) => candidate.floor === session.floor)?.biome ?? "crypt"
}

export function normalizeSessionAfterLoad(session: GameSession): GameSession {
  session.stats = normalizeStats(session.hero.classId, session.stats)
  session.hero.appearance = normalizeHeroAppearance(session.hero.classId, session.hero.appearance)
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
  session.talents = normalizeTalents(session.hero.classId, session.talents)
  session.levelUp = normalizeLevelUp(session.hero.classId, session.levelUp, session.talents)
  session.conversation = normalizeConversation(session.conversation)
  session.conversationMemory = normalizeConversationMemory(session.conversationMemory)
  session.tutorial = normalizeTutorialState(session.tutorial)
  session.deaths = Math.max(0, Math.floor(Number(session.deaths) || 0))
  session.statusEffects = normalizeStatusEffects(session.statusEffects)
  session.world ??= createWorldForSeed(session.seed, session.finalFloor || defaultFinalFloor)
  session.worldLog ??= []
  session.pendingWorldGeneration = Boolean(session.pendingWorldGeneration)
  session.knowledge = normalizeKnowledge(session.knowledge)
  if (!session.knowledge.length) {
    for (const entry of initialKnowledgeEntries()) rememberKnowledge(session, entry)
  }
  session.toasts = normalizeToasts(session.toasts)
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  session.equipment = normalizeEquipment(session.equipment, session.hero.classId)
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
  const target = combatTargets(session)[session.combat.selectedTarget]
  const talentText = talentEffectTextForSkill(session, skill)
  session.combat.message = `${skill.name}: d20 ${formatSigned(modifier)} ${statAbbreviations[skill.stat]} vs DC ${skill.dc + enemyDefenseBonus(target?.kind)}. ${combatMatchupText(skill, target?.kind)} ${talentText}`.trim()
}

export function focusCostForSkill(session: GameSession, skill: CombatSkill) {
  const discount = session.talents
    .map((id) => talentDefinitions[id])
    .filter((talent) => talent?.skillId === skill.id)
    .reduce((total, talent) => total + Math.max(0, talent.focusDiscount ?? 0), 0)
  return Math.max(0, skill.cost - discount)
}

export function talentEffectTextForSkill(session: GameSession, skill: CombatSkill) {
  const effects = skillTalentEffects(session, skill)
  if (!effects.length) return ""
  return `Talent: ${effects.join("; ")}.`
}

export function compactTalentEffectTextForSkill(session: GameSession, skill: CombatSkill) {
  return skillTalentEffects(session, skill)
    .map((effect) => effect.replace(/\bdamage\b/g, "dmg").replace(/\bfocus\b/g, "focus"))
    .join("  ")
}

function skillTalentEffects(session: GameSession, skill: CombatSkill) {
  return session.talents
    .map((id) => talentDefinitions[id])
    .filter((talent) => talent?.skillId === skill.id)
    .map((talent) => {
      const parts = []
      if (talent.damageBonus) parts.push(`+${talent.damageBonus} damage`)
      if (talent.focusDiscount) parts.push(`-${talent.focusDiscount} focus`)
      return parts.length ? `${talent.name} ${parts.join(", ")}` : `${talent.name} passive`
    })
}

export function combatAffinityLabel(affinity: CombatAffinity) {
  if (affinity === "physical") return "Physical"
  if (affinity === "precision") return "Precision"
  if (affinity === "arcane") return "Arcane"
  if (affinity === "holy") return "Holy"
  if (affinity === "shadow") return "Shadow"
  return "Luck"
}

export function combatMatchupFor(skill: CombatSkill, kind: Actor["kind"] | undefined) {
  const profile = kind && isEnemyActorId(kind) ? monsterProfiles[kind] : null
  const affinity = skill.affinity
  const state: "weak" | "resisted" | "neutral" = profile?.weaknesses.includes(affinity) ? "weak" : profile?.resists.includes(affinity) ? "resisted" : "neutral"
  return {
    affinity,
    state,
    damageBonus: state === "weak" ? 2 : state === "resisted" ? -1 : 0,
  }
}

export function combatMatchupText(skill: CombatSkill, kind: Actor["kind"] | undefined) {
  const matchup = combatMatchupFor(skill, kind)
  const affinity = combatAffinityLabel(matchup.affinity)
  if (!kind || !isEnemyActorId(kind)) return `${skill.name} uses ${affinity}.`
  if (matchup.state === "weak") return `${affinity} is strong here: +2 damage if the d20 hits.`
  if (matchup.state === "resisted") return `${label(kind)} resists ${affinity}: -1 damage if it hits.`
  return `${affinity} is neutral here. Roll d20 + ${statLabels[skill.stat]} modifier against DC.`
}

export function enemyStrategyText(session: GameSession, actor: Actor | undefined, skill?: CombatSkill) {
  if (!actor || !isEnemyActorId(actor.kind)) return "Choose a target, then pick the skill tied to your best stat."
  const profile = monsterProfiles[actor.kind]
  const known = knownMonsterWeaknesses(session, actor.kind)
  const knownText = known.length
    ? `Known weak: ${known.map(combatAffinityLabel).join(", ")}.`
    : "Weakness unknown. A correct hit writes it into the Book."
  const matchup = skill ? ` ${combatMatchupText(skill, actor.kind)}` : ""
  return `${knownText} ${profile.strategy}${matchup}`
}

export function skillCheckFormulaText(session: GameSession, check: SkillCheckState) {
  const modifier = check.roll?.modifier ?? skillCheckModifier(session, check.stat)
  return `Roll d20 ${formatSigned(modifier)} vs difficulty ${check.dc}. Total >= difficulty wins; 20 always succeeds and 1 fails.`
}

export function skillCheckOutcomeText(check: SkillCheckState, success: boolean) {
  if (check.source === "chest") {
    return success ? "You got gold and a Rollback scroll. Press I to inspect inventory." : "You salvaged a Bent lockpick and gold, but took damage. Press I to inspect inventory."
  }
  if (check.source === "relic") {
    return success ? "You got a Bound relic, focus, gold, and XP. Press I to inspect inventory." : "You got a Cursed shard, but lost focus and took damage. Press I to inspect inventory."
  }
  return success ? "You got a Deploy nerve potion, healing, gold, and XP. Press I to inspect inventory." : "You salvaged a Cracked dew vial, but took damage. Press I to inspect inventory."
}

export function chooseLevelUpTalent(session: GameSession, index: number) {
  const pending = session.levelUp
  if (!pending) return null
  const choice = pending.choices[clamp(index, 0, pending.choices.length - 1)]
  if (!choice) return null
  if (!session.talents.includes(choice.id)) session.talents.push(choice.id)
  applyTalent(session, choice.id)
  session.levelUp = null
  session.log.unshift(`${choice.name} learned. ${choice.text}`)
  addToast(session, "Level up", `${choice.name} learned.`, "success")
  trimLog(session)
  return choice
}

export function grantXp(session: GameSession, amount: number) {
  if (session.status !== "running") return
  session.xp += Math.max(0, Math.floor(amount))
  maybeLevelUp(session)
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
    statModifier(session.stats.dexterity + equipmentStatBonus(session, "dexterity")) +
    Math.max(0, statModifier(session.stats.luck + equipmentStatBonus(session, "luck"))) +
    Math.max(0, Math.floor(statModifier(session.stats.endurance + equipmentStatBonus(session, "endurance")) / 2))
  )
}

export function fleeDc(session: GameSession) {
  const targets = combatTargets(session)
  const pressure = targets.reduce((highest, target) => Math.max(highest, enemyDefenseBonus(target.kind)), 0)
  return 11 + Math.floor(session.floor / 2) + pressure + Math.min(4, Math.max(0, targets.length - 1))
}

export function combatBalanceSnapshot(session: GameSession): CombatBalanceSnapshot {
  const targets = combatTargets(session)
  const visibleTargets = targets.length
    ? targets
    : nearbyHostiles(session).length
      ? nearbyHostiles(session)
      : session.dungeon.actors.filter((actor) => isEnemyActorId(actor.kind))
  const target = visibleTargets[clamp(session.combat.selectedTarget, 0, Math.max(0, visibleTargets.length - 1))]
  const skill = combatSkills[clamp(session.combat.selectedSkill, 0, combatSkills.length - 1)] ?? combatSkills[0]
  const modifier = combatModifier(session, skill.stat)
  const dc = skill.dc + (target ? enemyDefenseDcBonus(session, target) : 0)
  const hitChance = d20SuccessChance(modifier, dc)
  const fleeChance = d20SuccessChance(fleeModifier(session), fleeDc(session))
  const focusCost = focusCostForSkill(session, skill)
  const focusPressure = clamp(
    Math.round((focusCost / Math.max(1, session.maxFocus)) * 100 + (session.focus < focusCost ? 35 : 0) + Math.max(0, visibleTargets.length - 1) * 8),
    0,
    100,
  )
  const incomingDamage = visibleTargets.reduce((total, actor) => total + Math.max(0, actor.damage), 0)
  const deathRisk = clamp(
    Math.round((incomingDamage / Math.max(1, session.hp)) * 45 + Math.max(0, session.floor - 1) * 6 + Math.max(0, visibleTargets.length - 1) * 10 - Math.max(0, session.focus) * 2),
    0,
    95,
  )
  const projectedClassWinRate = clamp(
    Math.round(
      72 +
        statModifier(session.stats.vigor + equipmentStatBonus(session, "vigor")) * 2 +
        statModifier(session.stats.dexterity + equipmentStatBonus(session, "dexterity")) * 2 +
        equipmentDamageBonus(session) * 3 +
        session.level * 3 -
        deathRisk * 0.55 -
        focusPressure * 0.15,
    ),
    5,
    95,
  )
  return {
    target: target ? label(target.kind) : "No target",
    skill: skill.name,
    hitChance,
    fleeChance,
    focusPressure,
    deathRisk,
    projectedClassWinRate,
    weaknessNote: combatBalanceWeaknessNote(session, target, skill),
    focusNote: combatBalanceFocusNote(session, skill, focusCost, focusPressure),
  }
}

function d20SuccessChance(modifier: number, dc: number) {
  let wins = 0
  for (let roll = 1; roll <= 20; roll += 1) {
    if (roll === 20 || (roll !== 1 && roll + modifier >= dc)) wins += 1
  }
  return Math.round((wins / 20) * 100)
}

function combatBalanceWeaknessNote(session: GameSession, actor: Actor | undefined, skill: CombatSkill) {
  if (!actor || !isEnemyActorId(actor.kind)) return "No enemy target yet. Pick a target, then compare d20 odds and affinities."
  const profile = monsterProfiles[actor.kind]
  const known = knownMonsterWeaknesses(session, actor.kind)
  const knownText = known.length ? `Known weak: ${known.map(combatAffinityLabel).join(", ")}.` : "Weakness unknown; a correct affinity hit writes it into the Book."
  const resistText = profile.resists.length ? `Resists: ${profile.resists.map(combatAffinityLabel).join(", ")}.` : "No resistance recorded."
  return `${label(actor.kind)} vs ${skill.name}: ${knownText} ${resistText} ${combatMatchupText(skill, actor.kind)}`
}

function combatBalanceFocusNote(session: GameSession, skill: CombatSkill, focusCost: number, pressure: number) {
  if (session.focus < focusCost) return `${skill.name} needs ${focusCost} focus; rest, use a vial, or choose a cheaper move.`
  if (pressure >= 55) return `Focus pressure ${pressure}%. Save high-cost skills for weakness hits or guarded turns.`
  return `Focus pressure ${pressure}%. Current focus can support ${skill.name} safely.`
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
    const stunTurns = targets.map((target) => applyFleeStun(session, target))
    const longestStun = Math.max(...stunTurns, 0)
    const stunText = longestStun > 1 ? ` Enemies lose ${longestStun} turns.` : " Enemies hesitate for a turn."
    endCombat(session, (escape ? "You break away from the fight." : "You slip initiative, but the room is tight.") + stunText)
    session.turn += 1
    revealAroundPlayer(session)
    trimLog(session)
  } else {
    session.combat.message = `Flee fails: d20 ${d20}${formatSigned(modifier)} vs DC ${dc}.`
    session.log.unshift(session.combat.message)
    addToast(session, "Flee failed", `d20 ${d20}${formatSigned(modifier)} vs DC ${dc}.`, "danger")
    finishCombatRound(session, true)
  }

  return roll
}

export function performCombatAction(session: GameSession) {
  if (session.status !== "running" || !session.combat.active) return
  if (session.levelUp) {
    session.combat.message = "Choose a level-up talent before acting."
    session.log.unshift(session.combat.message)
    trimLog(session)
    return
  }
  const targets = combatTargets(session)
  const target = targets[session.combat.selectedTarget]
  if (!target) return

  const skill = combatSkills[session.combat.selectedSkill]
  const focusCost = focusCostForSkill(session, skill)
  if (session.focus < focusCost) {
    session.combat.message = "Not enough focus for that skill."
    session.log.unshift(session.combat.message)
    trimLog(session)
    return
  }

  session.focus -= focusCost
  const d20 = rollD20(session, skill, target)
  const modifier = combatModifier(session, skill.stat)
  const total = d20 + modifier
  const dc = skill.dc + enemyDefenseDcBonus(session, target)
  const critical = d20 === 20
  const hit = critical || (d20 !== 1 && total >= dc)
  const damageBonus = Math.max(0, statModifier(session.stats[skill.stat] + equipmentStatBonus(session, skill.stat)))
  const talentDamage = talentDamageBonus(session, skill)
  const gearDamage = equipmentDamageBonus(session)
  const baseDamage = critical ? skill.damage + session.level + damageBonus + talentDamage + gearDamage + 3 : skill.damage + Math.floor(session.level / 2) + Math.floor(damageBonus / 2) + talentDamage + gearDamage
  const targetMatchup = combatMatchupFor(skill, target.kind)
  const damage = Math.max(1, baseDamage + targetMatchup.damageBonus)

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
    affinity: skill.affinity,
    matchup: targetMatchup.state,
  }

  let pendingWeaknessToast: { kind: EnemyActorId; affinity: CombatAffinity } | null = null
  if (hit) {
    const affectedTargets = skill.area === "all" ? [...targets] : [target]
    const appliedEffects: StatusEffect[] = []
    const phaseMessages: string[] = []
    const weaknessDiscoveries: Array<{ kind: EnemyActorId; affinity: CombatAffinity }> = []
    for (const affected of affectedTargets) {
      const matchup = combatMatchupFor(skill, affected.kind)
      const nextDamage = affected.id === target.id ? Math.max(1, baseDamage + matchup.damageBonus) : Math.max(1, Math.floor(baseDamage / 2) + matchup.damageBonus)
      affected.hp -= nextDamage
      if (matchup.state === "weak" && isEnemyActorId(affected.kind) && rememberMonsterWeakness(session, affected.kind, matchup.affinity)) {
        weaknessDiscoveries.push({ kind: affected.kind, affinity: matchup.affinity })
      }
      const appliedEffect = applyCombatSkillEffect(session, skill, affected)
      if (appliedEffect) appliedEffects.push(appliedEffect)
      const phaseMessage = maybeAdvanceBossPhase(session, affected)
      if (phaseMessage) phaseMessages.push(phaseMessage)
    }
    const targetText = affectedTargets.length > 1 ? `${affectedTargets.length} targets` : label(target.kind)
    const effectText = appliedEffects.length ? ` ${appliedEffects[0].label} applied.` : ""
    const phaseText = phaseMessages.length ? ` ${phaseMessages[0]}` : ""
    const matchupText = targetMatchup.state === "weak" ? ` ${combatAffinityLabel(skill.affinity)} weakness exploited.` : targetMatchup.state === "resisted" ? ` ${label(target.kind)} resists ${combatAffinityLabel(skill.affinity)}.` : ""
    session.combat.message = `${skill.name} hits ${targetText} for ${damage}.${matchupText}${effectText}${phaseText}`
    session.log.unshift(`d20 ${d20}${formatSigned(modifier)} vs DC ${dc}: hit.`)
    addToast(session, critical ? "Critical hit" : "Attack hit", `${skill.name}: ${total}/${dc} against ${targetText}. ${combatAffinityLabel(skill.affinity)} ${targetMatchup.state}.`, "success")
    const discovered = weaknessDiscoveries[0]
    if (discovered) pendingWeaknessToast = discovered
    for (const affected of affectedTargets) {
      if (affected.hp <= 0 && session.dungeon.actors.includes(affected)) defeatActor(session, affected)
    }
  } else {
    session.combat.message = `${skill.name} misses ${label(target.kind)}.`
    session.log.unshift(`d20 ${d20}${formatSigned(modifier)} vs DC ${dc}: miss.`)
    addToast(session, "Attack missed", `${skill.name}: ${total}/${dc} against ${label(target.kind)}. ${combatAffinityLabel(skill.affinity)} would be ${targetMatchup.state}.`, "warning")
  }

  if (combatTargets(session).length > 0) finishCombatRound(session, true)
  else {
    endCombat(session, "The room falls silent.")
    finishCombatRound(session, false)
  }
  if (pendingWeaknessToast) {
    addToast(session, "Weakness found", `${label(pendingWeaknessToast.kind)} is weak to ${combatAffinityLabel(pendingWeaknessToast.affinity)}. Open B Book for the monster note.`, "success")
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
  for (const actorId of actorIds) {
    const actor = session.dungeon.actors.find((candidate) => candidate.id === actorId)
    if (actor) rememberMonsterSeen(session, actor)
  }
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
  const bossLine = actors.map((actor) => bossStoryLine(actor, session.floor)).find(Boolean)
  if (bossLine) {
    session.log.unshift(bossLine)
    addToast(session, "Boss encounter", bossLine, "warning")
  }
  recordTutorialAction(session, "combat-start")
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
  addToast(session, "Fight over", message, "success")
  recordTutorialAction(session, "combat-end")
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
  if (isBossActorId(actor.kind)) {
    rememberKnowledge(session, {
      id: `boss-${actor.kind}-floor-${session.floor}`,
      title: `${label(actor.kind)} Defeated`,
      text: `The ${label(actor.kind)} fell on floor ${session.floor}. Something beyond the dungeon felt closer to opening.`,
      kind: "note",
      floor: session.floor,
    })
    applyBossAftermath(session, actor.kind)
  }
}

function applyBossAftermath(session: GameSession, kind: Actor["kind"]) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  const bossName = label(kind)
  const memory = `${bossName} memory`
  if (!session.inventory.includes(memory)) session.inventory.unshift(memory)
  gainNpcTrust(session, "cartographer", 2, false)
  gainNpcTrust(session, "guildmaster", 2, false)
  const customers = session.hub.village.customers.length ? session.hub.village.customers : createVillageCustomers()
  session.hub.village.customers = customers.map((customer, index) => ({
    ...customer,
    taste: index % 2 === 0 ? "memory" : customer.taste === "food" ? "relic" : customer.taste,
    patience: clamp(customer.patience + (index === 0 ? 2 : 1), 0, 5),
  }))
  const shopDemand = `Aftermath: customers want boss memories and relic loot after ${bossName} fell.`
  session.hub.village.shopLog.unshift(shopDemand)
  session.hub.village.shopLog = session.hub.village.shopLog.slice(0, 8)
  const cropPulse = Math.max(1, Math.min(3, session.floor + 1))
  session.hub.farm.ready = clamp(session.hub.farm.ready + cropPulse, 0, session.hub.farm.plots + session.hub.farm.sprinklers + cropPulse)
  session.hub.relationshipLog.unshift(`${bossName} aftermath changed village demand, portal light, and ${cropPulse} farm crop${cropPulse === 1 ? "" : "s"}.`)
  trimHubLog(session.hub)
  session.hub.village.schedules = session.hub.village.schedules.map((schedule) => {
    if (schedule.npc === "cartographer") return { ...schedule, text: "Venn is marking the boss aftermath route near the portal." }
    if (schedule.npc === "guildmaster") return { ...schedule, text: "Iris is collecting final-gate reports at the Guildhall." }
    return schedule
  })
  rememberKnowledge(session, {
    id: `boss-aftermath-${kind}-floor-${session.floor}`,
    title: `${bossName} Aftermath`,
    text: `${bossName} changed the village economy. Memory collectors pay more attention to boss memories, the portal room glows differently, farm crops wake early, and the next market visit should test relic and memory demand.`,
    kind: "hub",
    floor: session.floor,
  })
  addToast(session, "Village aftermath", "Boss memory demand changed. Visit the market or Book.", "info")
}

function villageBossMemory(session: GameSession) {
  return session.inventory.find((item) => item.endsWith(" memory")) ?? null
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

function monsterKnowledgeId(kind: EnemyActorId) {
  return `monster-${kind}`
}

function rememberMonsterSeen(session: GameSession, actor: Actor) {
  const kind = actor.kind
  if (!isEnemyActorId(kind)) return null
  const existing = session.knowledge.find((entry) => entry.id === monsterKnowledgeId(kind))
  if (existing) return existing
  return rememberKnowledge(session, monsterKnowledgeEntry(kind, []))
}

function rememberMonsterWeakness(session: GameSession, kind: EnemyActorId, affinity: CombatAffinity) {
  const profile = monsterProfiles[kind]
  if (!profile.weaknesses.includes(affinity)) return false
  const known = new Set(knownMonsterWeaknesses(session, kind))
  const alreadyKnown = known.has(affinity)
  known.add(affinity)
  rememberKnowledge(session, monsterKnowledgeEntry(kind, [...known]))
  if (!alreadyKnown) session.log.unshift(`Monster note updated: ${label(kind)} is weak to ${combatAffinityLabel(affinity)}.`)
  return !alreadyKnown
}

function knownMonsterWeaknesses(session: GameSession, kind: EnemyActorId) {
  const entry = session.knowledge.find((candidate) => candidate.id === monsterKnowledgeId(kind))
  const match = (entry?.text ?? "").match(/Known weakness: ([^.]+)/)
  const knownText = match?.[1] ?? ""
  if (!knownText || knownText.includes("unknown")) return []
  return monsterProfiles[kind].weaknesses.filter((affinity) => knownText.includes(combatAffinityLabel(affinity)))
}

function monsterKnowledgeEntry(kind: EnemyActorId, knownWeaknesses: CombatAffinity[]): Omit<KnowledgeEntry, "discoveredAtTurn"> {
  const profile = monsterProfiles[kind]
  const weaknessText = knownWeaknesses.length ? `Known weakness: ${knownWeaknesses.map(combatAffinityLabel).join(", ")}.` : "Known weakness: unknown. Hit with the right attack to reveal it."
  const resistText = profile.resists.length ? `Resists: ${profile.resists.map(combatAffinityLabel).join(", ")}.` : "Resists: none found."
  return {
    id: monsterKnowledgeId(kind),
    title: `${label(kind)} Monstrary`,
    kind: "monster",
    text: `${profile.family}. ${profile.behavior} Strategy: ${profile.strategy} ${weaknessText} ${resistText} Lore: ${profile.lore}`,
  }
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
  rememberKnowledge(session, skillCheckKnowledgeEntry(check.source, session.floor, roll.success))
  const outcome = skillCheckOutcomeText(check, roll.success)
  session.log.unshift(`${check.title}: ${roll.success ? "success" : "failure"} (${roll.total}/${roll.dc}). ${outcome}`)
  addToast(session, roll.success ? "Talent check succeeded" : "Talent check failed", `${check.title}: ${roll.total}/${roll.dc}. ${outcome}`, roll.success ? "success" : "danger")
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
  addToast(session, "Trap sprung", `${damage} damage. The room remembers your step.`, "danger")
  completeWorldProgress(session, "interaction", point, `Trap sprung on floor ${session.floor}.`)
}

function collectKnowledgePickup(session: GameSession, point: Point, kind: KnowledgeCollectibleTile) {
  setTile(session.dungeon, point, "floor")
  const entry = rememberKnowledge(session, collectibleKnowledgeEntry(kind, session.floor, `${session.floor}-${point.x}-${point.y}`))
  session.xp += 1
  const labelText = knowledgeCollectibleLabel(kind)
  session.log.unshift(entry ? `${labelText} added to Book: ${entry.title}.` : `${labelText} already known.`)
  addToast(session, `${labelText} found`, entry ? `${entry.title} added to the Book.` : "The Book already has this entry.", "info")
  applyCollectibleMetaProgress(session, kind)
  completeWorldProgress(session, "interaction", point, `Recovered ${labelText.toLowerCase()} on floor ${session.floor}.`)
  maybeLevelUp(session)
}

function unlockDoor(session: GameSession, point: Point) {
  setTile(session.dungeon, point, "floor")
  const secret = session.dungeon.secrets?.find((candidate) => samePoint(candidate.door, point))
  if (secret && !secret.discovered) {
    secret.discovered = true
    session.log.unshift("Locked door opens. A secret room breathes out.")
    addToast(session, "Secret found", "A hidden room opens behind the door.", "success")
    completeWorldProgress(session, "interaction", point, `Secret room ${secret.id} discovered.`)
    return
  }

  session.log.unshift("Locked door opens.")
  addToast(session, "Door opened", "The lock gives way.", "info")
  completeWorldProgress(session, "interaction", point, "Locked door opened.")
}

function startConversation(session: GameSession, actor: Actor): ConversationState {
  const kind = isNpcActorId(actor.kind) ? actor.kind : "cartographer"
  const dialog = localNpcStoryDialog(kind, session.floor)
  const conversation: ConversationState = {
    id: `${actor.id}-${session.turn}`,
    actorId: actor.id,
    kind,
    speaker: dialog.speaker,
    text: dialog.text,
    status: "open",
    options: dialog.options,
    selectedOption: 0,
    trade: kind === "merchant" ? { item: "Merchant salve", price: 12, purchased: false } : undefined,
  }

  session.conversation = conversation
  recordTutorialAction(session, "npc")
  session.log.unshift(`${conversation.speaker}: ${conversation.text}`)
  rememberKnowledge(session, {
    id: `npc-${kind}-floor-${session.floor}`,
    title: conversation.speaker,
    text: conversation.text,
    kind: "npc",
    floor: session.floor,
  })
  completeWorldProgress(session, kind === "merchant" ? "interaction" : "quest", actor.position, `${conversation.speaker} shared a lead.`)
  trimLog(session)
  return conversation
}

export function cycleConversationOption(session: GameSession, delta: number) {
  const conversation = session.conversation
  if (!conversation?.options.length) return null
  conversation.selectedOption = wrap(conversation.selectedOption + delta, conversation.options.length)
  return conversation.options[conversation.selectedOption]
}

export function chooseConversationOption(session: GameSession, index = session.conversation?.selectedOption ?? 0): ConversationState | null {
  const conversation = session.conversation
  if (!conversation || conversation.status === "completed") return conversation
  const option = conversation.options[clamp(index, 0, Math.max(0, conversation.options.length - 1))]
  if (!option) return conversation

  conversation.selectedOption = clamp(index, 0, Math.max(0, conversation.options.length - 1))
  if (conversationOptionAlreadyHandled(session, conversation, option.id)) {
    conversation.text = repeatedConversationText(conversation, option)
    conversation.status = "completed"
    session.log.unshift(`${conversation.speaker}: ${conversation.text}`)
    addToast(session, "Already asked", `${conversation.speaker} has answered ${option.label.toLowerCase()}.`, "info")
    trimLog(session)
    return conversation
  }

  conversation.text = option.text
  applyConversationOption(session, conversation, option.id)
  if (option.id !== "trade") rememberConversationOption(session, conversation, option.id)
  session.log.unshift(`${conversation.speaker}: ${conversation.text}`)
  if (option.id !== "leave") {
    rememberKnowledge(session, {
      id: `npc-${conversation.kind}-${option.id}-floor-${session.floor}`,
      title: `${conversation.speaker}: ${option.label}`,
      text: option.text,
      kind: "npc",
      floor: session.floor,
    })
    addToast(session, "Book updated", `${conversation.speaker}: ${option.label}.`, "info")
  }
  trimLog(session)
  return conversation
}

export function applyOpeningStoryBranch(session: GameSession, branchId: string): string {
  const branches = openingStoryBranches(session.hero.name)
  const branch = branches.find((option) => option.id === branchId) ?? branches[0]
  if (!branch) return "The first memory fades."

  if (branch.id === "follow-voice") {
    session.xp += 1
    completeWorldProgress(session, "quest", session.player, "Followed the first voice from the waking cell.")
  }

  if (branch.id === "read-ledger") {
    if (!session.inventory.includes("Ledger scrap")) session.inventory.unshift("Ledger scrap")
    rememberKnowledge(session, {
      id: "memory-ledger-scrap",
      title: "Ledger Scrap",
      text: "The waking-cell ledger names rooms before you find them. Someone has repeated this opening enough to annotate it.",
      kind: "memory",
      floor: session.floor,
    })
  }

  if (branch.id === "check-wound") session.focus = Math.min(session.maxFocus, session.focus + 1)

  session.log.unshift(branch.text)
  addToast(session, "Opening choice", branch.text, "info")
  trimLog(session)
  return branch.text
}

function continueConversation(session: GameSession): ConversationState | null {
  const conversation = session.conversation
  if (!conversation) return null

  if (conversation.status === "completed") {
    session.conversation = null
    session.log.unshift(`${conversation.speaker} returns to the dark.`)
    trimLog(session)
    return null
  }

  if (conversation.trade && !conversation.trade.purchased) {
    if (conversationOptionAlreadyHandled(session, conversation, "trade")) {
      conversation.status = "completed"
      conversation.text = `You already bought ${conversation.trade.item} from me this descent. Come back after another run.`
      session.log.unshift(`${conversation.speaker}: ${conversation.text}`)
      addToast(session, "Already traded", conversation.trade.item, "info")
      trimLog(session)
      return conversation
    }

    if (session.gold >= conversation.trade.price) {
      session.gold -= conversation.trade.price
      session.inventory.unshift(conversation.trade.item)
      conversation.trade.purchased = true
      conversation.status = "completed"
      conversation.text = `${conversation.trade.item} purchased for ${conversation.trade.price} gold.`
      rememberConversationOption(session, conversation, "trade")
      session.log.unshift(`${conversation.speaker}: ${conversation.text}`)
      addToast(session, "Trade complete", `${conversation.trade.item} added to your pack.`, "success")
      const actor = session.dungeon.actors.find((candidate) => candidate.id === conversation.actorId)
      completeWorldProgress(session, "loot", actor?.position ?? session.player, `${conversation.speaker} completed a merchant trade.`)
      trimLog(session)
      return conversation
    }

    conversation.status = "completed"
    conversation.text = `${conversation.trade.price} gold needed for ${conversation.trade.item}.`
    session.log.unshift(`${conversation.speaker}: ${conversation.text}`)
    addToast(session, "Trade failed", `${conversation.trade.price} gold needed.`, "warning")
    trimLog(session)
    return conversation
  }

  if (conversation.status === "open") return chooseConversationOption(session, conversation.selectedOption)
  return null
}

function applyConversationOption(session: GameSession, conversation: ConversationState, optionId: string) {
  const actor = session.dungeon.actors.find((candidate) => candidate.id === conversation.actorId)
  if (optionId === "trade") return
  if (optionId === "heal") session.hp = session.maxHp
  if (optionId === "blessing") session.focus = Math.min(session.maxFocus, session.focus + 3)
  if (optionId === "key") session.inventory.unshift("Bent lockpick")
  if (optionId === "map" || optionId === "route" || optionId === "rumor" || optionId === "warning" || optionId === "lore" || optionId === "advice") session.xp += 1
  if (optionId !== "leave") completeWorldProgress(session, "quest", actor?.position ?? session.player, `${conversation.speaker}: ${optionId}.`)
  conversation.status = optionId === "trade" ? "open" : "completed"
  if (optionId !== "trade") maybeLevelUp(session)
}

function conversationMemoryKey(conversation: Pick<ConversationState, "actorId" | "kind">, floor: number) {
  return `${floor}:${conversation.actorId}:${conversation.kind}`
}

function conversationOptionAlreadyHandled(session: GameSession, conversation: ConversationState, optionId: string) {
  if (optionId === "leave") return false
  return session.conversationMemory[conversationMemoryKey(conversation, session.floor)]?.askedOptionIds.includes(optionId) ?? false
}

function rememberConversationOption(session: GameSession, conversation: ConversationState, optionId: string) {
  if (optionId === "leave") return
  const key = conversationMemoryKey(conversation, session.floor)
  const memory = session.conversationMemory[key] ?? {
    actorId: conversation.actorId,
    askedOptionIds: [],
    floor: session.floor,
    kind: conversation.kind,
  }
  if (!memory.askedOptionIds.includes(optionId)) memory.askedOptionIds.push(optionId)
  session.conversationMemory[key] = memory
}

function repeatedConversationText(conversation: ConversationState, option: ConversationOption) {
  if (option.id === "rumor") return "You already asked for that rumor. Keep the first answer close; repeated whispers get worse."
  if (option.id === "trade") return "That trade is already done for this descent."
  return `You already asked about ${option.label.toLowerCase()}. I do not have a better answer until the dungeon changes.`
}

function adjacentNpc(session: GameSession) {
  return cardinalNeighbors(session.player)
    .map((point) => actorAt(session.dungeon.actors, point))
    .find((actor): actor is Actor => Boolean(actor && isNpcActorId(actor.kind))) ?? null
}

function isSkillCheckSource(tile: string): tile is SkillCheckSource {
  return tile === "potion" || tile === "relic" || tile === "chest"
}

type KnowledgeCollectibleTile = "note" | "recipe" | "tool" | "deed" | "fossil" | "boss-memory" | "keepsake" | "story-relic"

function isKnowledgeCollectible(tile: string): tile is KnowledgeCollectibleTile {
  return tile === "note" || tile === "recipe" || tile === "tool" || tile === "deed" || tile === "fossil" || tile === "boss-memory" || tile === "keepsake" || tile === "story-relic"
}

function knowledgeCollectibleLabel(kind: KnowledgeCollectibleTile) {
  if (kind === "recipe") return "Recipe"
  if (kind === "tool") return "Tool part"
  if (kind === "deed") return "Village deed"
  if (kind === "fossil") return "Fossil"
  if (kind === "boss-memory") return "Boss memory"
  if (kind === "keepsake") return "Friendship keepsake"
  if (kind === "story-relic") return "AI Admin story relic"
  return "Recovered note"
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
  if (session.xp < needed || session.levelUp) return
  session.xp -= needed
  session.level += 1
  applyLevelGrowth(session.hero.classId, session.stats, session.level)
  session.maxHp = derivedMaxHp(session.stats)
  session.maxFocus = derivedMaxFocus(session.stats)
  session.hp = Math.min(session.maxHp, session.hp + 4)
  session.focus = session.maxFocus
  const choices = levelUpChoices(session)
  session.levelUp = choices.length ? { level: session.level, choices } : null
  session.log.unshift(choices.length ? `Level ${session.level}. Choose a talent.` : `Level ${session.level}. The oath hardens.`)
  addToast(session, `Level ${session.level}`, choices.length ? "Choose a new talent." : "Stats increased.", "success")
}

function levelUpChoices(session: GameSession): LevelUpChoice[] {
  const classBranch = session.level >= 4 ? classAdvancedTalentIds[session.hero.classId] : classTalentIds[session.hero.classId]
  const utilityBranch = session.level >= 4 ? "boss-breaker" : session.level >= 3 ? "relic-savant" : "deep-breath"
  const survivalBranch = session.level % 2 === 0 ? "quick-hands" : "hard-lessons"
  const ids: TalentId[] = [classBranch, utilityBranch, survivalBranch]
  return ids
    .filter((id, index, list) => !session.talents.includes(id) && list.indexOf(id) === index)
    .map((id) => talentChoice(id))
    .slice(0, 3)
}

function talentChoice(id: TalentId): LevelUpChoice {
  const talent = talentDefinitions[id]
  return {
    id,
    name: talent.name,
    text: talent.text,
  }
}

function applyTalent(session: GameSession, id: TalentId) {
  const talent = talentDefinitions[id]
  for (const [stat, value] of Object.entries(talent.statBonuses ?? {}) as Array<[keyof HeroStats, number]>) {
    session.stats[stat] += value
  }
  session.maxHp = derivedMaxHp(session.stats)
  session.maxFocus = derivedMaxFocus(session.stats)
  session.hp = Math.min(session.maxHp, session.hp + 3)
  session.focus = Math.min(session.maxFocus, session.focus + 2)
}

function talentDamageBonus(session: GameSession, skill: CombatSkill) {
  return session.talents
    .map((id) => talentDefinitions[id])
    .filter((talent) => talent?.skillId === skill.id)
    .reduce((total, talent) => total + Math.max(0, talent.damageBonus ?? 0), 0)
}

function talentRestFocusBonus(session: GameSession) {
  return session.talents.map((id) => talentDefinitions[id]).reduce((total, talent) => total + Math.max(0, talent.restFocusBonus ?? 0), 0)
}

function descend(session: GameSession) {
  if (session.floor >= session.finalFloor) {
    session.status = "victory"
    session.log.unshift(victoryStoryText())
    rememberKnowledge(session, {
      id: "ending-first-clear",
      title: "The Road Home",
      text: victoryStoryText(),
      kind: "hub",
      floor: session.floor,
    })
    addToast(session, "Dungeon cleared", "The road home and portal room can open after this run.", "success")
    unlockHub(session, "The final gate opened and the village route became stable.")
    recordChallengeResult(session)
    return
  }
  const shouldShowTutorialHandoff = session.tutorial.enabled && session.tutorial.completed && !session.tutorial.handoffShown && session.deaths === 0
  session.floor += 1
  session.dungeon = createDungeon(session.seed, session.floor)
  session.floorModifier = floorModifierFor(session.seed, session.floor)
  applyStrategicDescentPressure(session)
  session.player = { ...session.dungeon.playerStart }
  recordChallengeTrail(session, `floor-${session.floor}`)
  session.visible = new Set()
  session.seen = new Set()
  session.hp = Math.min(session.maxHp, session.hp + 3)
  session.focus = Math.min(session.maxFocus, session.focus + 2)
  revealAroundPlayer(session)
  completeWorldProgress(session, "biome", session.player, `Reached floor ${session.floor}.`)
  const plan = floorTacticalPlan(session.floor)
  session.log.unshift(`Floor ${session.floor}: ${plan.title}. ${session.floorModifier.name}: ${session.floorModifier.text}`)
  rememberKnowledge(session, floorKnowledgeEntry(session.floor))
  addToast(session, plan.title, plan.finalGateClue, "info")
  if (shouldShowTutorialHandoff) applyPostTutorialHandoff(session)
}

function applyPostTutorialHandoff(session: GameSession) {
  session.tutorial.handoffShown = true
  const text = `You are on your own now. Find stairs, survive to Floor ${session.finalFloor}, and open the road home.`
  focusFinalGateQuest(session)
  session.log.unshift(text)
  rememberKnowledge(session, {
    id: "post-tutorial-handoff",
    title: "Find the Final Gate",
    text,
    kind: "tutorial",
    floor: session.floor,
  })
  addToast(session, "Find the Final Gate", text, "info")
}

function applyTutorialOffStart(session: GameSession) {
  const text = `Tutorial is off. Find stairs, survive to Floor ${session.finalFloor}, and open the road home.`
  focusFinalGateQuest(session)
  session.log.unshift(text)
  rememberKnowledge(session, {
    id: "tutorial-off-start",
    title: "Tutorial Skipped",
    text,
    kind: "tutorial",
    floor: session.floor,
  })
  addToast(session, "Find the Final Gate", text, "info")
}

function focusFinalGateQuest(session: GameSession) {
  const existing = session.world.quests.find((quest) => quest.id === "quest-final-gate")
  const objectiveEventIds = session.world.events
    .filter((event) => event.status !== "completed" && worldEventFloor(session, event) >= session.floor && (event.type === "boss" || event.type === "quest"))
    .slice(-4)
    .map((event) => event.id)
  const fallbackEventIds = session.world.events
    .filter((event) => event.status !== "completed" && worldEventFloor(session, event) >= session.floor)
    .slice(-4)
    .map((event) => event.id)
  const finalGateEventIds = objectiveEventIds.length ? objectiveEventIds : fallbackEventIds
  const summary = `The tutorial is over. Descend through the remaining floors, survive to Floor ${session.finalFloor}, and open the road home.`

  if (existing) {
    existing.title = "Find the Final Gate"
    existing.summary = summary
    existing.status = "active"
    existing.objectiveEventIds = finalGateEventIds
    return
  }

  session.world.quests.unshift({
    id: "quest-final-gate",
    title: "Find the Final Gate",
    summary,
    status: "active",
    objectiveEventIds: finalGateEventIds,
    rewardEntityIds: [],
    triggerEventIds: [],
  })
}

function worldEventFloor(session: GameSession, event: WorldEvent) {
  return session.world.anchors.find((anchor) => anchor.id === event.anchorId)?.floor ?? session.floor
}

function advanceTurn(session: GameSession) {
  session.turn += 1
  tickStatusEffects(session)
  if (!session.combat.active) moveEnemies(session)
  revealAroundPlayer(session)
  if (session.hp <= 0) markPlayerDeath(session)
  trimLog(session)
}

function moveEnemies(session: GameSession) {
  for (const [index, actor] of [...session.dungeon.actors].entries()) {
    if (!isEnemyActorId(actor.kind)) continue
    const ai = ensureEnemyAi(actor, index, session.floor)
    if (ai.stunnedTurns && ai.stunnedTurns > 0) {
      ai.stunnedTurns -= 1
      if (ai.stunnedTurns === 0) ai.alerted = false
      continue
    }

    const distance = manhattan(actor.position, session.player)
    if (distance === 1) {
      startCombat(session, [actor])
      return
    }

    if (canSensePlayer(session, actor, ai)) {
      ai.alerted = true
      ai.chaseTurns = Math.max(1, ai.chaseTurns || 0)
    } else if (ai.alerted && distance > ai.leashRadius) {
      ai.alerted = false
      ai.chaseTurns = 0
    }

    if (ai.alerted) {
      ai.chaseTurns = (ai.chaseTurns || 0) + 1
      if (distance > ai.aggroRadius && (ai.chaseTurns || 0) >= enemyChasePatience(actor.kind)) {
        ai.alerted = false
        ai.chaseTurns = 0
        session.log.unshift(`${label(actor.kind)} loses your trail.`)
      }
    }

    if (ai.alerted && enemyCanRangedAttack(actor) && distance <= enemyRangedRange(actor.kind) && hasLineOfSight(session, actor.position)) {
      startCombat(session, [actor])
      return
    }

    const step = ai.alerted ? (enemyShouldRetreat(actor) ? retreatStep(session, actor) : chaseStep(session, actor)) : patrolStep(session, actor, index)
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
  if (session.hp <= 0) markPlayerDeath(session)
  combatTargets(session)
  if (session.status === "running" && session.combat.active && session.combat.actorIds.length === 0) endCombat(session, "The room falls silent.")
  trimLog(session)
}

function markPlayerDeath(session: GameSession) {
  if (session.status === "dead") return
  session.hp = 0
  session.status = "dead"
  session.deaths += 1
  if (session.tutorial.enabled && !session.tutorial.completed) {
    session.tutorial.disabledAfterDeath = true
    session.tutorial.enabled = false
  }
  session.log.unshift(`You fall beneath the dungeon's build. Deaths this run: ${session.deaths}.`)
  addToast(session, "Run ended", `Deaths this run: ${session.deaths}.`, "danger")
  recordChallengeResult(session)
}

function combatEnemyTurn(session: GameSession) {
  for (const actor of combatTargetsInInitiativeOrder(session)) {
    const ai = ensureEnemyAi(actor, 0, session.floor)
    if (ai.stunnedTurns && ai.stunnedTurns > 0) {
      ai.stunnedTurns -= 1
      session.log.unshift(`${label(actor.kind)} is staggered and loses the turn.`)
      continue
    }
    ai.alerted = true
    ai.chaseTurns = (ai.chaseTurns || 0) + 1
    const distance = manhattan(actor.position, session.player)
    if (enemyShouldRetreat(actor) && distance <= 3) {
      const step = retreatStep(session, actor)
      if (step) {
        actor.position = step
        session.log.unshift(`${label(actor.kind)} flees to keep distance.`)
        continue
      }
    }

    if (distance === 1) {
      applyEnemyDamage(session, actor, "hits", false)
      continue
    }

    if (enemyCanRangedAttack(actor) && distance <= enemyRangedRange(actor.kind) && hasLineOfSight(session, actor.position)) {
      applyEnemyDamage(session, actor, "fires from range", true)
      continue
    }

    const step = chaseStep(session, actor)
    if (step) actor.position = step
  }
}

function applyEnemyDamage(session: GameSession, actor: Actor, verb: string, ranged: boolean) {
  const baseDamage = Math.max(1, actor.damage - (ranged ? 1 : 0))
  const weakened = statusEffectMagnitude(session, actor.id, "weakened")
  const guardEffects = statusEffectsFor(session, "player").filter((effect) => effect.id === "guarded")
  const guarded = guardEffects.reduce((total, effect) => total + effect.magnitude, 0)
  const damage = Math.max(0, baseDamage - weakened - guarded)
  const blocked = Math.max(0, baseDamage - weakened - damage)
  session.hp -= damage
  const reduction = baseDamage === damage ? "" : ` (${baseDamage - damage} blocked by status)`
  session.log.unshift(`${label(actor.kind)} ${verb} for ${damage}${reduction}.`)
  if (blocked > 0) session.log.unshift(`Block reaction absorbs ${blocked}.`)
  if (guardEffects.some((effect) => effect.source === "Lucky Riposte")) {
    actor.hp -= 1
    session.log.unshift(`Riposte reaction clips ${label(actor.kind)} for 1.`)
    if (actor.hp <= 0 && session.dungeon.actors.includes(actor)) defeatActor(session, actor)
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
  const telegraph = bossPhaseTelegraph(actor)
  const message = `${bossStoryLine(actor, session.floor, 2) || `${label(actor.kind)} enters phase 2.`} ${telegraph}`
  session.log.unshift(message)
  rememberKnowledge(session, {
    id: `boss-phase-${actor.kind}-floor-${session.floor}-phase-${actor.phase}`,
    title: `${label(actor.kind)} Phase ${actor.phase}`,
    text: `${label(actor.kind)} changed tactics at half health. ${telegraph} Keep focus for weakness hits and use flee only if the odds are better than trading another round.`,
    kind: "monster",
    floor: session.floor,
  })
  addToast(session, "Boss phase", message, "warning")
  return message
}

function bossPhaseTelegraph(actor: Actor) {
  if (actor.kind === "grave-root-boss") return "Telegraph: roots glow amber before a heavier lash; Holy and Arcane hits are the safest finishers."
  return `Telegraph: ${label(actor.kind)} gets faster and hits harder after half health.`
}

function tickStatusEffects(session: GameSession) {
  if (!session.statusEffects?.length) return

  for (const effect of [...session.statusEffects]) {
    if (effect.id !== "burning" && effect.id !== "poisoned") continue
    const verb = effect.id === "poisoned" ? "takes poison" : "burns"
    if (effect.targetId === "player") {
      session.hp -= effect.magnitude
      session.log.unshift(`${effect.id === "poisoned" ? "Poison" : "Burning"} deals ${effect.magnitude}.`)
      continue
    }

    const actor = session.dungeon.actors.find((candidate) => candidate.id === effect.targetId)
    if (!actor) continue
    actor.hp -= effect.magnitude
    session.log.unshift(`${label(actor.kind)} ${verb} for ${effect.magnitude}.`)
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
  const fallback = localNpcStoryDialog(kind, 1)
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
    speaker: cleanConversationText(conversation.speaker || fallback.speaker, 48),
    text: cleanConversationText(conversation.text || fallback.text, 180),
    status: conversation.status === "completed" ? "completed" : "open",
    options: normalizeConversationOptions(kind, conversation.options),
    selectedOption: clamp(Math.floor(Number(conversation.selectedOption) || 0), 0, 2),
    trade: normalizedTrade,
  }
}

function normalizeConversationOptions(kind: NpcActorId, options: unknown): ConversationOption[] {
  const fallback = localNpcStoryDialog(kind, 1).options
  if (!Array.isArray(options) || options.length === 0) return fallback
  return options.slice(0, 3).map((option, index) => {
    const value = option && typeof option === "object" ? (option as Partial<ConversationOption>) : {}
    return {
      id: cleanConversationText(value.id || fallback[index]?.id || "leave", 32),
      label: cleanConversationText(value.label || fallback[index]?.label || "Leave", 32),
      text: cleanConversationText(value.text || fallback[index]?.text || "The conversation fades.", 180),
    }
  })
}

function normalizeConversationMemory(source: unknown): Record<string, ConversationMemory> {
  if (!source || typeof source !== "object") return {}
  const normalized: Record<string, ConversationMemory> = {}
  for (const [key, raw] of Object.entries(source as Record<string, unknown>)) {
    const value = raw && typeof raw === "object" ? (raw as Partial<ConversationMemory>) : null
    const kind = typeof value?.kind === "string" && isNpcActorId(value.kind) ? value.kind : null
    if (!value || typeof value.actorId !== "string" || !kind) continue
    const askedOptionIds = Array.isArray(value.askedOptionIds)
      ? [...new Set(value.askedOptionIds.filter((id): id is string => typeof id === "string").map((id) => cleanConversationText(id, 32)))].slice(0, 12)
      : []
    normalized[cleanConversationText(key, 96)] = {
      actorId: cleanConversationText(value.actorId, 48),
      kind,
      floor: Math.max(1, Math.floor(Number(value.floor) || 1)),
      askedOptionIds,
    }
  }
  return normalized
}

function normalizeTutorialState(value: unknown): RunTutorialState {
  const source = value && typeof value === "object" ? (value as Partial<RunTutorialState>) : null
  if (!source) return createTutorialState(false)
  const stage = source.stage === "movement" || source.stage === "npc-check" || source.stage === "combat" || source.stage === "complete" ? source.stage : source.completed ? "complete" : "movement"
  const enabled = Boolean(source.enabled)
  const completed = Boolean(source.completed) || stage === "complete" || !enabled
  return {
    enabled,
    completed,
    stage: completed ? "complete" : stage,
    coopGateHold: normalizeTutorialCoopGateHold(source.coopGateHold),
    gatePoints: normalizeTutorialGatePoints(source.gatePoints),
    movementSteps: Math.max(0, Math.floor(Number(source.movementSteps) || 0)),
    movedUp: Boolean(source.movedUp),
    movedDown: Boolean(source.movedDown),
    movedLeft: Boolean(source.movedLeft),
    movedRight: Boolean(source.movedRight),
    openedInventory: Boolean(source.openedInventory),
    openedQuests: Boolean(source.openedQuests),
    openedBook: Boolean(source.openedBook),
    talkedToNpc: Boolean(source.talkedToNpc),
    handledTalentCheck: Boolean(source.handledTalentCheck),
    combatStarted: Boolean(source.combatStarted),
    combatFinished: Boolean(source.combatFinished),
    disabledAfterDeath: Boolean(source.disabledAfterDeath),
    handoffShown: Boolean(source.handoffShown),
  }
}

function normalizeTutorialCoopGateHold(value: unknown): TutorialCoopGateHold | null {
  const source = value && typeof value === "object" ? (value as Partial<TutorialCoopGateHold>) : null
  if (!source || !(source.stage === "movement" || source.stage === "npc-check" || source.stage === "combat")) return null
  const waitingNames = Array.isArray(source.waitingNames) ? source.waitingNames.map((name) => cleanConversationText(name, 24)).filter(Boolean).slice(0, 4) : []
  return waitingNames.length ? { stage: source.stage, waitingNames } : null
}

function normalizeTutorialGatePoints(value: unknown): Point[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((point) => {
    const raw = point && typeof point === "object" ? (point as Partial<Point>) : null
    if (!raw) return []
    const x = Math.floor(Number(raw.x))
    const y = Math.floor(Number(raw.y))
    return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : []
  }).slice(0, 2)
}

function normalizeKnowledge(entries: unknown): KnowledgeEntry[] {
  if (!Array.isArray(entries)) return []
  const seenIds = new Set<string>()
  return entries.flatMap((entry) => {
    const normalized = normalizeKnowledgeEntry(entry)
    if (!normalized || seenIds.has(normalized.id)) return []
    seenIds.add(normalized.id)
    return [normalized]
  }).slice(0, 80)
}

function normalizeKnowledgeEntry(entry: unknown): KnowledgeEntry | null {
  const value = entry && typeof entry === "object" ? (entry as Partial<KnowledgeEntry>) : null
  if (!value) return null
  const kind = isKnowledgeKind(value.kind) ? value.kind : "note"
  const title = cleanBookText(value.title || "Unknown Note", 56)
  const text = cleanBookText(value.text || "The page is too damaged to read.", 520)
  return {
    id: cleanId(value.id || slug(title)),
    title,
    text,
    kind,
    floor: Number.isInteger(value.floor) ? Math.max(1, Math.floor(value.floor as number)) : undefined,
    discoveredAtTurn: Math.max(0, Math.floor(Number(value.discoveredAtTurn) || 0)),
  }
}

function normalizeToasts(toasts: unknown): RunToast[] {
  if (!Array.isArray(toasts)) return []
  return toasts.flatMap((toast) => {
    const normalized = normalizeToast(toast)
    return normalized ? [normalized] : []
  }).slice(0, 6)
}

function normalizeToast(toast: unknown): RunToast | null {
  const value = toast && typeof toast === "object" ? (toast as Partial<RunToast>) : null
  if (!value) return null
  const tone = value.tone === "success" || value.tone === "warning" || value.tone === "danger" ? value.tone : "info"
  return {
    id: cleanId(value.id || slug(value.title || "toast")),
    title: cleanToastText(value.title || "Event", 32),
    text: cleanToastText(value.text || "", 96),
    tone,
    turn: Math.max(0, Math.floor(Number(value.turn) || 0)),
  }
}

function normalizeHubState(hub: unknown, mode: MultiplayerMode, heroName: string): HubState {
  const fallback = createHubState(mode, heroName)
  const value = hub && typeof hub === "object" ? (hub as Partial<HubState>) : {}
  const sourceStations = value.stations && typeof value.stations === "object" ? value.stations : {}
  const sourceTrust = value.trust && typeof value.trust === "object" ? value.trust : {}
  const farm = value.farm && typeof value.farm === "object" ? (value.farm as Partial<FarmState>) : {}
  const helpers = value.helpers && typeof value.helpers === "object" ? (value.helpers as Partial<HubState["helpers"]>) : {}

  return {
    unlocked: Boolean(value.unlocked),
    coins: Math.max(0, Math.floor(Number(value.coins) || 0)),
    lootSold: Math.max(0, Math.floor(Number(value.lootSold) || 0)),
    stations: Object.fromEntries(
      hubStationIds.map((id) => {
        const base = fallback.stations[id]
        const station = (sourceStations as Partial<Record<HubStationId, Partial<HubStation>>>)[id] ?? {}
        return [
          id,
          {
            ...base,
            built: Boolean(station.built),
            level: clamp(Math.floor(Number(station.level) || 0), 0, 9),
          },
        ]
      }),
    ) as Record<HubStationId, HubStation>,
    trust: Object.fromEntries(
      villageNpcIds.map((id) => {
        const base = fallback.trust[id]
        const trust = (sourceTrust as Partial<Record<VillageNpcId, Partial<VillageTrust>>>)[id] ?? {}
        return [
          id,
          {
            ...base,
            level: clamp(Math.floor(Number(trust.level) || 0), 0, 5),
            xp: Math.max(0, Math.floor(Number(trust.xp) || 0)),
            questsCompleted: Math.max(0, Math.floor(Number(trust.questsCompleted) || 0)),
          },
        ]
      }),
    ) as Record<VillageNpcId, VillageTrust>,
    farm: {
      plots: clamp(Math.floor(Number(farm.plots) || fallback.farm.plots), 1, 24),
      planted: Math.max(0, Math.floor(Number(farm.planted) || 0)),
      ready: Math.max(0, Math.floor(Number(farm.ready) || 0)),
      sprinklers: Math.max(0, Math.floor(Number(farm.sprinklers) || 0)),
    },
    houses: normalizeVillageHouses(value.houses, mode, heroName),
    helpers: {
      pets: Math.max(0, Math.floor(Number(helpers.pets) || 0)),
      butlers: Math.max(0, Math.floor(Number(helpers.butlers) || 0)),
      sellingAssistants: Math.max(0, Math.floor(Number(helpers.sellingAssistants) || 0)),
    },
    preparedFood: normalizeStringList(value.preparedFood, 12, 40),
    unlockedGear: normalizeStringList(value.unlockedGear, 20, 50),
    activeMutators: normalizeRunMutators(value.activeMutators),
    relationshipLog: normalizeStringList(value.relationshipLog, 12, 120),
    village: normalizeVillageMapState(value.village, fallback.village),
    calendar: normalizeVillageCalendarState(value.calendar, fallback.calendar),
    cutscenes: normalizeCutscenes(value.cutscenes, fallback.cutscenes),
    lastCutsceneId: isCutsceneId(value.lastCutsceneId) ? value.lastCutsceneId : null,
    contentPacks: normalizeContentPackState(value.contentPacks, fallback.contentPacks),
    balanceDashboard: normalizeBalanceDashboardState(value.balanceDashboard, fallback.balanceDashboard),
    challengeBoard: normalizeChallengeBoardState(value.challengeBoard, fallback.challengeBoard),
  }
}

function normalizeEquipment(equipment: unknown, classId: HeroClass): Partial<Record<EquipmentSlot, EquipmentItem>> {
  const fallback = createStartingEquipment(classId)
  const value = equipment && typeof equipment === "object" ? (equipment as Partial<Record<EquipmentSlot, Partial<EquipmentItem>>>) : {}
  return {
    weapon: normalizeEquipmentItem(value.weapon ?? fallback.weapon, classId, "weapon"),
    armor: normalizeEquipmentItem(value.armor, classId, "armor"),
    relic: normalizeEquipmentItem(value.relic, classId, "relic"),
  }
}

function normalizeEquipmentItem(item: unknown, classId: HeroClass, slot: EquipmentSlot): EquipmentItem | undefined {
  if (!item || typeof item !== "object") {
    if (slot === "weapon") return createStartingEquipment(classId).weapon
    return undefined
  }
  const value = item as Partial<EquipmentItem>
  const rarity = isEquipmentRarity(value.rarity) ? value.rarity : "common"
  return {
    id: cleanId(value.id || `${slot}-${classId}`),
    name: cleanBookText(value.name || (slot === "weapon" ? starterWeapons[classId] : slot), 48),
    slot: isEquipmentSlot(value.slot) ? value.slot : slot,
    rarity,
    bonusDamage: clamp(Math.floor(Number(value.bonusDamage) || 0), 0, 12),
    statBonuses: normalizeStatBonuses(value.statBonuses),
    activeText: cleanBookText(value.activeText || "No active effect yet.", 140),
  }
}

function normalizeStatBonuses(value: unknown): Partial<HeroStats> {
  if (!value || typeof value !== "object") return {}
  const bonuses: Partial<HeroStats> = {}
  for (const stat of Object.keys(statsForClass("ranger")) as StatId[]) {
    const bonus = Math.floor(Number((value as Partial<Record<StatId, number>>)[stat]) || 0)
    if (bonus) bonuses[stat] = clamp(bonus, -4, 12)
  }
  return bonuses
}

function normalizeStringList(value: unknown, limit: number, itemLength: number) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => (typeof item === "string" ? [cleanBookText(item, itemLength)] : [])).slice(0, limit)
}

function normalizeRunMutators(value: unknown): RunMutatorId[] {
  if (!Array.isArray(value)) return []
  return runMutatorIds.filter((id) => value.includes(id))
}

function normalizeVillageMapState(value: unknown, fallback: VillageMapState): VillageMapState {
  const source = value && typeof value === "object" ? (value as Partial<VillageMapState>) : {}
  const selectedLocation = isVillageLocationId(source.selectedLocation) ? source.selectedLocation : fallback.selectedLocation
  const selectedPermission = isVillagePermissionArea(source.selectedPermission) ? source.selectedPermission : fallback.selectedPermission
  const player = source.player && typeof source.player === "object" ? (source.player as Partial<Point>) : fallback.player
  const sharedFarm = source.sharedFarm && typeof source.sharedFarm === "object" ? source.sharedFarm : fallback.sharedFarm
  const permissions = normalizeVillagePermissions(source.permissions, fallback.permissions, sharedFarm.permissions)
  return {
    player: {
      x: clamp(Math.floor(Number(player.x) || fallback.player.x), 1, 17),
      y: clamp(Math.floor(Number(player.y) || fallback.player.y), 1, 8),
    },
    selectedLocation,
    selectedPermission,
    schedules: normalizeVillageSchedules(source.schedules, fallback.schedules),
    customers: normalizeVillageCustomers(source.customers, fallback.customers),
    shopLog: normalizeStringList(source.shopLog, 8, 120),
    market: normalizeVillageMarketState(source.market, fallback.market),
    permissions,
    sharedFarm: {
      permissions: permissions.farm,
      storage: normalizeStringList(sharedFarm.storage, 20, 50),
    },
  }
}

function normalizeVillageMarketState(value: unknown, fallback: VillageMarketState): VillageMarketState {
  const source = value && typeof value === "object" ? (value as Partial<VillageMarketState>) : {}
  const demand = source.lastDemand
  return {
    selectedItemIndex: Math.max(0, Math.floor(Number(source.selectedItemIndex) || fallback.selectedItemIndex)),
    askingPrice: clamp(Math.floor(Number(source.askingPrice) || fallback.askingPrice), 0, 999),
    reputation: clamp(Math.floor(Number(source.reputation) || fallback.reputation), 0, 999),
    lastDemand: demand === "untested" || demand === "bargain" || demand === "fair" || demand === "expensive" || demand === "walked" ? demand : fallback.lastDemand,
  }
}

function normalizeVillagePermissions(value: unknown, fallback: VillagePermissionState, oldFarmPermission: unknown): VillagePermissionState {
  const source = value && typeof value === "object" ? (value as Partial<Record<VillagePermissionArea, unknown>>) : {}
  const permissions = Object.fromEntries(
    villagePermissionAreas.map((area) => {
      const legacyFarm = area === "farm" && isFarmPermission(oldFarmPermission) ? oldFarmPermission : undefined
      return [area, isFarmPermission(source[area]) ? source[area] : legacyFarm ?? fallback[area]]
    }),
  ) as VillagePermissionState
  return permissions
}

function normalizeVillageCalendarState(value: unknown, fallback: VillageCalendarState): VillageCalendarState {
  const source = value && typeof value === "object" ? (value as Partial<VillageCalendarState>) : {}
  return {
    day: Math.max(1, Math.floor(Number(source.day) || fallback.day)),
    phase: isVillageDayPhase(source.phase) ? source.phase : fallback.phase,
    season: isVillageSeasonId(source.season) ? source.season : fallback.season,
    weather: isVillageWeatherId(source.weather) ? source.weather : fallback.weather,
    festival: isVillageFestivalId(source.festival) ? source.festival : fallback.festival,
    dungeonModifier: cleanBookText(source.dungeonModifier || fallback.dungeonModifier, 120),
    note: cleanBookText(source.note || fallback.note, 180),
  }
}

function normalizeVillageSchedules(value: unknown, fallback: VillageNpcSchedule[]): VillageNpcSchedule[] {
  if (!Array.isArray(value)) return fallback
  const schedules = value.flatMap((item) => {
    const schedule = item && typeof item === "object" ? (item as Partial<VillageNpcSchedule>) : null
    if (!schedule || !isVillageNpcId(schedule.npc)) return []
    return [
      {
        npc: schedule.npc,
        location: isVillageLocationId(schedule.location) ? schedule.location : "portal",
        phase: isVillageDayPhase(schedule.phase) ? schedule.phase : "morning",
        available: schedule.available !== false,
        scene: cleanBookText(schedule.scene || "keeps a village routine", 96),
        requiredTrust: clamp(Math.floor(Number(schedule.requiredTrust) || 0), 0, 9),
        text: cleanBookText(schedule.text || `${villageTrustDefinitions[schedule.npc]} is in the village.`, 140),
      },
    ]
  })
  return schedules.length ? schedules.slice(0, villageNpcIds.length) : fallback
}

function normalizeVillageCustomers(value: unknown, fallback: VillageCustomer[]): VillageCustomer[] {
  if (!Array.isArray(value)) return fallback
  const customers = value.flatMap((item) => {
    const customer = item && typeof item === "object" ? (item as Partial<VillageCustomer>) : null
    if (!customer) return []
    return [
      {
        id: cleanId(customer.id || "customer"),
        name: cleanHeroName(customer.name || "Customer"),
        taste: isVillageCustomerTaste(customer.taste) ? customer.taste : "relic",
        patience: clamp(Math.floor(Number(customer.patience) || 1), 0, 5),
        trustNpc: isVillageNpcId(customer.trustNpc) ? customer.trustNpc : "guildmaster",
      },
    ]
  })
  return customers.length ? customers.slice(0, 8) : fallback
}

function normalizeCutscenes(value: unknown, fallback: CutsceneState[]): CutsceneState[] {
  if (!Array.isArray(value)) return fallback
  const scenes = value.flatMap((item) => {
    const scene = item && typeof item === "object" ? (item as Partial<CutsceneState>) : null
    if (!scene || !isCutsceneId(scene.id)) return []
    const fallbackScene = createCutscene(scene.id)
    return [
      {
        id: scene.id,
        title: cleanBookText(scene.title || fallbackScene.title, 48),
        lines: normalizeStringList(scene.lines, 6, 120).length ? normalizeStringList(scene.lines, 6, 120) : fallbackScene.lines,
        seen: Boolean(scene.seen),
      },
    ]
  })
  const byId = new Map(fallback.map((scene) => [scene.id, scene]))
  for (const scene of scenes) byId.set(scene.id, scene)
  return [...byId.values()]
}

function normalizeContentPackState(value: unknown, fallback: ContentPackState): ContentPackState {
  const source = value && typeof value === "object" ? (value as Partial<ContentPackState>) : {}
  const active = isContentPackId(source.active) ? source.active : fallback.active
  return {
    active,
    available: [...contentPackIds],
    preview: cleanBookText(source.preview || contentPackPreview(active), 80),
    lastChangedTurn: Math.max(0, Math.floor(Number(source.lastChangedTurn) || 0)),
  }
}

function normalizeBalanceDashboardState(value: unknown, fallback: BalanceDashboardState): BalanceDashboardState {
  const source = value && typeof value === "object" ? (value as Partial<BalanceDashboardState>) : {}
  return {
    runs: Math.max(0, Math.floor(Number(source.runs) || fallback.runs)),
    classWinRate: normalizeHeroClassScores(source.classWinRate, fallback.classWinRate),
    mutatorDifficulty: normalizeMutatorScores(source.mutatorDifficulty, fallback.mutatorDifficulty),
    averageGold: Math.max(0, Math.floor(Number(source.averageGold) || fallback.averageGold)),
    averageHubCoins: Math.max(0, Math.floor(Number(source.averageHubCoins) || fallback.averageHubCoins)),
    upgradePacing: clamp(Math.floor(Number(source.upgradePacing) || fallback.upgradePacing), 0, 100),
    notes: normalizeStringList(source.notes, 6, 120),
  }
}

function normalizeChallengeBoardState(value: unknown, fallback: ChallengeBoardState): ChallengeBoardState {
  const source = value && typeof value === "object" ? (value as Partial<ChallengeBoardState>) : {}
  const leaderboard = normalizeChallengeLeaderboard(source.leaderboard, fallback.leaderboard)
  const replayGhosts = normalizeChallengeReplayGhosts(source.replayGhosts, fallback.replayGhosts)
  return {
    activeRun: normalizeChallengeRunMetadata(source.activeRun),
    leaderboard,
    classMedals: normalizeChallengeClassMedals(source.classMedals, fallback.classMedals),
    replayGhosts: replayGhosts.length ? replayGhosts : leaderboard.map(challengeReplayGhostFor).slice(0, 12),
  }
}

function normalizeChallengeRunMetadata(value: unknown): ChallengeRunMetadata | null {
  const source = value && typeof value === "object" ? (value as Partial<ChallengeRunMetadata>) : null
  if (!source || !isChallengeCadence(source.cadence)) return null
  const seed = Math.max(1, Math.floor(Number(source.seed) || 1))
  const classId = isHeroClass(source.classId) ? source.classId : "ranger"
  return {
    id: cleanId(source.id || `${source.cadence}-${seed}`),
    cadence: source.cadence,
    seed,
    classId,
    mutators: normalizeRunMutators(source.mutators),
    startedAtTurn: Math.max(0, Math.floor(Number(source.startedAtTurn) || 0)),
    replayKey: cleanId(source.replayKey || `${source.cadence}-${seed}-${classId}`),
    ghostTrail: normalizeChallengeReplayTrail(source.ghostTrail),
  }
}

function normalizeChallengeLeaderboard(value: unknown, fallback: ChallengeLeaderboardEntry[]) {
  if (!Array.isArray(value)) return fallback
  const rows = value.flatMap((item) => {
    const base = normalizeChallengeRunMetadata(item)
    const source = item && typeof item === "object" ? (item as Partial<ChallengeLeaderboardEntry>) : null
    if (!base || !source) return []
    return [
      {
        ...base,
        name: cleanHeroName(source.name || "Crawler"),
        status: isRunStatus(source.status) ? source.status : "running",
        floor: Math.max(1, Math.floor(Number(source.floor) || 1)),
        turns: Math.max(0, Math.floor(Number(source.turns) || 0)),
        kills: Math.max(0, Math.floor(Number(source.kills) || 0)),
        gold: Math.max(0, Math.floor(Number(source.gold) || 0)),
        score: Math.max(0, Math.floor(Number(source.score) || 0)),
        medal: isChallengeMedal(source.medal) ? source.medal : "none",
      },
    ]
  })
  return rows.sort((left, right) => right.score - left.score || left.turns - right.turns).slice(0, 12)
}

function normalizeChallengeReplayTrail(value: unknown, fallback: ChallengeReplayPoint[] = []): ChallengeReplayPoint[] {
  if (!Array.isArray(value)) return fallback.slice(0, 48)
  const trail = value.flatMap((item) => {
    const source = item && typeof item === "object" ? (item as Partial<ChallengeReplayPoint>) : null
    if (!source) return []
    return [
      {
        turn: Math.max(0, Math.floor(Number(source.turn) || 0)),
        floor: Math.max(1, Math.floor(Number(source.floor) || 1)),
        x: clamp(Math.floor(Number(source.x) || 1), 1, 999),
        y: clamp(Math.floor(Number(source.y) || 1), 1, 999),
        event: cleanId(source.event || "move"),
      },
    ]
  })
  return trail.slice(0, 48)
}

function normalizeChallengeReplayGhosts(value: unknown, fallback: ChallengeReplayGhost[]): ChallengeReplayGhost[] {
  if (!Array.isArray(value)) return fallback.slice(0, 12)
  const ghosts = value.flatMap((item) => {
    const source = item && typeof item === "object" ? (item as Partial<ChallengeReplayGhost>) : null
    if (!source || !isChallengeCadence(source.cadence) || !isHeroClass(source.classId)) return []
    return [
      {
        replayKey: cleanId(source.replayKey || `${source.cadence}-${Number(source.seed) || 1}-${source.classId}`),
        name: cleanHeroName(source.name || "Crawler"),
        classId: source.classId,
        cadence: source.cadence,
        seed: Math.max(1, Math.floor(Number(source.seed) || 1)),
        medal: isChallengeMedal(source.medal) ? source.medal : "none",
        score: Math.max(0, Math.floor(Number(source.score) || 0)),
        status: isRunStatus(source.status) ? source.status : "running",
        summary: cleanBookText(source.summary || "Saved challenge ghost", 140),
        trail: normalizeChallengeReplayTrail(source.trail),
      },
    ]
  })
  return ghosts.slice(0, 12)
}

function normalizeChallengeClassMedals(value: unknown, fallback: Record<HeroClass, ChallengeMedal>) {
  const source = value && typeof value === "object" ? (value as Partial<Record<HeroClass, ChallengeMedal>>) : {}
  return Object.fromEntries(heroClassIds.map((id) => [id, isChallengeMedal(source[id]) ? source[id] : fallback[id] ?? "none"])) as Record<HeroClass, ChallengeMedal>
}

function normalizeHeroClassScores(value: unknown, fallback: Record<HeroClass, number>) {
  const source = value && typeof value === "object" ? (value as Partial<Record<HeroClass, number>>) : {}
  return Object.fromEntries(heroClassIds.map((id) => [id, clamp(Math.floor(Number(source[id]) || fallback[id] || 0), 0, 100)])) as Record<HeroClass, number>
}

function normalizeMutatorScores(value: unknown, fallback: Record<RunMutatorId, number>) {
  const source = value && typeof value === "object" ? (value as Partial<Record<RunMutatorId, number>>) : {}
  return Object.fromEntries(runMutatorIds.map((id) => [id, clamp(Math.floor(Number(source[id]) || fallback[id] || 0), 0, 100)])) as Record<RunMutatorId, number>
}

function normalizeVillageHouses(value: unknown, mode: MultiplayerMode, heroName: string): VillageHouse[] {
  const fallback = createVillageHouses(mode, heroName)
  if (!Array.isArray(value) || value.length === 0) return fallback
  const houses = value.flatMap((house) => {
    const candidate = house && typeof house === "object" ? (house as Partial<VillageHouse>) : null
    if (!candidate) return []
    return [
      {
        playerId: cleanId(candidate.playerId || "player"),
        name: cleanBookText(candidate.name || "Village House", 40),
        built: Boolean(candidate.built),
      },
    ]
  })
  return houses.length ? houses.slice(0, 8) : fallback
}

function createVillageHouses(mode: MultiplayerMode, heroName: string): VillageHouse[] {
  const houses: VillageHouse[] = [{ playerId: "player-1", name: `${cleanHeroName(heroName)}'s House`, built: true }]
  if (mode === "coop") {
    houses.push(
      { playerId: "player-2", name: "Co-op House 2", built: true },
      { playerId: "player-3", name: "Co-op House 3", built: false },
      { playerId: "player-4", name: "Co-op House 4", built: false },
    )
  }
  return houses
}

function createVillageMapState(mode: MultiplayerMode): VillageMapState {
  const permissions = createVillagePermissions(mode)
  return {
    player: { ...villageLocations.portal.position },
    selectedLocation: "portal",
    selectedPermission: "storage",
    schedules: villageNpcIds.map((npc) => ({
      npc,
      location: npc === "blacksmith" ? "blacksmith" : npc === "farmer" ? "farm" : npc === "guildmaster" ? "guildhall" : npc === "cook" ? "market" : "portal",
      phase: "morning",
      scene: "keeps a morning village routine",
      requiredTrust: 0,
      available: true,
      text: `${villageTrustDefinitions[npc]} is ready to talk.`,
    })),
    customers: createVillageCustomers(),
    shopLog: [],
    market: {
      selectedItemIndex: 0,
      askingPrice: 0,
      reputation: 0,
      lastDemand: "untested",
    },
    permissions,
    sharedFarm: {
      permissions: permissions.farm,
      storage: [],
    },
  }
}

function createVillagePermissions(mode: MultiplayerMode): VillagePermissionState {
  const sharedDefault: FarmPermission = mode === "coop" ? "friends" : "owner-only"
  return {
    houses: sharedDefault,
    farm: sharedDefault,
    storage: sharedDefault,
    shop: "owner-only",
    upgrades: "owner-only",
  }
}

function createVillageCalendarState(seed: number, turn: number): VillageCalendarState {
  const day = Math.max(1, Math.floor(turn / 12) + 1)
  const phase = villageDayPhaseForTurn(turn)
  const season = villageSeasonIds[Math.floor((day - 1) / 7) % villageSeasonIds.length] ?? "spring"
  const weather = villageWeatherIds[Math.abs(seed + day * 13) % villageWeatherIds.length] ?? "clear"
  const festival = villageFestivalForDay(day, season)
  const modifier = villageCalendarModifier(weather, festival)
  return {
    day,
    phase,
    season,
    weather,
    festival,
    dungeonModifier: modifier,
    note: villageCalendarNote(day, phase, season, weather, festival, modifier),
  }
}

function createVillageCustomers(): VillageCustomer[] {
  return villageCustomerNames.map((name, index) => ({
    id: `customer-${name.toLowerCase()}`,
    name,
    taste: villageCustomerTastes[index % villageCustomerTastes.length] ?? "relic",
    patience: 1 + (index % 4),
    trustNpc: villageNpcIds[index % villageNpcIds.length] ?? "guildmaster",
  }))
}

function createCutscenes(heroName = "Mira"): CutsceneState[] {
  return (["waking-cell", "first-clear", "village-unlock", "ending-rooted", "ending-remixed"] as const).map((id) => createCutscene(id, heroName))
}

function createCutscene(id: CutsceneId, heroName = "Mira"): CutsceneState {
  const name = cleanHeroName(heroName)
  const titles: Record<CutsceneId, string> = {
    "waking-cell": "Waking Cell",
    "first-clear": "First Clear",
    "village-unlock": "Village Route Opened",
    "ending-rooted": "Root Ending",
    "ending-remixed": "Remixed Ending",
  }
  const lines: Record<CutsceneId, string[]> = {
    "waking-cell": [
      `${name}: "I have been here before. I just do not remember the door."`,
      "A ledger page scratches itself into your Book while a voice waits somewhere beyond the first room.",
      "Choose how to answer the first memory, then use WASD or arrows to move. Press E or Enter near people, doors, notes, and loot.",
    ],
    "first-clear": [`${name} reaches the final gate with no memory, but the dungeon finally answers.`, "A road appears where the last wall used to be."],
    "village-unlock": ["The portal room lights one stone at a time.", "Beyond it, a village waits for loot, trust, houses, and another run."],
    "ending-rooted": ["The grave-root admits it was guarding the first memory, not stealing it.", "The village survives because you choose what returns through the portal."],
    "ending-remixed": ["The AI-admin relic rewrites the final motive in the margins.", "The boss remembers a different bargain, and the ending bends without breaking the save."],
  }
  return { id, title: titles[id], lines: lines[id], seen: false }
}

function cutsceneLinesFor(id: CutsceneId, session: GameSession) {
  const scene = createCutscene(id, session.hero.name)
  if (id === "village-unlock") return [...scene.lines, `${session.hub.coins} village coins and ${session.hub.houses.length} house slot(s) are ready.`]
  if (id === "ending-rooted") return [...scene.lines, `Trust ledgers remain: ${villageNpcIds.map((npc) => `${session.hub.trust[npc].name} T${session.hub.trust[npc].level}`).join(", ")}.`]
  if (id === "ending-remixed") return [...scene.lines, "Future AI-admin tools can swap motives, branch endings, and keep local saves playable."]
  return scene.lines
}

function createContentPackState(): ContentPackState {
  return {
    active: "opendungeon",
    available: [...contentPackIds],
    preview: contentPackPreview("opendungeon"),
    lastChangedTurn: 0,
  }
}

function villageFestivalForDay(day: number, season: VillageSeasonId): VillageFestivalId {
  if (day % 13 === 0) return "final-gate-vigil"
  if (day % 9 === 0) return season === "autumn" ? "harvest-night" : "market-day"
  if (day % 6 === 0) return "forge-fair"
  return "none"
}

function villageCalendarModifier(weather: VillageWeatherId, festival: VillageFestivalId) {
  if (festival === "final-gate-vigil") return "Final-gate rooms reveal more relic clues."
  if (festival === "market-day") return "Loot sells better, and cache gold rises."
  if (festival === "forge-fair") return "Weapon prep is stronger, but armored enemies patrol more."
  if (festival === "harvest-night") return "Food prep stretches farther into the next descent."
  if (weather === "storm") return "Traps hit harder, but focus drafts are stronger."
  if (weather === "fog") return "Sight lines shrink in the next dungeon."
  if (weather === "rain") return "Slimes and moths are more common near wet rooms."
  if (weather === "emberfall") return "Burning lasts longer for both sides."
  return "No extra dungeon pressure today."
}

function villageDayPhaseForTurn(turn: number): VillageDayPhase {
  const phase = Math.floor(Math.max(0, turn) / 4) % villageDayPhases.length
  return villageDayPhases[phase] ?? "morning"
}

function villageDayPhaseLabel(phase: VillageDayPhase) {
  const labels: Record<VillageDayPhase, string> = {
    morning: "Morning",
    day: "Day",
    night: "Night",
  }
  return labels[phase]
}

function villageCalendarNote(day: number, phase: VillageDayPhase, season: VillageSeasonId, weather: VillageWeatherId, festival: VillageFestivalId, modifier: string) {
  const festivalText = festival === "none" ? "no festival" : festival.replace(/-/g, " ")
  return `Day ${day} ${phase}, ${season}, ${weather}; ${festivalText}. ${modifier}`
}

function createBalanceDashboardState(): BalanceDashboardState {
  return {
    runs: 0,
    classWinRate: Object.fromEntries(heroClassIds.map((id) => [id, 0])) as Record<HeroClass, number>,
    mutatorDifficulty: Object.fromEntries(runMutatorIds.map((id) => [id, 0])) as Record<RunMutatorId, number>,
    averageGold: 0,
    averageHubCoins: 0,
    upgradePacing: 0,
    notes: [],
  }
}

function createChallengeBoardState(): ChallengeBoardState {
  return {
    activeRun: null,
    leaderboard: [],
    classMedals: createChallengeClassMedalState(),
    replayGhosts: [],
  }
}

function createChallengeClassMedalState() {
  return Object.fromEntries(heroClassIds.map((id) => [id, "none"])) as Record<HeroClass, ChallengeMedal>
}

function sellValue(item: string) {
  const lower = item.toLowerCase()
  if (/relic|shard|boss memory|fossil|keepsake|story relic/i.test(item)) return 22
  if (/scroll|tool|lockpick|map|deed/i.test(lower)) return 14
  if (/chest|gem|gold|coin|cache/i.test(lower)) return 18
  if (/potion|vial|food|ration|broth/i.test(lower)) return 6
  return 0
}

function nearestVillageLocation(point: Point): VillageLocationId {
  return villageLocationIds
    .map((id) => {
      const location = villageLocations[id]
      return { id, distance: Math.abs(location.position.x - point.x) + Math.abs(location.position.y - point.y) }
    })
    .sort((left, right) => left.distance - right.distance)[0]?.id ?? "portal"
}

function classifyShopItem(item: string): VillageCustomerTaste {
  const lower = item.toLowerCase()
  if (/food|ration|broth|potion|vial/i.test(lower)) return "food"
  if (/tool|lockpick|map|scroll|deed/i.test(lower)) return "tool"
  if (/fossil|ore|gem|coin|cache|chest/i.test(lower)) return "material"
  if (/memory|keepsake|story|note/i.test(lower)) return "memory"
  return "relic"
}

function contentPackPreview(id: ContentPackId) {
  if (id === "high-contrast") return "High contrast glyphs for readability checks and screenshots."
  if (id === "mono-terminal") return "Low-color ASCII pack for remote terminals and small panes."
  return "opendungeon tiny pixel runtime using terminal-safe itch.io imports."
}

function contentPackLabel(id: ContentPackId) {
  if (id === "high-contrast") return "High Contrast"
  if (id === "mono-terminal") return "Mono Terminal"
  return "opendungeon"
}

function isVillageLocationId(value: unknown): value is VillageLocationId {
  return typeof value === "string" && (villageLocationIds as readonly string[]).includes(value)
}

function isVillageNpcId(value: unknown): value is VillageNpcId {
  return typeof value === "string" && (villageNpcIds as readonly string[]).includes(value)
}

function isVillageCustomerTaste(value: unknown): value is VillageCustomerTaste {
  return typeof value === "string" && (villageCustomerTastes as readonly string[]).includes(value)
}

function isVillageSeasonId(value: unknown): value is VillageSeasonId {
  return typeof value === "string" && (villageSeasonIds as readonly string[]).includes(value)
}

function isVillageWeatherId(value: unknown): value is VillageWeatherId {
  return typeof value === "string" && (villageWeatherIds as readonly string[]).includes(value)
}

function isVillageDayPhase(value: unknown): value is VillageDayPhase {
  return typeof value === "string" && (villageDayPhases as readonly string[]).includes(value)
}

function isVillageFestivalId(value: unknown): value is VillageFestivalId {
  return value === "none" || value === "market-day" || value === "forge-fair" || value === "harvest-night" || value === "final-gate-vigil"
}

function isVillagePermissionArea(value: unknown): value is VillagePermissionArea {
  return typeof value === "string" && (villagePermissionAreas as readonly string[]).includes(value)
}

function isFarmPermission(value: unknown): value is FarmPermission {
  return value === "owner-only" || value === "friends" || value === "everyone"
}

function isChallengeCadence(value: unknown): value is ChallengeCadence {
  return value === "daily" || value === "weekly"
}

function isChallengeMedal(value: unknown): value is ChallengeMedal {
  return value === "none" || value === "bronze" || value === "silver" || value === "gold"
}

function isRunStatus(value: unknown): value is ChallengeLeaderboardEntry["status"] {
  return value === "running" || value === "dead" || value === "victory"
}

function isCutsceneId(value: unknown): value is CutsceneId {
  return value === "waking-cell" || value === "first-clear" || value === "village-unlock" || value === "ending-rooted" || value === "ending-remixed"
}

function isContentPackId(value: unknown): value is ContentPackId {
  return typeof value === "string" && (contentPackIds as readonly string[]).includes(value)
}

function applyStationUnlock(session: GameSession, id: HubStationId) {
  if (id === "quarry") {
    session.hub.coins += 8 + session.hub.stations.quarry.level * 4
    gainNpcTrust(session, "guildmaster", 2, false)
  }
  if (id === "blacksmith") gainNpcTrust(session, "blacksmith", 4, true)
  if (id === "kitchen") gainNpcTrust(session, "cook", 4, true)
  if (id === "farm") {
    session.hub.farm.plots += 2
    gainNpcTrust(session, "farmer", 4, true)
  }
  if (id === "storage") {
    session.hub.helpers.sellingAssistants += 1
    gainNpcTrust(session, "guildmaster", 3, true)
  }
  if (id === "upgrade-bench") {
    session.hub.helpers.butlers += 1
    gainNpcTrust(session, "blacksmith", 2, false)
  }
}

function applyCollectibleMetaProgress(session: GameSession, kind: KnowledgeCollectibleTile) {
  session.hub = normalizeHubState(session.hub, session.mode, session.hero.name)
  if (kind === "deed") unlockHub(session, "A recovered village deed points to the portal room.")
  if (kind === "recipe") {
    session.hub.preparedFood.unshift("Recipe: focus broth")
    gainNpcTrust(session, "cook", 1, false)
  }
  if (kind === "tool") {
    session.hub.coins += 3
    gainNpcTrust(session, "blacksmith", 1, false)
  }
  if (kind === "fossil") {
    session.hub.coins += 8
    gainNpcTrust(session, "guildmaster", 2, false)
  }
  if (kind === "boss-memory") gainNpcTrust(session, "cartographer", 2, false)
  if (kind === "keepsake") gainNpcTrust(session, "farmer", 2, false)
  if (kind === "story-relic") {
    session.pendingWorldGeneration = true
    gainNpcTrust(session, "cartographer", 1, false)
  }
}

function equipmentStatBonus(session: GameSession, stat: StatId) {
  return Object.values(session.equipment ?? {}).reduce((total, item) => total + Math.floor(item?.statBonuses?.[stat] ?? 0), 0)
}

function equipmentDamageBonus(session: GameSession) {
  return Object.values(session.equipment ?? {}).reduce((total, item) => total + Math.max(0, item?.bonusDamage ?? 0), 0)
}

function applyMutatorPressure(session: GameSession) {
  const active = new Set(session.hub.activeMutators)
  if (active.has("hard-mode")) {
    session.maxHp = Math.max(8, derivedMaxHp(session.stats) - 2)
    session.hp = Math.min(session.hp, session.maxHp)
  }
  if (active.has("cursed-floors")) session.floorModifier = { ...session.floorModifier, trapDamageBonus: session.floorModifier.trapDamageBonus + 1 }
  if (active.has("boss-rush")) session.finalFloor = Math.min(session.finalFloor, defaultFinalFloor)
}

function applyVillageCalendarModifier(session: GameSession) {
  const calendar = session.hub.calendar
  if (calendar.weather === "storm") {
    session.floorModifier = { ...session.floorModifier, trapDamageBonus: session.floorModifier.trapDamageBonus + 1, restFocusBonus: session.floorModifier.restFocusBonus + 1 }
  }
  if (calendar.weather === "fog") session.floorModifier = { ...session.floorModifier, visionBonus: session.floorModifier.visionBonus - 1 }
  if (calendar.weather === "emberfall") session.floorModifier = { ...session.floorModifier, goldBonus: session.floorModifier.goldBonus + 1 }
  if (calendar.festival === "market-day") session.floorModifier = { ...session.floorModifier, goldBonus: session.floorModifier.goldBonus + 4 }
  if (calendar.festival === "forge-fair" && session.equipment.weapon) session.equipment.weapon = { ...session.equipment.weapon, bonusDamage: session.equipment.weapon.bonusDamage + 1 }
  if (calendar.festival === "harvest-night" && !session.inventory.includes("Festival rations")) session.inventory.unshift("Festival rations")
  if (calendar.festival === "final-gate-vigil" && !session.inventory.includes("Final-gate candle")) session.inventory.unshift("Final-gate candle")
  rememberKnowledge(session, {
    id: `village-calendar-day-${calendar.day}`,
    title: `Village Calendar Day ${calendar.day}`,
    text: calendar.note,
    kind: "hub",
    floor: session.floor,
  })
  addToast(session, "Village calendar", calendar.dungeonModifier, "info")
}

function strategicPressureTier(session: GameSession) {
  if (!session.hub?.unlocked) return 0
  const stationLevels = hubStationIds.reduce((total, id) => total + Math.max(0, session.hub.stations[id]?.level ?? 0), 0)
  const stationPressure = Math.floor(stationLevels / 3)
  const floorPressure = session.floor >= session.finalFloor ? 2 : session.floor >= 2 ? 1 : 0
  const mutatorPressure = session.hub.activeMutators.length
  return clamp(1 + stationPressure + floorPressure + mutatorPressure, 1, 5)
}

function applyStrategicDescentPressure(session: GameSession) {
  const tier = strategicPressureTier(session)
  if (!tier) return
  const enemies = session.dungeon.actors.filter((actor) => isEnemyActorId(actor.kind))
  for (const actor of enemies) {
    const bossBonus = isBossActorId(actor.kind) ? tier + session.floor : 0
    const hpBonus = tier + Math.floor(session.floor / 2) + bossBonus
    actor.maxHp = Math.max(actor.maxHp ?? actor.hp, actor.hp) + hpBonus
    actor.hp += hpBonus
    actor.damage += session.floor >= 2 ? Math.ceil(tier / 2) : 0
    if (actor.ai) {
      actor.ai.aggroRadius += Math.min(2, tier)
      actor.ai.leashRadius += Math.min(3, tier)
    }
  }
  placeStrategicGuards(session, tier)
  session.log.unshift(`Strategic pressure tier ${tier}: enemies have more HP, stronger roles, and tighter guards.`)
  trimLog(session)
}

const gmFloorEncounterPath = /^floors\.(\d+)\.encounterBudget$/

export function applyGmPatchOperations(session: GameSession, operations: readonly GmPatchOperationInput[]): GmPatchApplyResult {
  if (!Array.isArray(operations) || operations.length === 0) return { applied: 0, message: "No GM operations to apply." }
  let applied = 0
  const notes: string[] = []

  for (const operation of operations) {
    const path = String(operation.path || "")
    if (path === "rules.enemyHpMultiplier") {
      const multiplier = clampNumber(operation.value, 0.5, 2)
      applied += applyGmEnemyHpMultiplier(session, multiplier)
      notes.push(`enemy HP x${multiplier.toFixed(2)}`)
      continue
    }
    if (path === "rules.enemyDamageBonus") {
      const bonus = Math.trunc(clampNumber(operation.value, -3, 3))
      applied += applyGmEnemyDamageBonus(session, bonus)
      notes.push(`enemy damage ${formatSigned(bonus)}`)
      continue
    }
    const floorMatch = gmFloorEncounterPath.exec(path)
    if (floorMatch) {
      const floor = Number(floorMatch[1])
      if (floor === session.floor) {
        const budget = Math.trunc(clampNumber(operation.value, 0, 12))
        applied += applyGmEncounterBudget(session, budget)
        notes.push(`encounter pressure ${budget}`)
      }
      continue
    }
    if (path === "lore.gmBriefing" && typeof operation.value === "string") {
      pushSessionMessage(session, `GM briefing: ${operation.value.slice(0, 180)}`)
      applied += 1
      notes.push("briefing")
    }
  }

  if (!applied) return { applied: 0, message: "No current-floor GM operations matched this run." }
  const message = `GM patch applied: ${notes.join(", ")}.`
  pushSessionMessage(session, message)
  addToast(session, "GM rules applied", message, "warning")
  return { applied, message }
}

function applyGmEnemyHpMultiplier(session: GameSession, multiplier: number) {
  let applied = 0
  for (const actor of session.dungeon.actors) {
    if (!isEnemyActorId(actor.kind)) continue
    const maxHp = Math.max(actor.maxHp ?? actor.hp, actor.hp, 1)
    const nextMax = Math.max(1, Math.ceil(maxHp * multiplier))
    const delta = nextMax - maxHp
    actor.maxHp = nextMax
    actor.hp = clamp(actor.hp + delta, 1, nextMax)
    applied += 1
  }
  return applied
}

function applyGmEnemyDamageBonus(session: GameSession, bonus: number) {
  let applied = 0
  for (const actor of session.dungeon.actors) {
    if (!isEnemyActorId(actor.kind)) continue
    actor.damage = Math.max(1, actor.damage + bonus)
    applied += 1
  }
  return applied
}

function applyGmEncounterBudget(session: GameSession, budget: number) {
  const enemies = session.dungeon.actors.filter((actor) => isEnemyActorId(actor.kind))
  const aiBonus = Math.min(3, Math.floor(budget / 3))
  for (const actor of enemies) {
    if (!actor.ai) ensureEnemyAi(actor, session.dungeon.actors.indexOf(actor), session.floor)
    if (actor.ai) {
      actor.ai.aggroRadius += aiBonus
      actor.ai.leashRadius += aiBonus
      actor.ai.alerted = budget >= 5
    }
  }
  if (budget >= 4) placeStrategicGuards(session, Math.min(5, Math.ceil(budget / 2)))
  return enemies.length
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = Number(value)
  return Number.isFinite(number) ? clamp(number, min, max) : min
}

function placeStrategicGuards(session: GameSession, tier: number) {
  if (session.floor < 2) return
  const anchors = session.dungeon.actors.filter((actor) => actor.kind === "necromancer" || isBossActorId(actor.kind))
  for (const anchor of anchors.slice(0, session.floor >= session.finalFloor ? 2 : 1)) {
    const alreadyGuarded = session.dungeon.actors.some((actor) => actor.kind === "rust-squire" && manhattan(actor.position, anchor.position) <= 2)
    if (alreadyGuarded) continue
    const position = firstFreeNeighbor(session, anchor.position)
    if (!position) continue
    const guard: Actor = {
      id: `strategic-guard-${session.floor}-${anchor.id}`,
      kind: "rust-squire",
      position,
      hp: 5 + session.floor + tier,
      maxHp: 5 + session.floor + tier,
      damage: 2 + Math.ceil(tier / 2),
      phase: 1,
      ai: enemyAi("rust-squire", position, session.dungeon.actors.length, session.floor),
    }
    guard.ai!.pattern = "guard"
    session.dungeon.actors.push(guard)
  }
}

function firstFreeNeighbor(session: GameSession, point: Point) {
  return cardinalNeighbors(point).find((candidate) => {
    if (tileAt(session.dungeon, candidate) !== "floor") return false
    return !session.dungeon.actors.some((actor) => actor.position.x === candidate.x && actor.position.y === candidate.y)
  })
}

function pushSessionMessage(session: GameSession, message: string) {
  session.log.unshift(message)
  trimLog(session)
}

function trimHubLog(hub: HubState) {
  while (hub.relationshipLog.length > 12) hub.relationshipLog.pop()
}

function runMutatorLabel(id: RunMutatorId) {
  if (id === "daily-seed") return "Daily seed"
  if (id === "hard-mode") return "Hard mode"
  if (id === "cursed-floors") return "Cursed floors"
  if (id === "class-challenge") return "Class challenge"
  return "Boss rush"
}

function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return value === "weapon" || value === "armor" || value === "relic"
}

function isEquipmentRarity(value: unknown): value is EquipmentRarity {
  return value === "common" || value === "uncommon" || value === "rare" || value === "legendary"
}

function isKnowledgeKind(value: unknown): value is KnowledgeEntryKind {
  return value === "memory" || value === "note" || value === "npc" || value === "tutorial" || value === "hub" || value === "monster"
}

function normalizeTalents(classId: HeroClass, talents: unknown): TalentId[] {
  if (!Array.isArray(talents)) return []
  const allowed = new Set<TalentId>([classTalentIds[classId], "deep-breath", "quick-hands", "hard-lessons"])
  return talents.filter((talent): talent is TalentId => typeof talent === "string" && isTalentId(talent) && allowed.has(talent))
}

function normalizeLevelUp(classId: HeroClass, levelUp: unknown, talents: TalentId[]): LevelUpState | null {
  if (!levelUp || typeof levelUp !== "object") return null
  const value = levelUp as Partial<LevelUpState>
  const level = Math.max(2, Math.floor(Number(value.level) || 2))
  const sessionLike = { hero: { classId }, level, talents } as GameSession
  const choices = Array.isArray(value.choices) ? value.choices.flatMap((choice) => (choice && typeof choice === "object" && isTalentId((choice as LevelUpChoice).id) ? [talentChoice((choice as LevelUpChoice).id)] : [])) : levelUpChoices(sessionLike)
  return { level, choices: choices.slice(0, 3) }
}

function isTalentId(value: unknown): value is TalentId {
  return typeof value === "string" && value in talentDefinitions
}

function pruneStatusEffects(session: GameSession) {
  const actorIds = new Set(session.dungeon.actors.map((actor) => actor.id))
  session.statusEffects = session.statusEffects.filter((effect) => effect.remainingTurns > 0 && (effect.targetId === "player" || actorIds.has(effect.targetId)))
}

function removeStatusEffectsFor(session: GameSession, targetId: StatusEffect["targetId"]) {
  session.statusEffects = session.statusEffects.filter((effect) => effect.targetId !== targetId)
}

function isStatusEffectId(value: unknown): value is StatusEffectId {
  return value === "guarded" || value === "weakened" || value === "burning" || value === "poisoned"
}

function statusEffectLabel(id: StatusEffectId) {
  if (id === "guarded") return "Guarded"
  if (id === "weakened") return "Weakened"
  if (id === "poisoned") return "Poisoned"
  return "Burning"
}

function cleanStatusLabel(text: string) {
  return text.replace(/[^\w .:/'()-]/g, "").trim().slice(0, 40) || "Status"
}

function cleanConversationText(text: string, maxLength: number) {
  return text.replace(/[^\w .:/'(),;-]/g, "").trim().slice(0, maxLength) || "Conversation"
}

function cleanBookText(text: string, maxLength: number) {
  return text.replace(/[^\w .:/'(),;!?+-]/g, "").trim().slice(0, maxLength) || "Unknown"
}

function cleanToastText(text: string, maxLength: number) {
  return text.replace(/[^\w .:/'(),;!?-]/g, "").trim().slice(0, maxLength) || "Event"
}

function cleanId(text: string) {
  return slug(text).slice(0, 80) || "entry"
}

function cleanHeroName(text: string) {
  return text.replace(/[^\w .'-]/g, "").trim().slice(0, 24) || "Mira"
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
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

function retreatStep(session: GameSession, actor: Actor): Point | null {
  return cardinalNeighbors(actor.position)
    .filter((candidate) => canActorStepTo(session, actor, candidate))
    .sort((left, right) => manhattan(right, session.player) - manhattan(left, session.player))[0] ?? null
}

function patrolStep(session: GameSession, actor: Actor, index: number): Point | null {
  const ai = ensureEnemyAi(actor, index, session.floor)
  if (ai.pattern === "sentinel" || ai.pattern === "ranged" || ai.pattern === "ambush") return null
  if (ai.pattern === "guard") return guardStep(session, actor, index)
  if (ai.pattern === "fleeing" && actor.hp < Math.max(2, Math.ceil((actor.maxHp ?? actor.hp) / 2))) return retreatStep(session, actor)

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

function guardStep(session: GameSession, actor: Actor, index: number): Point | null {
  const protectedActor = session.dungeon.actors
    .filter((candidate) => candidate.id !== actor.id && (candidate.kind === "necromancer" || isBossActorId(candidate.kind)))
    .sort((left, right) => manhattan(left.position, actor.position) - manhattan(right.position, actor.position))[0]
  if (!protectedActor) {
    const direction = cardinalDirections()[(session.turn + index) % 4]
    const candidate = { x: actor.position.x + direction.x, y: actor.position.y + direction.y }
    return canActorStepTo(session, actor, candidate) ? candidate : null
  }
  if (manhattan(actor.position, protectedActor.position) <= 1) return null
  const preferred = stepToward(actor.position, protectedActor.position)
  return canActorStepTo(session, actor, preferred) ? preferred : null
}

function canSensePlayer(session: GameSession, actor: Actor, ai: EnemyAi) {
  if (ai.pattern === "ambush" && !ai.alerted) return manhattan(actor.position, session.player) <= 2 && hasLineOfSight(session, actor.position)
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

function pointInRect(point: Point, rect: { x: number; y: number; width: number; height: number }) {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height
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
  if (ai.stunnedTurns && ai.stunnedTurns > 0) return `Stunned ${ai.stunnedTurns}${phase}`
  if (ai.alerted) return `Chasing ${ai.chaseTurns || 1}/${enemyChasePatience(actor.kind)} R${ai.aggroRadius}${phase}`
  if (ai.pattern === "ranged") return `Ranged R${enemyRangedRange(actor.kind)}${phase}`
  if (ai.pattern === "guard") return `Guarding R${ai.aggroRadius}${phase}`
  if (ai.pattern === "ambush") return `Ambush R${ai.aggroRadius}${phase}`
  if (ai.pattern === "fleeing") return `Skittish R${ai.aggroRadius}${phase}`
  if (ai.pattern === "patrol-horizontal") return `Patrol east/west R${ai.aggroRadius}${phase}`
  if (ai.pattern === "patrol-vertical") return `Patrol north/south R${ai.aggroRadius}${phase}`
  if (ai.pattern === "stalker") return `Stalker R${ai.aggroRadius}${phase}`
  if (ai.pattern === "wander") return `Wander R${ai.aggroRadius}${phase}`
  return `Guard R${ai.aggroRadius}${phase}`
}

function enemyDefenseDcBonus(session: GameSession, actor: Actor) {
  return enemyDefenseBonus(actor.kind) + (protectedByGuard(session, actor) ? 1 : 0)
}

function enemyDefenseBonus(kind: Actor["kind"] | undefined) {
  if (kind === "grave-root-boss") return 5
  if (kind === "necromancer") return 4
  if (kind === "crypt-mimic") return 3
  if (kind === "ghoul") return 2
  if (kind === "rust-squire" || kind === "gallows-wisp") return 1
  return 0
}

function protectedByGuard(session: GameSession, actor: Actor) {
  if (!(actor.kind === "necromancer" || isBossActorId(actor.kind))) return false
  return session.dungeon.actors.some((candidate) => {
    const ai = candidate.ai
    return candidate.id !== actor.id && candidate.kind === "rust-squire" && ai?.pattern === "guard" && manhattan(candidate.position, actor.position) <= 2
  })
}

function enemyCanRangedAttack(actor: Actor) {
  return actor.kind === "necromancer" || actor.kind === "gallows-wisp"
}

function enemyRangedRange(kind: Actor["kind"] | undefined) {
  if (kind === "necromancer") return 4
  if (kind === "gallows-wisp") return 3
  return 1
}

function enemyShouldRetreat(actor: Actor) {
  if (actor.kind !== "carrion-moth") return false
  return actor.hp < Math.max(2, Math.ceil((actor.maxHp ?? actor.hp) / 2))
}

function enemyChasePatience(kind: Actor["kind"] | undefined) {
  return 4 + enemyDefenseBonus(kind) * 2
}

function fleeStunTurns(kind: Actor["kind"] | undefined) {
  return Math.max(1, 4 - enemyDefenseBonus(kind))
}

function applyFleeStun(session: GameSession, actor: Actor) {
  const ai = ensureEnemyAi(actor, 0, session.floor)
  const turns = fleeStunTurns(actor.kind)
  ai.stunnedTurns = Math.max(ai.stunnedTurns || 0, turns)
  ai.chaseTurns = 0
  ai.alerted = false
  return turns
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

function ensureEnemyAi(actor: Actor, index: number, floor: number) {
  const fallback = enemyAi(actor.kind, actor.position, index, floor)
  actor.ai ??= fallback
  actor.ai.origin ??= { ...actor.position }
  actor.ai.aggroRadius = Math.max(1, actor.ai.aggroRadius || fallback.aggroRadius)
  actor.ai.leashRadius = Math.max(actor.ai.aggroRadius, actor.ai.leashRadius || actor.ai.aggroRadius + 3)
  actor.ai.direction = actor.ai.direction === -1 ? -1 : 1
  actor.ai.alerted = Boolean(actor.ai.alerted)
  actor.ai.chaseTurns = Math.max(0, Math.floor(Number(actor.ai.chaseTurns) || 0))
  actor.ai.stunnedTurns = Math.max(0, Math.floor(Number(actor.ai.stunnedTurns) || 0))
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
  const completedQuestsBefore = new Set(session.world.quests.filter((quest) => quest.status === "completed").map((quest) => quest.id))
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
  applyCompletedQuestOutcomes(session, completedQuestsBefore)
  queueWorldMilestones(session, event)
}

function applyCompletedQuestOutcomes(session: GameSession, completedBefore: Set<string>) {
  const completedNow = session.world.quests.filter((quest) => quest.status === "completed" && !completedBefore.has(quest.id))
  for (const quest of completedNow) applyQuestOutcome(session, quest)
}

function applyQuestOutcome(session: GameSession, quest: WorldQuest) {
  const title = quest.title.toLowerCase()
  const reward = questOutcomeForTitle(title)
  if (!reward) return

  if (reward.item && !session.inventory.includes(reward.item)) session.inventory.unshift(reward.item)
  if (reward.gold) session.gold += reward.gold
  if (reward.hubCoins) session.hub.coins += reward.hubCoins
  if (reward.trustNpc) gainNpcTrust(session, reward.trustNpc, reward.trust, true)
  if (reward.maxFocus) {
    session.maxFocus += reward.maxFocus
    session.focus = Math.min(session.maxFocus, session.focus + reward.maxFocus)
  }
  if (reward.maxHp) {
    session.maxHp += reward.maxHp
    session.hp = Math.min(session.maxHp, session.hp + reward.maxHp)
  }

  session.hub.relationshipLog.unshift(`Quest outcome: ${quest.title}. ${reward.message}`)
  trimHubLog(session.hub)
  rememberKnowledge(session, {
    id: `quest-outcome-${quest.id}`,
    title: `Quest Complete: ${quest.title}`,
    text: `${quest.summary} ${reward.message}`,
    kind: "hub",
    floor: session.floor,
  })
  pushSessionMessage(session, `Quest complete: ${quest.title}. ${reward.message}`)
  addToast(session, "Quest complete", reward.message, "success")
}

function questOutcomeForTitle(title: string):
  | {
      message: string
      item?: string
      gold?: number
      hubCoins?: number
      trustNpc?: VillageNpcId
      trust: number
      maxFocus?: number
      maxHp?: number
    }
  | null {
  if (title.includes("escort")) return { message: "Cartographer trust rises and a route token joins the pack.", item: "Escort route token", hubCoins: 8, trustNpc: "cartographer", trust: 3 }
  if (title.includes("rescue")) return { message: "The rescued lead becomes a keepsake and the surgeon trusts you more.", item: "Rescue keepsake", hubCoins: 10, trustNpc: "cook", trust: 3, maxHp: 1 }
  if (title.includes("timed curse")) return { message: "A curse ward note reduces future panic and adds focus preparation.", item: "Curse ward note", gold: 8, trustNpc: "guildmaster", trust: 2, maxFocus: 1 }
  if (title.includes("shrine repair")) return { message: "Shrine repair adds a blessing clue for the final gate.", item: "Shrine repair key", hubCoins: 12, trustNpc: "guildmaster", trust: 3 }
  if (title.includes("bounty")) return { message: "Bounty proof pays out and updates the monster book.", item: "Bounty proof", gold: 16, hubCoins: 12, trustNpc: "guildmaster", trust: 4 }
  if (title.includes("merchant delivery")) return { message: "Merchant delivery improves market reputation and price tests.", item: "Delivery receipt", hubCoins: 14, trustNpc: "blacksmith", trust: 3 }
  if (title.includes("final-gate keys")) return { message: "A final-gate key is ready for the road home.", item: "Final gate key", gold: 12, hubCoins: 18, trustNpc: "cartographer", trust: 4 }
  return null
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
