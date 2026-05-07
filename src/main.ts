import { FrameBufferRenderable, createCliRenderer, type KeyEvent } from "@opentui/core"
import {
  createSession,
  cycleTarget,
  dismissSkillCheck,
  performCombatAction,
  rest,
  resolveSkillCheck,
  selectSkill,
  tryMove,
  usePotion,
  type GameSession,
  type HeroClass,
  type MultiplayerMode,
} from "./game/session.js"
import { deleteSave, listSaves, loadSave, saveSession, type SaveSummary } from "./game/saveStore.js"
import { loadSettings, saveSettings, type UserSettings } from "./game/settingsStore.js"
import { diceSkinIds } from "./assets/diceSkins.js"
import {
  currentClass,
  currentMode,
  currentStartItem,
  currentSettingItem,
  moveSelection,
  paint,
  type AppModel,
} from "./ui/screens.js"
import { shouldUseThreeRenderer } from "./rendering/threeAssets.js"

const initialSaves = listSaves()
const initialSettings = loadSettings()

const model: AppModel = {
  screen: "start",
  dialog: null,
  menuIndex: initialSaves.length ? 0 : 1,
  classIndex: classIndexFromEnv(),
  modeIndex: modeIndexFromEnv(),
  seed: seedFromEnv(),
  session: createSession(seedFromEnv(), modeFromEnv(), classFromEnv()),
  message: "",
  saves: initialSaves,
  saveIndex: 0,
  saveStatus: "",
  debugView: env("OPENDUNGEON_DEBUG_VIEW", "DUNGEON_DEBUG_VIEW") === "1",
  rendererBackend: shouldUseThreeRenderer() ? "three" : "terminal",
  settings: initialSettings,
  settingsIndex: 0,
  settingsReturnScreen: "start",
  inputMode: null,
  diceRollAnimation: null,
}
let submittedSession: GameSession | null = null
let diceTimer: ReturnType<typeof setTimeout> | null = null
let destroyed = false
let pendingDeleteSaveId: string | null = null

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  screenMode: "alternate-screen",
  targetFps: 30,
  maxFps: 30,
  consoleMode: model.debugView ? "console-overlay" : "disabled",
  openConsoleOnError: model.debugView,
  backgroundColor: "#05070a",
})
renderer.setTerminalTitle("opendungeon")

const screen = new FrameBufferRenderable(renderer, {
  id: "screen",
  position: "absolute",
  left: 0,
  top: 0,
  width: renderer.terminalWidth,
  height: renderer.terminalHeight,
})

renderer.root.add(screen)
renderer.on("resize", refresh)
refresh()

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (key.ctrl && key.name === "c") {
    destroyApp()
    return
  }

  if (model.inputMode) {
    handleInputKey(key)
    refresh()
    return
  }

  if (isSaveKey(key)) {
    saveCurrentRun()
    refresh()
    return
  }

  if (model.screen === "game" && model.session.skillCheck) {
    handleSkillCheckKey(key)
    refresh()
    return
  }

  if (model.dialog) {
    handleDialogKey(key)
    refresh()
    return
  }

  if (key.name === "q") {
    destroyApp()
    return
  }

  if (model.screen === "game") handleGameKey(key)
  else handleMenuKey(key)

  maybeSubmitLobbyResult()
  refresh()
})

function handleDialogKey(key: KeyEvent) {
  if (key.name === "escape" || key.name === "return" || key.name === "enter" || key.name === "linefeed") model.dialog = null
  if (model.dialog === "pause" && key.name === "s") {
    model.dialog = null
    openSettings("game")
  }
  if (model.dialog === "pause" && key.name === "q") destroyApp()
}

function handleSkillCheckKey(key: KeyEvent) {
  const check = model.session.skillCheck
  if (!check) return
  if (check.status === "pending") {
    if (isConfirmKey(key)) {
      const roll = resolveSkillCheck(model.session)
      if (roll) startDiceRollAnimation(roll.d20)
    }
    return
  }

  if (isConfirmKey(key) || key.name === "escape") dismissSkillCheck(model.session)
}

function handleMenuKey(key: KeyEvent) {
  if (model.screen === "saves") {
    if (isUpKey(key)) {
      pendingDeleteSaveId = null
      moveSelection(model, -1)
    }
    if (isDownKey(key)) {
      pendingDeleteSaveId = null
      moveSelection(model, 1)
    }
    if (key.name === "r") {
      pendingDeleteSaveId = null
      refreshSaveList()
    }
    if (key.name === "d") deleteSelectedSave()
    if (key.name === "escape") {
      pendingDeleteSaveId = null
      model.screen = "start"
      model.menuIndex = 0
    }
    if (isConfirmKey(key)) loadSelectedSave()
    return
  }

  if (model.screen === "cloud") {
    if (isUpKey(key)) moveSelection(model, -1)
    if (isDownKey(key)) moveSelection(model, 1)
    if (key.name === "u") startInput("githubUsername")
    if (key.name === "escape") {
      model.screen = "start"
      model.menuIndex = 0
    }
    if (isConfirmKey(key)) confirmCloud()
    return
  }

  if (model.screen === "settings") {
    if (isUpKey(key)) moveSelection(model, -1)
    if (isDownKey(key)) moveSelection(model, 1)
    if (key.name === "u") startInput("username")
    if (key.name === "c") {
      model.screen = "controls"
      model.menuIndex = 0
    }
    if (key.name === "escape") closeSettings()
    if (isConfirmKey(key)) changeCurrentSetting()
    return
  }

  if (model.screen === "controls") {
    if (key.name === "s") openSettings(model.settingsReturnScreen)
    if (key.name === "escape" || isConfirmKey(key)) {
      model.screen = model.settingsReturnScreen === "game" ? "game" : "start"
      model.menuIndex = 0
    }
    return
  }

  if (isUpKey(key)) moveSelection(model, -1)
  if (isDownKey(key)) moveSelection(model, 1)
  if (model.screen === "start" && key.name === "c") loadLatestSave()
  if (model.screen === "start" && key.name === "n") model.seed = randomSeed()
  if (key.name === "escape") {
    model.screen = "start"
    model.menuIndex = 0
  }
  if (key.name === "?" || (key.shift && key.name === "/")) model.dialog = "help"
  if (isConfirmKey(key)) confirmMenu()
}

function handleGameKey(key: KeyEvent) {
  if (model.session.status !== "running") {
    if (isConfirmKey(key)) startRun()
    if (key.name === "escape") {
      model.screen = "start"
      model.menuIndex = 0
    }
    return
  }

  if (key.name === "escape") {
    model.dialog = "pause"
    return
  }
  if (key.name === "i") {
    model.dialog = "inventory"
    return
  }
  if (key.name === "l") {
    model.dialog = "log"
    return
  }
  if (key.name === "r") {
    rest(model.session)
    return
  }
  if (key.name === "h") {
    usePotion(model.session)
    return
  }
  if (key.name === "?" || (key.shift && key.name === "/")) {
    model.dialog = "help"
    return
  }

  if (model.session.combat.active) {
    handleCombatKey(key)
    return
  }

  const move = movementForKey(key, model.settings)
  if (move) tryMove(model.session, move.dx, move.dy)
}

function handleCombatKey(key: KeyEvent) {
  if (key.name === "tab" || isRightKey(key)) {
    cycleTarget(model.session, 1)
    return
  }
  if (isLeftKey(key)) {
    cycleTarget(model.session, -1)
    return
  }
  if (key.name === "1" || key.name === "2" || key.name === "3") {
    selectSkill(model.session, Number(key.name) - 1)
    return
  }
  if (isConfirmKey(key)) {
    const previousRoll = model.session.combat.lastRoll
    performCombatAction(model.session)
    const nextRoll = model.session.combat.lastRoll
    if (nextRoll && nextRoll !== previousRoll) startDiceRollAnimation(nextRoll.d20)
  }
}

function confirmMenu() {
  if (model.screen === "start") {
    const item = currentStartItem(model)
    if (item === "Continue last") loadLatestSave()
    if (item === "New descent") startRun()
    if (item === "Load save") openSaveBrowser()
    if (item === "Character") {
      model.screen = "character"
      model.menuIndex = model.classIndex
    }
    if (item === "Multiplayer") {
      model.screen = "mode"
      model.menuIndex = model.modeIndex
    }
    if (item === "Cloud login") {
      model.screen = "cloud"
      model.menuIndex = 0
    }
    if (item === "Settings") openSettings("start")
    if (item === "Controls") {
      model.screen = "controls"
      model.menuIndex = 0
      model.settingsReturnScreen = "start"
    }
    if (item === "Quit") destroyApp()
    return
  }

  if (model.screen === "character") {
    model.classIndex = model.menuIndex
    model.screen = "start"
    model.menuIndex = 0
    return
  }

  if (model.screen === "mode") {
    model.modeIndex = model.menuIndex
    model.screen = "start"
    model.menuIndex = 0
  }
}

function startRun() {
  model.session = createSession(model.seed, currentMode(model).id, currentClass(model).id)
  submittedSession = null
  model.screen = "game"
  model.dialog = null
  model.saveStatus = "New run started. Press Ctrl+S or F5 to save locally."
}

function openSaveBrowser() {
  refreshSaveList()
  model.screen = "saves"
  model.menuIndex = 0
}

function refreshSaveList() {
  model.saves = listSaves()
  model.saveIndex = clamp(model.saveIndex, 0, Math.max(0, model.saves.length - 1))
  model.saveStatus = model.saves.length ? `${model.saves.length} local save${model.saves.length === 1 ? "" : "s"} found.` : "No local saves found yet."
}

function loadSelectedSave() {
  const summary = model.saves[model.saveIndex]
  if (!summary) {
    model.saveStatus = "No local save selected."
    return
  }

  try {
    pendingDeleteSaveId = null
    const session = loadSave(summary.id)
    session.log.unshift(`Loaded local save: ${summary.name}.`)
    while (session.log.length > 8) session.log.pop()
    model.session = session
    model.seed = session.seed
    model.classIndex = classIndexFor(session.hero.classId)
    model.modeIndex = modeIndexFor(session.mode)
    model.screen = "game"
    model.dialog = null
    model.diceRollAnimation = null
    model.saveStatus = `Loaded ${summary.name}.`
    submittedSession = null
  } catch (error) {
    const status = error instanceof Error ? error.message : "Save failed to load."
    refreshSaveList()
    model.saveStatus = status
  }
}

function deleteSelectedSave() {
  const summary = model.saves[model.saveIndex]
  if (!summary) {
    model.saveStatus = "No local save selected."
    return
  }

  if (pendingDeleteSaveId !== summary.id) {
    pendingDeleteSaveId = summary.id
    model.saveStatus = `Press d again to delete ${summary.name}.`
    return
  }

  try {
    deleteSave(summary.id)
    pendingDeleteSaveId = null
    refreshSaveList()
    model.saveStatus = `Deleted ${summary.name}.`
  } catch (error) {
    pendingDeleteSaveId = null
    model.saveStatus = error instanceof Error ? error.message : "Save delete failed."
  }
}

function loadLatestSave() {
  refreshSaveList()
  if (!model.saves.length) {
    model.saveStatus = "No local saves yet. Start a descent and press Ctrl+S or F5."
    model.menuIndex = 1
    return
  }

  model.saveIndex = 0
  loadSelectedSave()
}

function saveCurrentRun() {
  if (model.screen !== "game") return
  const summary = saveSession(model.session)
  model.saves = listSaves()
  model.saveIndex = indexForSave(model.saves, summary)
  model.saveStatus = `Saved locally: ${summary.name}.`
  model.session.log.unshift(`Saved locally: ${summary.name}.`)
  while (model.session.log.length > 8) model.session.log.pop()
}

function confirmCloud() {
  if (model.menuIndex === 0) {
    if (!model.settings.githubUsername) {
      startInput("githubUsername")
      return
    }
    model.settings.cloudProvider = "github"
    saveUserSettings("GitHub profile selected. Device login is still on the roadmap.")
    return
  }

  if (model.menuIndex === 1) {
    model.settings.cloudProvider = "local"
    saveUserSettings("Local profile selected. Cloud sync remains off.")
    return
  }

  model.screen = "start"
  model.menuIndex = 0
}

function openSettings(returnScreen: AppModel["settingsReturnScreen"]) {
  model.screen = "settings"
  model.settingsReturnScreen = returnScreen
  model.menuIndex = model.settingsIndex
}

function closeSettings() {
  model.inputMode = null
  model.screen = model.settingsReturnScreen === "game" ? "game" : "start"
  model.menuIndex = 0
}

function changeCurrentSetting() {
  const item = currentSettingItem(model)
  if (item.id === "username") {
    startInput("username")
    return
  }
  if (item.id === "controlScheme") model.settings.controlScheme = cycleValue(model.settings.controlScheme, ["hybrid", "arrows", "vim"])
  if (item.id === "highContrast") model.settings.highContrast = !model.settings.highContrast
  if (item.id === "reduceMotion") model.settings.reduceMotion = !model.settings.reduceMotion
  if (item.id === "diceSkin") model.settings.diceSkin = cycleValue(model.settings.diceSkin, diceSkinIds)
  if (item.id === "backgroundFx") model.settings.backgroundFx = cycleValue(model.settings.backgroundFx, ["low", "normal", "dense"])
  if (item.id === "tileScale") model.settings.tileScale = cycleValue(model.settings.tileScale, ["auto", "medium", "large"])
  if (item.id === "music") model.settings.music = !model.settings.music
  if (item.id === "sound") model.settings.sound = !model.settings.sound
  saveUserSettings("Settings saved locally.")
}

function startInput(field: NonNullable<AppModel["inputMode"]>["field"]) {
  model.inputMode = {
    field,
    draft: field === "username" ? model.settings.username : model.settings.githubUsername,
  }
}

function handleInputKey(key: KeyEvent) {
  const input = model.inputMode
  if (!input) return

  if (key.name === "escape") {
    model.inputMode = null
    return
  }
  if (isConfirmKey(key)) {
    const value = cleanProfileText(input.draft)
    if (input.field === "username") model.settings.username = value || "local-crawler"
    if (input.field === "githubUsername") {
      model.settings.githubUsername = value
      if (value) model.settings.cloudProvider = "github"
    }
    model.inputMode = null
    saveUserSettings(`${input.field === "username" ? "Player name" : "GitHub profile"} saved locally.`)
    return
  }
  if (key.name === "backspace" || key.name === "delete") {
    input.draft = input.draft.slice(0, -1)
    return
  }
  if (key.ctrl || key.meta || key.option) return
  const text = key.sequence && key.sequence.length === 1 ? key.sequence : ""
  if (/^[\w .-]$/.test(text) && input.draft.length < 24) input.draft += text
}

function saveUserSettings(status: string) {
  saveSettings(model.settings)
  model.saveStatus = status
}

function refresh() {
  if (destroyed) return
  const width = renderer.terminalWidth
  const height = renderer.terminalHeight
  if (screen.width !== width) screen.width = width
  if (screen.height !== height) screen.height = height
  if (screen.frameBuffer.width !== width || screen.frameBuffer.height !== height) screen.frameBuffer.resize(width, height)
  paint(model, width, height, screen.frameBuffer)
  renderer.requestRender()
}

function startDiceRollAnimation(result: number) {
  model.diceRollAnimation = {
    result,
    startedAt: Date.now(),
    durationMs: 820,
  }
  queueDiceAnimationFrame()
}

function queueDiceAnimationFrame() {
  if (diceTimer || destroyed) return
  diceTimer = setTimeout(() => {
    diceTimer = null
    const animation = model.diceRollAnimation
    if (!animation || destroyed) return

    const done = Date.now() - animation.startedAt >= animation.durationMs
    if (done) model.diceRollAnimation = null
    refresh()
    if (!done) queueDiceAnimationFrame()
  }, 33)
}

function destroyApp() {
  destroyed = true
  if (diceTimer) clearTimeout(diceTimer)
  diceTimer = null
  renderer.destroy()
}

function maybeSubmitLobbyResult() {
  const lobbyUrl = env("OPENDUNGEON_LOBBY_URL", "DUNGEON_LOBBY_URL")
  if (!lobbyUrl || model.session.status === "running" || submittedSession === model.session) return
  submittedSession = model.session
  const result = {
    name: env("OPENDUNGEON_PLAYER_NAME", "DUNGEON_PLAYER_NAME") || model.session.hero.name,
    status: model.session.status,
    floor: model.session.floor,
    turns: model.session.turn,
    gold: model.session.gold,
    kills: model.session.kills,
    score: runScore(model.session),
  }

  void fetch(new URL("/finish", lobbyUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Lobby returned ${response.status}`)
      model.session.log.unshift("Lobby result submitted.")
      refresh()
    })
    .catch(() => {
      model.session.log.unshift("Lobby result failed to submit.")
      refresh()
    })
}

function seedFromEnv() {
  const value = Number(env("OPENDUNGEON_SEED", "DUNGEON_SEED"))
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2423368
}

function randomSeed() {
  return Math.floor(Math.random() * 9_000_000) + 1_000_000
}

function modeFromEnv(): MultiplayerMode {
  const value = env("OPENDUNGEON_MODE", "DUNGEON_MODE")
  return value === "coop" || value === "race" || value === "solo" ? value : "solo"
}

function classFromEnv(): HeroClass {
  const value = env("OPENDUNGEON_CLASS", "DUNGEON_CLASS")
  return value === "warden" || value === "arcanist" || value === "ranger" ? value : "ranger"
}

function modeIndexFromEnv() {
  const mode = modeFromEnv()
  if (mode === "coop") return 1
  if (mode === "race") return 2
  return 0
}

function classIndexFromEnv() {
  const heroClass = classFromEnv()
  if (heroClass === "warden") return 0
  if (heroClass === "arcanist") return 1
  return 2
}

function runScore(session: GameSession) {
  return Math.max(0, session.floor * 100 + session.gold * 2 + session.kills * 25 + session.level * 50 - session.turn)
}

function isSaveKey(key: KeyEvent) {
  return model.screen === "game" && ((key.ctrl && key.name === "s") || key.name === "f5")
}

function isConfirmKey(key: KeyEvent) {
  return key.name === "return" || key.name === "enter" || key.name === "linefeed" || key.name === "space"
}

function isUpKey(key: KeyEvent) {
  return key.name === "up" || (model.settings.controlScheme !== "arrows" && key.name === "w") || (model.settings.controlScheme === "vim" && key.name === "k")
}

function isDownKey(key: KeyEvent) {
  return key.name === "down" || (model.settings.controlScheme !== "arrows" && key.name === "s") || (model.settings.controlScheme === "vim" && key.name === "j")
}

function isLeftKey(key: KeyEvent) {
  return key.name === "left" || (model.settings.controlScheme !== "arrows" && key.name === "a") || (model.settings.controlScheme === "vim" && key.name === "h")
}

function isRightKey(key: KeyEvent) {
  return key.name === "right" || (model.settings.controlScheme !== "arrows" && key.name === "d") || (model.settings.controlScheme === "vim" && key.name === "l")
}

function movementForKey(key: KeyEvent, settings: UserSettings) {
  if (key.name === "up" || (settings.controlScheme !== "arrows" && key.name === "w") || (settings.controlScheme === "vim" && key.name === "k")) return { dx: 0, dy: -1 }
  if (key.name === "down" || (settings.controlScheme !== "arrows" && key.name === "s") || (settings.controlScheme === "vim" && key.name === "j")) return { dx: 0, dy: 1 }
  if (key.name === "left" || (settings.controlScheme !== "arrows" && key.name === "a") || (settings.controlScheme === "vim" && key.name === "h")) return { dx: -1, dy: 0 }
  if (key.name === "right" || (settings.controlScheme !== "arrows" && key.name === "d") || (settings.controlScheme === "vim" && key.name === "l")) return { dx: 1, dy: 0 }
  return null
}

function indexForSave(saves: SaveSummary[], summary: SaveSummary) {
  const index = saves.findIndex((save) => save.id === summary.id)
  return index >= 0 ? index : 0
}

function classIndexFor(classId: HeroClass) {
  if (classId === "warden") return 0
  if (classId === "arcanist") return 1
  return 2
}

function modeIndexFor(mode: MultiplayerMode) {
  if (mode === "coop") return 1
  if (mode === "race") return 2
  return 0
}

function env(primary: string, fallback: string) {
  return process.env[primary] ?? process.env[fallback]
}

function cycleValue<const T extends string>(current: T, values: readonly T[]) {
  const index = values.indexOf(current)
  return values[(index + 1) % values.length]
}

function cleanProfileText(value: string) {
  return value.replace(/[^\w .-]/g, "").trim().slice(0, 24)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
