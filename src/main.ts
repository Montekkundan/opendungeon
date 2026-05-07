import { TextRenderable, createCliRenderer, type KeyEvent } from "@opentui/core"
import { createSession, rest, tryMove, usePotion, type GameSession, type HeroClass, type MultiplayerMode } from "./game/session.js"
import {
  currentClass,
  currentMode,
  currentStartItem,
  draw,
  moveSelection,
  type AppModel,
} from "./ui/screens.js"
import { shouldUseThreeRenderer } from "./rendering/threeAssets.js"

const model: AppModel = {
  screen: "start",
  dialog: null,
  menuIndex: 0,
  classIndex: classIndexFromEnv(),
  modeIndex: modeIndexFromEnv(),
  seed: seedFromEnv(),
  session: createSession(seedFromEnv(), modeFromEnv(), classFromEnv()),
  message: "",
  debugView: process.env.DUNGEON_DEBUG_VIEW === "1",
  rendererBackend: shouldUseThreeRenderer() ? "three" : "terminal",
}
let submittedSession: GameSession | null = null

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
    renderer.destroy()
    return
  }

  if (model.dialog) {
    handleDialogKey(key)
    refresh()
    return
  }

  if (key.name === "q") {
    renderer.destroy()
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
}

function handleMenuKey(key: KeyEvent) {
  if (key.name === "up" || key.name === "w") moveSelection(model, -1)
  if (key.name === "down" || key.name === "s") moveSelection(model, 1)
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

function confirmMenu() {
  if (model.screen === "start") {
    const item = currentStartItem(model)
    if (item === "Begin descent") startRun()
    if (item === "Character") {
      model.screen = "character"
      model.menuIndex = model.classIndex
    }
    if (item === "Multiplayer") {
      model.screen = "mode"
      model.menuIndex = model.modeIndex
    }
    if (item === "Settings") model.dialog = "settings"
    if (item === "Quit") renderer.destroy()
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
}

function refresh() {
  screen.content = draw(model, renderer.terminalWidth, renderer.terminalHeight)
  renderer.requestRender()
}

function maybeSubmitLobbyResult() {
  const lobbyUrl = process.env.DUNGEON_LOBBY_URL
  if (!lobbyUrl || model.session.status === "running" || submittedSession === model.session) return
  submittedSession = model.session
  const result = {
    name: process.env.DUNGEON_PLAYER_NAME || model.session.hero.name,
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
  const value = Number(process.env.DUNGEON_SEED)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 2423368
}

function randomSeed() {
  return Math.floor(Math.random() * 9_000_000) + 1_000_000
}

function modeFromEnv(): MultiplayerMode {
  const value = process.env.DUNGEON_MODE
  return value === "coop" || value === "race" || value === "solo" ? value : "solo"
}

function classFromEnv(): HeroClass {
  const value = process.env.DUNGEON_CLASS
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
