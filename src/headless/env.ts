import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadAuthSession, saveAuthSession, type AuthSession } from "../cloud/authStore.js"
import { setTile, tileAt, type Actor, type Point } from "../game/dungeon.js"
import { type TileId } from "../game/domainTypes.js"
import {
  attemptFlee,
  combatSkills,
  createSession,
  currentBiome,
  cycleTarget,
  dismissSkillCheck,
  performCombatAction,
  resolveSkillCheck,
  rest,
  selectSkill,
  statusEffectMagnitude,
  statusEffectsFor,
  tryMove,
  usePotion,
  type GameSession,
  type HeroClass,
  type MultiplayerMode,
} from "../game/session.js"
import { defaultSettings, loadSettings } from "../game/settingsStore.js"
import { deleteSave, exportSave, importSave, listSaves, loadSave, renameSave, saveAutosave, saveSession, validateSave, type SaveSummary } from "../game/saveStore.js"
import { validateWorldConfig } from "../world/worldConfig.js"

export const headlessActionIds = [
  "noop",
  "move-north",
  "move-south",
  "move-west",
  "move-east",
  "rest",
  "use-potion",
  "resolve-skill-check",
  "dismiss-skill-check",
  "target-prev",
  "target-next",
  "select-skill-0",
  "select-skill-1",
  "select-skill-2",
  "select-skill-3",
  "select-skill-4",
  "select-skill-5",
  "combat-roll",
  "flee",
  "interact",
  "open-inventory",
  "open-quests",
  "open-saves",
  "open-cloud",
  "open-settings",
  "close-panel",
  "save",
  "autosave",
  "rename-latest-save",
  "export-latest-save",
  "import-last-export",
  "check-latest-save",
  "load-latest-save",
  "delete-latest-save",
] as const

export type HeadlessActionId = (typeof headlessActionIds)[number]
export type ObservationMode = "test" | "agent"
export type HeadlessPanel = "inventory" | "quests" | "saves" | "cloud" | "settings" | null
export type HeadlessActionInput = HeadlessActionId | number | { id?: HeadlessActionId; index?: number }

export type HeadlessEnvOptions = {
  seed?: number
  mode?: MultiplayerMode
  classId?: HeroClass
  heroName?: string
  observationMode?: ObservationMode
  maxSteps?: number
  isolateStorage?: boolean
}

export type HeadlessResetOptions = Omit<HeadlessEnvOptions, "isolateStorage">

export type RewardTerms = {
  step: number
  invalid: number
  floor: number
  gold: number
  kills: number
  level: number
  health: number
  victory: number
  death: number
}

export type HeadlessStepResult = {
  observation: unknown
  reward: number
  terminated: boolean
  truncated: boolean
  info: HeadlessStepInfo
}

export type HeadlessStepInfo = {
  action: HeadlessActionId
  actionIndex: number
  valid: boolean
  actionMask: number[]
  legalActions: HeadlessActionId[]
  rewardTerms: RewardTerms
  panel: HeadlessPanel
  snapshot: HeadlessSnapshot
  message?: string
  saved?: SaveSummary
  autosaved?: SaveSummary
  renamed?: SaveSummary
  exported?: SaveSummary
  imported?: SaveSummary
  loaded?: SaveSummary
  deleted?: SaveSummary
  exportPath?: string
  validationErrors?: string[]
}

export type HeadlessSnapshot = {
  seed: number
  floor: number
  turn: number
  status: GameSession["status"]
  biome: string
  player: Point
  hp: number
  focus: number
  gold: number
  xp: number
  level: number
  kills: number
  actorCount: number
  panel: HeadlessPanel
  stateHash: string
  mapHash: string
}

export type ReplayResult = {
  seed: number
  actions: HeadlessActionId[]
  steps: HeadlessStepResult[]
  finalSnapshot: HeadlessSnapshot
}

export type TestObservation = ReturnType<HeadlessGameEnv["observeTest"]>

export const agentViewRadius = 5
export const maxObservedActors = 8
export const agentObservationSize = (agentViewRadius * 2 + 1) ** 2 + 16 + 12 + maxObservedActors * 6 + 20

const movement: Partial<Record<HeadlessActionId, Point>> = {
  "move-north": { x: 0, y: -1 },
  "move-south": { x: 0, y: 1 },
  "move-west": { x: -1, y: 0 },
  "move-east": { x: 1, y: 0 },
}

const passableTiles = new Set<TileId>(["floor", "stairs", "potion", "relic", "chest", "trap"])

export class HeadlessGameEnv {
  session: GameSession
  panel: HeadlessPanel = null
  observationMode: ObservationMode
  maxSteps: number
  steps = 0
  private isolatedStorageDir: string | null = null
  private previousEnv: Record<string, string | undefined> | null = null
  private lastExportPath: string | null = null

  constructor(options: HeadlessEnvOptions = {}) {
    this.observationMode = options.observationMode ?? "test"
    this.maxSteps = options.maxSteps ?? 500
    if (options.isolateStorage) this.enableIsolatedStorage()
    this.session = createSession(options.seed, options.mode, options.classId, options.heroName)
  }

  close() {
    this.restoreStorage()
  }

  reset(options: HeadlessResetOptions = {}) {
    this.observationMode = options.observationMode ?? this.observationMode
    this.maxSteps = options.maxSteps ?? this.maxSteps
    this.steps = 0
    this.panel = null
    this.session = createSession(options.seed, options.mode, options.classId, options.heroName)
    return {
      observation: this.observe(this.observationMode),
      info: this.infoFor("noop", true, zeroRewardTerms()),
    }
  }

  step(input: HeadlessActionInput): HeadlessStepResult {
    const actionIndex = actionIndexFor(input)
    const action = headlessActionIds[actionIndex] ?? "noop"
    const legalBefore = new Set(this.legalActions())
    const valid = legalBefore.has(action)
    const before = metrics(this.session)
    let detail: Partial<
      Pick<HeadlessStepInfo, "message" | "saved" | "autosaved" | "renamed" | "exported" | "imported" | "loaded" | "deleted" | "exportPath" | "validationErrors">
    > = {}

    if (valid) detail = this.applyAction(action)
    else detail.message = `Illegal action ignored: ${action}.`

    this.steps += 1
    const after = metrics(this.session)
    const rewardTerms = computeRewardTerms(before, after, !valid)
    const terminated = this.session.status === "dead" || this.session.status === "victory"
    const truncated = !terminated && this.steps >= this.maxSteps
    const info = this.infoFor(action, valid, rewardTerms, detail)

    return {
      observation: this.observe(this.observationMode),
      reward: sumRewardTerms(rewardTerms),
      terminated,
      truncated,
      info,
    }
  }

  replay(actions: HeadlessActionInput[], resetOptions: HeadlessResetOptions = {}): ReplayResult {
    const reset = this.reset(resetOptions)
    void reset
    const resolvedActions: HeadlessActionId[] = []
    const steps: HeadlessStepResult[] = []
    for (const action of actions) {
      const result = this.step(action)
      resolvedActions.push(result.info.action)
      steps.push(result)
      if (result.terminated || result.truncated) break
    }
    return {
      seed: this.session.seed,
      actions: resolvedActions,
      steps,
      finalSnapshot: this.snapshot(),
    }
  }

  observe(mode: ObservationMode = this.observationMode) {
    return mode === "agent" ? this.observeAgent() : this.observeTest()
  }

  observeTest() {
    const saves = safeListSaves()
    const auth = safeAuthSummary()
    return {
      mode: "test" as const,
      panel: this.panel,
      steps: this.steps,
      maxSteps: this.maxSteps,
      actionIds: [...headlessActionIds],
      actionMask: this.actionMask(),
      legalActions: this.legalActions(),
      saves,
      auth,
      settings: safeLoadSettings(),
      statusEffects: this.session.statusEffects.map((effect) => ({ ...effect })),
      biome: currentBiome(this.session),
      worldValidationErrors: validateWorldConfig(this.session.world),
      snapshot: this.snapshot(),
      session: serializeSessionForObservation(this.session),
    }
  }

  observeAgent(): number[] {
    const values: number[] = []
    const radius = agentViewRadius
    for (let y = this.session.player.y - radius; y <= this.session.player.y + radius; y++) {
      for (let x = this.session.player.x - radius; x <= this.session.player.x + radius; x++) {
        values.push(tileCode(this.session, { x, y }))
      }
    }

    const statusCode = this.session.status === "victory" ? 1 : this.session.status === "dead" ? -1 : 0
    values.push(
      ratio(this.session.hp, this.session.maxHp),
      ratio(this.session.focus, this.session.maxFocus),
      bounded(this.session.gold / 100),
      bounded(this.session.xp / 100),
      bounded(this.session.level / 10),
      ratio(this.session.floor, this.session.finalFloor),
      bounded(this.session.turn / this.maxSteps),
      statusCode,
      this.session.hero.classId === "warden" ? 1 : 0,
      this.session.hero.classId === "arcanist" ? 1 : 0,
      this.session.hero.classId === "ranger" ? 1 : 0,
      this.session.mode === "solo" ? 1 : 0,
      this.session.mode === "coop" ? 1 : 0,
      this.session.mode === "race" ? 1 : 0,
      this.session.pendingWorldGeneration ? 1 : 0,
      panelCode(this.panel),
    )

    const inventory = this.session.inventory
    const visibleActorIds = new Set(visibleActors(this.session).map((actor) => actor.id))
    values.push(
      inventory.some((item) => /Deploy nerve potion/i.test(item)) ? 1 : 0,
      bounded(inventory.filter((item) => /potion|vial/i.test(item)).length / 5),
      bounded(inventory.filter((item) => /relic|shard/i.test(item)).length / 5),
      bounded(inventory.filter((item) => /scroll/i.test(item)).length / 5),
      bounded(inventory.filter((item) => /blade|sword|lockpick/i.test(item)).length / 5),
      bounded(inventory.length / 20),
      bounded(statusEffectMagnitude(this.session, "player", "guarded") / 5),
      bounded(statusEffectsFor(this.session, "player").length / 5),
      bounded(this.session.statusEffects.filter((effect) => effect.id === "weakened" && visibleActorIds.has(effect.targetId)).length / 5),
      bounded(this.session.statusEffects.filter((effect) => effect.id === "burning" && visibleActorIds.has(effect.targetId)).length / 5),
      safeListSaves().length > 0 ? 1 : 0,
      safeAuthSummary().loggedIn ? 1 : 0,
    )

    const actors = visibleActors(this.session)
      .sort((left, right) => distance(left.position, this.session.player) - distance(right.position, this.session.player))
      .slice(0, maxObservedActors)
    for (let index = 0; index < maxObservedActors; index++) {
      const actor = actors[index]
      if (!actor) {
        values.push(0, 0, 0, 0, 0, 0)
        continue
      }
      values.push(
        bounded((actor.position.x - this.session.player.x) / radius),
        bounded((actor.position.y - this.session.player.y) / radius),
        bounded(actor.hp / 20),
        bounded(actor.damage / 10),
        actorKindCode(actor.kind),
        actor.ai?.alerted ? 1 : 0,
      )
    }

    const skillCheck = this.session.skillCheck
    const completedEvents = this.session.world.events.filter((event) => event.status === "completed").length
    const selectedTargetId = this.session.combat.active
      ? this.session.combat.actorIds[this.session.combat.selectedTarget]
      : undefined
    values.push(
      this.session.combat.active ? 1 : 0,
      bounded(this.session.combat.actorIds.length / 8),
      bounded(this.session.combat.selectedTarget / Math.max(1, this.session.combat.actorIds.length)),
      bounded(this.session.combat.selectedSkill / Math.max(1, combatSkills.length - 1)),
      bounded((combatSkills[this.session.combat.selectedSkill]?.cost ?? 0) / 5),
      this.legalActions().includes("combat-roll") ? 1 : 0,
      skillCheck?.status === "pending" ? 1 : 0,
      skillCheck?.status === "resolved" ? 1 : 0,
      statCode(skillCheck?.stat),
      bounded((skillCheck?.dc ?? 0) / 25),
      sourceCode(skillCheck?.source),
      bounded(this.session.visible.size / 250),
      bounded(this.session.seen.size / 2000),
      bounded(this.session.kills / 50),
      bounded(this.session.finalFloor / 20),
      bounded(completedEvents / Math.max(1, this.session.world.events.length)),
      bounded(this.session.statusEffects.length / 10),
      selectedTargetId ? bounded(statusEffectMagnitude(this.session, selectedTargetId, "weakened") / 5) : 0,
      selectedTargetId ? bounded(statusEffectMagnitude(this.session, selectedTargetId, "burning") / 5) : 0,
      bounded(statusEffectsFor(this.session, "player").reduce((highest, effect) => Math.max(highest, effect.remainingTurns), 0) / 5),
    )

    while (values.length < agentObservationSize) values.push(0)
    return values.slice(0, agentObservationSize)
  }

  legalActions(): HeadlessActionId[] {
    const actions = new Set<HeadlessActionId>(["noop"])

    if (this.session.status === "running") {
      actions.add("open-inventory")
      actions.add("open-quests")
      actions.add("open-saves")
      actions.add("open-cloud")
      actions.add("open-settings")
      if (this.panel) actions.add("close-panel")
      actions.add("save")
      actions.add("autosave")

      if (this.session.skillCheck?.status === "pending") {
        actions.add("resolve-skill-check")
        actions.add("interact")
        return sortedActions(actions)
      }
      if (this.session.skillCheck?.status === "resolved") {
        actions.add("dismiss-skill-check")
        actions.add("interact")
        return sortedActions(actions)
      }

      if (hasDeployPotion(this.session)) actions.add("use-potion")

      if (this.session.combat.active) {
        actions.add("flee")
        actions.add("interact")
        if (this.session.combat.actorIds.length > 1) {
          actions.add("target-prev")
          actions.add("target-next")
        }
        for (let index = 0; index < combatSkills.length; index++) actions.add(`select-skill-${index}` as HeadlessActionId)
        const skill = combatSkills[this.session.combat.selectedSkill]
        if (skill && this.session.focus >= skill.cost && this.session.combat.actorIds.length > 0) actions.add("combat-roll")
        return sortedActions(actions)
      }

      for (const action of ["move-north", "move-south", "move-west", "move-east"] as const) {
        if (canMove(this.session, movement[action]!)) actions.add(action)
      }
      actions.add("rest")
      actions.add("interact")
    }

    if (safeListSaves().length > 0) {
      actions.add("load-latest-save")
      actions.add("delete-latest-save")
      actions.add("rename-latest-save")
      actions.add("export-latest-save")
      actions.add("check-latest-save")
    }
    if (this.lastExportPath) actions.add("import-last-export")

    if (this.panel) actions.add("close-panel")
    return sortedActions(actions)
  }

  actionMask() {
    const legal = new Set(this.legalActions())
    return headlessActionIds.map((action) => (legal.has(action) ? 1 : 0))
  }

  renderText(radius = agentViewRadius) {
    const rows: string[] = []
    rows.push(
      `opendungeon headless seed=${this.session.seed} floor=${this.session.floor}/${this.session.finalFloor} turn=${this.session.turn} status=${this.session.status} biome=${currentBiome(this.session)}`,
    )
    rows.push(`hp=${this.session.hp}/${this.session.maxHp} focus=${this.session.focus}/${this.session.maxFocus} gold=${this.session.gold} kills=${this.session.kills}`)
    for (let y = this.session.player.y - radius; y <= this.session.player.y + radius; y++) {
      let row = ""
      for (let x = this.session.player.x - radius; x <= this.session.player.x + radius; x++) {
        const point = { x, y }
        const actor = this.session.dungeon.actors.find((candidate) => samePoint(candidate.position, point))
        if (samePoint(this.session.player, point)) row += "@"
        else if (actor) row += actor.kind === "slime" ? "s" : actor.kind === "ghoul" ? "g" : "n"
        else row += tileGlyph(tileAt(this.session.dungeon, point))
      }
      rows.push(row)
    }
    rows.push(`legal=${this.legalActions().join(",")}`)
    if (this.session.log[0]) rows.push(`log=${this.session.log[0]}`)
    return rows.join("\n")
  }

  snapshot(): HeadlessSnapshot {
    const serial = {
      seed: this.session.seed,
      floor: this.session.floor,
      turn: this.session.turn,
      status: this.session.status,
      biome: currentBiome(this.session),
      player: this.session.player,
      hp: this.session.hp,
      focus: this.session.focus,
      gold: this.session.gold,
      xp: this.session.xp,
      level: this.session.level,
      kills: this.session.kills,
      actors: this.session.dungeon.actors.map((actor) => ({
        id: actor.id,
        kind: actor.kind,
        hp: actor.hp,
        damage: actor.damage,
        position: actor.position,
        ai: actor.ai,
      })),
      inventory: this.session.inventory,
      skillCheck: this.session.skillCheck
        ? {
            id: this.session.skillCheck.id,
            source: this.session.skillCheck.source,
            status: this.session.skillCheck.status,
            stat: this.session.skillCheck.stat,
            dc: this.session.skillCheck.dc,
            point: this.session.skillCheck.point,
            roll: this.session.skillCheck.roll,
          }
        : null,
      combat: this.session.combat,
      statusEffects: this.session.statusEffects,
      world: {
        worldId: this.session.world.worldId,
        generation: this.session.world.generation,
        nextMilestoneAt: this.session.world.nextMilestoneAt,
        eventStatuses: this.session.world.events.map((event) => [event.id, event.status]),
        questStatuses: this.session.world.quests.map((quest) => [quest.id, quest.status]),
      },
      panel: this.panel,
    }
    return {
      seed: this.session.seed,
      floor: this.session.floor,
      turn: this.session.turn,
      status: this.session.status,
      biome: currentBiome(this.session),
      player: { ...this.session.player },
      hp: this.session.hp,
      focus: this.session.focus,
      gold: this.session.gold,
      xp: this.session.xp,
      level: this.session.level,
      kills: this.session.kills,
      actorCount: this.session.dungeon.actors.length,
      panel: this.panel,
      stateHash: stableHash(serial),
      mapHash: mapFingerprint(this.session),
    }
  }

  validateInvariants() {
    return validateHeadlessInvariants(this.session)
  }

  setRelativeTile(dx: number, dy: number, tile: TileId) {
    setTile(this.session.dungeon, { x: this.session.player.x + dx, y: this.session.player.y + dy }, tile)
  }

  placeRelativeActor(options: { id: string; kind: Actor["kind"]; dx: number; dy: number; hp?: number; damage?: number }) {
    const position = { x: this.session.player.x + options.dx, y: this.session.player.y + options.dy }
    setTile(this.session.dungeon, position, "floor")
    this.session.dungeon.actors = this.session.dungeon.actors.filter((actor) => actor.id !== options.id && !samePoint(actor.position, position))
    this.session.dungeon.actors.push({
      id: options.id,
      kind: options.kind,
      position,
      hp: options.hp ?? 3,
      damage: options.damage ?? 0,
    })
  }

  addItem(item: string) {
    this.session.inventory.unshift(item)
  }

  setStat(stat: keyof GameSession["stats"], value: number) {
    this.session.stats[stat] = value
  }

  setGold(value: number) {
    this.session.gold = value
  }

  setHeroName(name: string) {
    this.session.hero.name = name.replace(/[^\w .'-]/g, "").trim().slice(0, 24) || "Mira"
  }

  damagePlayer(amount: number) {
    this.session.hp = Math.max(0, this.session.hp - Math.max(0, amount))
  }

  saveLocalTestAuth(provider: AuthSession["provider"] = "password") {
    saveAuthSession({
      provider,
      username: provider === "github" ? "github-test" : "test",
      accessToken: provider === "github" ? "github-test-token" : "local-test-user-session",
      tokenType: "bearer",
      createdAt: new Date(0).toISOString(),
      expiresAt: new Date(Date.UTC(2099, 0, 1)).toISOString(),
    })
  }

  private applyAction(
    action: HeadlessActionId,
  ): Partial<Pick<HeadlessStepInfo, "message" | "saved" | "autosaved" | "renamed" | "exported" | "imported" | "loaded" | "deleted" | "exportPath" | "validationErrors">> {
    if (action === "noop") return { message: "No-op." }
    if (action === "close-panel") {
      this.panel = null
      return { message: "Panel closed." }
    }
    if (action === "open-inventory") return this.openPanel("inventory")
    if (action === "open-quests") return this.openPanel("quests")
    if (action === "open-saves") return this.openPanel("saves")
    if (action === "open-cloud") return this.openPanel("cloud")
    if (action === "open-settings") return this.openPanel("settings")
    if (action === "save") {
      const saved = saveSession(this.session, "Headless save")
      return { saved, message: `Saved ${saved.name}.` }
    }
    if (action === "autosave") {
      const autosaved = saveAutosave(this.session)
      return { autosaved, message: `Autosaved ${autosaved.name}.` }
    }
    if (action === "rename-latest-save") {
      const latest = safeListSaves()[0]
      if (!latest) return { message: "No save to rename." }
      const renamed = renameSave(latest.id, "Headless renamed save")
      return { renamed, message: `Renamed ${renamed.name}.` }
    }
    if (action === "export-latest-save") {
      const latest = safeListSaves()[0]
      if (!latest) return { message: "No save to export." }
      const exportPath = join(this.isolatedStorageDir ?? tmpdir(), `opendungeon-export-${Date.now().toString(36)}.json`)
      const exported = exportSave(latest.id, exportPath)
      this.lastExportPath = exportPath
      return { exported, exportPath, message: `Exported ${exported.name}.` }
    }
    if (action === "import-last-export") {
      if (!this.lastExportPath) return { message: "No exported save to import." }
      const imported = importSave(this.lastExportPath, "Headless imported save")
      return { imported, message: `Imported ${imported.name}.` }
    }
    if (action === "check-latest-save") {
      const latest = safeListSaves()[0]
      if (!latest) return { validationErrors: ["No save to check."], message: "No save to check." }
      const validationErrors = validateSave(latest.id)
      return { validationErrors, message: validationErrors.length ? validationErrors.join(" ") : `Save ${latest.id} is valid.` }
    }
    if (action === "load-latest-save") {
      const loaded = safeListSaves()[0]
      if (!loaded) return { message: "No save to load." }
      this.session = loadSave(loaded.id)
      this.panel = null
      return { loaded, message: `Loaded ${loaded.name}.` }
    }
    if (action === "delete-latest-save") {
      const deleted = safeListSaves()[0]
      if (!deleted) return { message: "No save to delete." }
      deleteSave(deleted.id)
      return { deleted, message: `Deleted ${deleted.name}.` }
    }

    if (action === "resolve-skill-check") {
      const roll = resolveSkillCheck(this.session)
      return { message: roll ? roll.consequence : "No pending skill check." }
    }
    if (action === "dismiss-skill-check") {
      dismissSkillCheck(this.session)
      return { message: "Skill check dismissed." }
    }
    if (action === "interact") {
      if (this.session.skillCheck?.status === "pending") return this.applyAction("resolve-skill-check")
      if (this.session.skillCheck?.status === "resolved") return this.applyAction("dismiss-skill-check")
      if (this.session.combat.active) return this.applyAction("combat-roll")
      this.session.log.unshift("Nothing answers here yet.")
      while (this.session.log.length > 8) this.session.log.pop()
      return { message: "Nothing answers here yet." }
    }
    if (action === "target-prev") {
      cycleTarget(this.session, -1)
      return { message: this.session.combat.message }
    }
    if (action === "target-next") {
      cycleTarget(this.session, 1)
      return { message: this.session.combat.message }
    }
    if (action.startsWith("select-skill-")) {
      selectSkill(this.session, Number(action.at(-1)))
      return { message: this.session.combat.message }
    }
    if (action === "combat-roll") {
      performCombatAction(this.session)
      return { message: this.session.combat.message }
    }
    if (action === "flee") {
      const roll = attemptFlee(this.session)
      return { message: roll ? this.session.combat.message : "No fight to flee." }
    }
    if (action === "rest") {
      rest(this.session)
      return { message: this.session.log[0] }
    }
    if (action === "use-potion") {
      usePotion(this.session)
      return { message: this.session.log[0] }
    }

    const move = movement[action]
    if (move) {
      tryMove(this.session, move.x, move.y)
      return { message: this.session.log[0] }
    }

    return { message: `Unhandled action ${action}.` }
  }

  private infoFor(
    action: HeadlessActionId,
    valid: boolean,
    rewardTerms: RewardTerms,
    detail: Partial<
      Pick<HeadlessStepInfo, "message" | "saved" | "autosaved" | "renamed" | "exported" | "imported" | "loaded" | "deleted" | "exportPath" | "validationErrors">
    > = {},
  ): HeadlessStepInfo {
    return {
      action,
      actionIndex: headlessActionIds.indexOf(action),
      valid,
      actionMask: this.actionMask(),
      legalActions: this.legalActions(),
      rewardTerms,
      panel: this.panel,
      snapshot: this.snapshot(),
      ...detail,
    }
  }

  private openPanel(panel: Exclude<HeadlessPanel, null>) {
    this.panel = panel
    return { message: `${panel} panel opened.` }
  }

  private enableIsolatedStorage() {
    if (this.previousEnv) return
    const dir = mkdtempSync(join(tmpdir(), "opendungeon-headless-"))
    this.isolatedStorageDir = dir
    this.previousEnv = {
      OPENDUNGEON_SAVE_DIR: process.env.OPENDUNGEON_SAVE_DIR,
      OPENDUNGEON_PROFILE_DIR: process.env.OPENDUNGEON_PROFILE_DIR,
      OPENDUNGEON_AUTH_DIR: process.env.OPENDUNGEON_AUTH_DIR,
      OPENDUNGEON_WORLD_DIR: process.env.OPENDUNGEON_WORLD_DIR,
    }
    process.env.OPENDUNGEON_SAVE_DIR = join(dir, "saves")
    process.env.OPENDUNGEON_PROFILE_DIR = join(dir, "profile")
    process.env.OPENDUNGEON_AUTH_DIR = join(dir, "auth")
    process.env.OPENDUNGEON_WORLD_DIR = join(dir, "worlds")
  }

  private restoreStorage() {
    if (!this.previousEnv) return
    for (const [key, value] of Object.entries(this.previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    this.previousEnv = null
    if (this.isolatedStorageDir && existsSync(this.isolatedStorageDir)) rmSync(this.isolatedStorageDir, { recursive: true, force: true })
    this.isolatedStorageDir = null
  }
}

export function actionIndexFor(input: HeadlessActionInput): number {
  if (typeof input === "number") return input
  if (typeof input === "string") return headlessActionIds.indexOf(input)
  if (typeof input.index === "number") return input.index
  if (input.id) return headlessActionIds.indexOf(input.id)
  return -1
}

export function actionIdFor(input: HeadlessActionInput): HeadlessActionId {
  return headlessActionIds[actionIndexFor(input)] ?? "noop"
}

export function mapFingerprint(session: GameSession) {
  return stableHash({
    seed: session.dungeon.seed,
    floor: session.dungeon.floor,
    width: session.dungeon.width,
    height: session.dungeon.height,
    tiles: session.dungeon.tiles.map((row) => row.join("")),
    playerStart: session.dungeon.playerStart,
    anchors: session.dungeon.anchors,
  })
}

export function validateHeadlessInvariants(session: GameSession): string[] {
  const errors: string[] = []
  const playerTile = tileAt(session.dungeon, session.player)
  if (!passableTiles.has(playerTile)) errors.push(`Player is on non-passable tile ${playerTile}.`)

  const occupied = new Set<string>()
  for (const actor of session.dungeon.actors) {
    const key = `${actor.position.x},${actor.position.y}`
    const actorTile = tileAt(session.dungeon, actor.position)
    if (!passableTiles.has(actorTile)) errors.push(`Actor ${actor.id} is on non-passable tile ${actorTile}.`)
    if (samePoint(actor.position, session.player)) errors.push(`Actor ${actor.id} overlaps the player.`)
    if (occupied.has(key)) errors.push(`Multiple actors occupy ${key}.`)
    occupied.add(key)
  }

  const stairs = findTile(session, "stairs")
  if (!stairs) errors.push("Dungeon has no stairs.")
  else if (!isReachable(session.dungeon, session.dungeon.playerStart, stairs)) errors.push("Stairs are not reachable from the player start.")

  for (const anchor of session.dungeon.anchors) {
    if (anchor.position.x < 0 || anchor.position.y < 0 || anchor.position.x >= session.dungeon.width || anchor.position.y >= session.dungeon.height) {
      errors.push(`Dungeon anchor ${anchor.id} is out of bounds.`)
    }
  }

  errors.push(...validateWorldConfig(session.world).map((error) => `World config: ${error}`))
  const worldAnchorIds = new Set(session.world.anchors.map((anchor) => anchor.id))
  for (const event of session.world.events) {
    if (!worldAnchorIds.has(event.anchorId)) errors.push(`World event ${event.id} references missing anchor ${event.anchorId}.`)
  }
  return errors
}

function sortedActions(actions: Set<HeadlessActionId>) {
  return headlessActionIds.filter((action) => actions.has(action))
}

function canMove(session: GameSession, delta: Point) {
  const target = { x: session.player.x + delta.x, y: session.player.y + delta.y }
  if (session.dungeon.actors.some((actor) => samePoint(actor.position, target))) return true
  return passableTiles.has(tileAt(session.dungeon, target))
}

function serializeSessionForObservation(session: GameSession) {
  return {
    ...session,
    visible: [...session.visible].sort(),
    seen: [...session.seen].sort(),
    dungeon: {
      ...session.dungeon,
      tiles: session.dungeon.tiles.map((row) => [...row]),
      actors: session.dungeon.actors.map((actor) => ({
        ...actor,
        position: { ...actor.position },
        ai: actor.ai ? { ...actor.ai, origin: { ...actor.ai.origin } } : undefined,
      })),
      playerStart: { ...session.dungeon.playerStart },
      anchors: session.dungeon.anchors.map((anchor) => ({ ...anchor, position: { ...anchor.position } })),
    },
  }
}

function safeListSaves(): SaveSummary[] {
  try {
    return listSaves()
  } catch {
    return []
  }
}

function safeLoadSettings() {
  try {
    return loadSettings()
  } catch {
    return { ...defaultSettings }
  }
}

function safeAuthSummary() {
  try {
    const session = loadAuthSession()
    return session
      ? {
          loggedIn: true,
          provider: session.provider,
          username: session.username,
          expiresAt: session.expiresAt,
          userId: session.userId,
          email: session.email,
        }
      : { loggedIn: false as const }
  } catch {
    return { loggedIn: false as const }
  }
}

function metrics(session: GameSession) {
  return {
    floor: session.floor,
    gold: session.gold,
    kills: session.kills,
    level: session.level,
    hp: session.hp,
    status: session.status,
  }
}

function zeroRewardTerms(): RewardTerms {
  return {
    step: 0,
    invalid: 0,
    floor: 0,
    gold: 0,
    kills: 0,
    level: 0,
    health: 0,
    victory: 0,
    death: 0,
  }
}

function computeRewardTerms(before: ReturnType<typeof metrics>, after: ReturnType<typeof metrics>, invalid: boolean): RewardTerms {
  return {
    step: -0.01,
    invalid: invalid ? -0.25 : 0,
    floor: (after.floor - before.floor) * 10,
    gold: (after.gold - before.gold) * 0.02,
    kills: (after.kills - before.kills) * 1,
    level: (after.level - before.level) * 1,
    health: (after.hp - before.hp) * 0.05,
    victory: before.status !== "victory" && after.status === "victory" ? 25 : 0,
    death: before.status !== "dead" && after.status === "dead" ? -10 : 0,
  }
}

function sumRewardTerms(terms: RewardTerms) {
  return Object.values(terms).reduce((total, value) => total + value, 0)
}

function tileCode(session: GameSession, point: Point) {
  if (point.x < 0 || point.y < 0 || point.x >= session.dungeon.width || point.y >= session.dungeon.height) return -1
  const key = `${point.x},${point.y}`
  if (!session.seen.has(key) && !session.visible.has(key)) return 0
  const actor = session.dungeon.actors.find((candidate) => samePoint(candidate.position, point))
  if (actor && session.visible.has(key)) return 7 + actorKindCode(actor.kind)
  const tile = tileAt(session.dungeon, point)
  if (tile === "wall") return 1
  if (tile === "floor") return 2
  if (tile === "stairs") return 3
  if (tile === "potion") return 4
  if (tile === "relic") return 5
  if (tile === "chest") return 6
  if (tile === "trap") return 10
  return 0
}

function tileGlyph(tile: TileId) {
  if (tile === "wall") return "#"
  if (tile === "stairs") return ">"
  if (tile === "potion") return "!"
  if (tile === "relic") return "*"
  if (tile === "chest") return "$"
  if (tile === "trap") return "^"
  if (tile === "void") return " "
  return "."
}

function visibleActors(session: GameSession) {
  return session.dungeon.actors.filter((actor) => session.visible.has(`${actor.position.x},${actor.position.y}`))
}

function actorKindCode(kind: Actor["kind"]) {
  if (kind === "slime") return 0.25
  if (kind === "ghoul") return 0.5
  return 1
}

function statCode(stat: string | undefined) {
  if (stat === "vigor") return 0.125
  if (stat === "mind") return 0.25
  if (stat === "endurance") return 0.375
  if (stat === "strength") return 0.5
  if (stat === "dexterity") return 0.625
  if (stat === "intelligence") return 0.75
  if (stat === "faith") return 0.875
  if (stat === "luck") return 1
  return 0
}

function sourceCode(source: string | undefined) {
  if (source === "potion") return 0.33
  if (source === "relic") return 0.66
  if (source === "chest") return 1
  return 0
}

function panelCode(panel: HeadlessPanel) {
  if (panel === "inventory") return 0.2
  if (panel === "quests") return 0.4
  if (panel === "saves") return 0.6
  if (panel === "cloud") return 0.8
  if (panel === "settings") return 1
  return 0
}

function hasDeployPotion(session: GameSession) {
  return session.inventory.some((item) => item === "Deploy nerve potion")
}

function ratio(value: number, max: number) {
  return max > 0 ? bounded(value / max) : 0
}

function bounded(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(-10, Math.min(10, value))
}

function findTile(session: GameSession, tile: TileId): Point | null {
  for (let y = 0; y < session.dungeon.height; y++) {
    for (let x = 0; x < session.dungeon.width; x++) {
      if (session.dungeon.tiles[y][x] === tile) return { x, y }
    }
  }
  return null
}

function isReachable(dungeon: GameSession["dungeon"], start: Point, target: Point) {
  const queue = [start]
  const seen = new Set([`${start.x},${start.y}`])
  while (queue.length) {
    const point = queue.shift()!
    if (samePoint(point, target)) return true
    for (const next of [
      { x: point.x + 1, y: point.y },
      { x: point.x - 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x, y: point.y - 1 },
    ]) {
      const key = `${next.x},${next.y}`
      if (seen.has(key) || !passableTiles.has(tileAt(dungeon, next))) continue
      seen.add(key)
      queue.push(next)
    }
  }
  return false
}

function samePoint(left: Point, right: Point) {
  return left.x === right.x && left.y === right.y
}

function distance(left: Point, right: Point) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y)
}

function stableHash(value: unknown) {
  const text = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`
}
