import { Text, createCliRenderer, type KeyEvent } from "@opentui/core"
import { createSession, tryMove } from "./game/session.js"
import {
  currentClass,
  currentMode,
  currentStartItem,
  draw,
  moveSelection,
  type AppModel,
} from "./ui/screens.js"

const model: AppModel = {
  screen: "start",
  dialog: null,
  menuIndex: 0,
  classIndex: 2,
  modeIndex: 0,
  seed: 2423368,
  session: createSession(),
  message: "",
}

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  screenMode: "alternate-screen",
  targetFps: 30,
  backgroundColor: "#05070a",
})

const screen = Text({
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

  refresh()
})

function handleDialogKey(key: KeyEvent) {
  if (key.name === "escape" || key.name === "return") model.dialog = null
  if (model.dialog === "pause" && key.name === "s") model.dialog = "settings"
}

function handleMenuKey(key: KeyEvent) {
  if (key.name === "up" || key.name === "w") moveSelection(model, -1)
  if (key.name === "down" || key.name === "s") moveSelection(model, 1)
  if (key.name === "escape") {
    model.screen = "start"
    model.menuIndex = 0
  }
  if (key.name === "?" || (key.shift && key.name === "/")) model.dialog = "help"
  if (key.name === "return" || key.name === "enter" || key.name === "space") confirmMenu()
}

function handleGameKey(key: KeyEvent) {
  if (key.name === "escape") {
    model.dialog = "pause"
    return
  }
  if (key.name === "i") {
    model.dialog = "inventory"
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
  model.screen = "game"
  model.dialog = null
}

function refresh() {
  screen.content = draw(model, renderer.terminalWidth, renderer.terminalHeight)
}
