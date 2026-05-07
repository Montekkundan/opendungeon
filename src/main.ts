import { Box, Text, createCliRenderer, type KeyEvent } from "@opentui/core"
import { activeAssetPack } from "./assets/packs.js"
import { createSession, tryMove } from "./game/session.js"
import { renderMap } from "./ui/renderMap.js"

const session = createSession()

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  screenMode: "alternate-screen",
  targetFps: 30,
  backgroundColor: "#05070a",
})

const title = Text({
  content: "Dungeon Dev Crawl",
  fg: "#d6a85c",
})

const mapText = Text({
  content: renderMap(session),
  truncate: false,
})

const statsText = Text({
  content: stats(),
  fg: "#d8dee9",
})

const packText = Text({
  content: packSummary(),
  fg: "#8f9ba8",
})

const logText = Text({
  content: session.log.join("\n"),
  fg: "#b5bec6",
})

renderer.root.add(
  Box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "row",
      gap: 1,
      padding: 1,
    },
    Box(
      {
        width: session.dungeon.width + 4,
        height: session.dungeon.height + 6,
        borderStyle: "rounded",
        padding: 1,
        flexDirection: "column",
        gap: 1,
      },
      title,
      mapText,
      Text({ content: "Move: arrows/WASD  Quit: q or Ctrl+C", fg: "#66717d" }),
    ),
    Box(
      {
        flexGrow: 1,
        minWidth: 32,
        height: session.dungeon.height + 6,
        borderStyle: "rounded",
        padding: 1,
        flexDirection: "column",
        gap: 1,
      },
      Text({ content: "Run Sheet", fg: "#d6a85c" }),
      statsText,
      packText,
      Text({ content: "Multiplayer\nCo-op + race planned", fg: "#7dffb2" }),
      Text({ content: "Log", fg: "#d6a85c" }),
      logText,
    ),
  ),
)

function refresh() {
  mapText.content = renderMap(session)
  statsText.content = stats() as never
  logText.content = session.log.join("\n") as never
}

function stats() {
  return `HP ${session.hp}/12  Focus ${session.focus}\nFloor ${session.floor}   Seed ${session.seed}\nMode ${session.mode}`
}

function packSummary() {
  return `Art ${activeAssetPack.name}\n${activeAssetPack.mood}\nLicense CC0`
}

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if ((key.ctrl && key.name === "c") || key.name === "q" || key.name === "escape") {
    renderer.destroy()
    return
  }

  switch (key.name) {
    case "up":
    case "w":
      tryMove(session, 0, -1)
      break
    case "down":
    case "s":
      tryMove(session, 0, 1)
      break
    case "left":
    case "a":
      tryMove(session, -1, 0)
      break
    case "right":
    case "d":
      tryMove(session, 1, 0)
      break
    default:
      return
  }

  refresh()
})
