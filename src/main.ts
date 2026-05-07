import { TextRenderable, createCliRenderer, type KeyEvent } from "@opentui/core"
import {
  createSession,
  cycleTarget,
  performCombatAction,
  rest,
  selectSkill,
  tryMove,
  usePotion,
  type GameSession,
  type HeroClass,
  type MultiplayerMode,
} from "./game/session.js"
import { deleteSave, listSaves, loadSave, saveSession, type SaveSummary } from "./game/saveStore.js"
import {
  currentClass,
  currentMode,
  currentStartItem,
  draw,
  moveSelection,
  type AppModel,
} from "./ui/screens.js"
import { shouldUseThreeRenderer } from "./rendering/threeAssets.js"

const initialSaves = listSaves()

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
  backgroundColor: "#05070a",
})

const screen = new TextRenderable(renderer, {
  id: "screen",
  content: draw(model, renderer.terminalWidth, renderer.terminalHeight),
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  truncate: false,
  selectable: false,
})

renderer.root.add(screen)
renderer.on("resize", refresh)
renderer.start()

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (key.ctrl && key.name === "c") {
    destroyApp()
    return
  }

  if (isSaveKey(key)) {
    saveCurrentRun()
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
  if (model.dialog === "pause" && key.name === "s") model.dialog = "settings"
  if (model.dialog === "pause" && key.name === "q") destroyApp()
}

function handleMenuKey(key: KeyEvent) {
  if (model.screen === "saves") {
    if (key.name === "up" || key.name === "w") {
      pendingDeleteSaveId = null
      moveSelection(model, -1)
    }
    if (key.name === "down" || key.name === "s") {
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
    if (key.name === "return" || key.name === "enter" || key.name === "linefeed" || key.name === "space") loadSelectedSave()
    return
  }

  if (model.screen === "cloud") {
    if (key.name === "escape" || key.name === "return" || key.name === "enter" || key.name === "linefeed" || key.name === "space") {
      model.screen = "start"
      model.menuIndex = 0
    }
    return
  }

  if (key.name === "up" || key.name === "w") moveSelection(model, -1)
  if (key.name === "down" || key.name === "s") moveSelection(model, 1)
  if (model.screen === "start" && key.name === "c") loadLatestSave()
  if (model.screen === "start" && key.name === "n") model.seed = randomSeed()
  if (key.name === "escape") {
    model.screen = "start"
    model.menuIndex = 0
  }
  if (key.name === "?" || (key.shift && key.name === "/")) model.dialog = "help"
  if (key.name === "return" || key.name === "enter" || key.name === "linefeed" || key.name === "space") confirmMenu()
}

function handleGameKey(key: KeyEvent) {
  if (model.session.status !== "running") {
    if (key.name === "return" || key.name === "enter" || key.name === "linefeed" || key.name === "space") startRun()
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

  switch (key.name) {
    case "up":
    case "w":
      tryMove(model.session, 0, -1)
      break
    case "down":
    case "s":
      tryMove(model.session, 0, 1)
      break
    case "left":
    case "a":
      tryMove(model.session, -1, 0)
      break
    case "right":
    case "d":
      tryMove(model.session, 1, 0)
      break
  }
}

function handleCombatKey(key: KeyEvent) {
  if (key.name === "tab" || key.name === "right" || key.name === "d") {
    cycleTarget(model.session, 1)
    return
  }
  if (key.name === "left" || key.name === "a") {
    cycleTarget(model.session, -1)
    return
  }
  if (key.name === "1" || key.name === "2" || key.name === "3") {
    selectSkill(model.session, Number(key.name) - 1)
    return
  }
  if (key.name === "return" || key.name === "enter" || key.name === "linefeed" || key.name === "space") {
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
    if (item === "Cloud saves") {
      model.screen = "cloud"
      model.menuIndex = 0
    }
    if (item === "Settings") model.dialog = "settings"
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

function refresh() {
  if (destroyed) return
  screen.content = draw(model, renderer.terminalWidth, renderer.terminalHeight)
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
