import type { ComposeConfig } from "../compose"
import { escapeComposeValue } from "../compose"
import type { OpendungeonSettings } from "./settings"

export const dockerImage = "node:24-alpine"

export const buildOpendungeonCompose = (config: ComposeConfig, settings: OpendungeonSettings): string => {
  const escape = escapeComposeValue
  const packageVersion = String(settings.packageVersion || "latest").replace(/[^\w.-]/g, "") || "latest"
  const mode = settings.mode === "race" ? "race" : "coop"
  const seed = Math.max(1, Math.floor(Number(settings.seed) || 2423368))
  const timezone = config.timezone ?? "UTC"

  return `services:
  opendungeon:
    image: ${dockerImage}
    container_name: ghost-game
    ports:
      - "3737:3737/tcp"
    environment:
      PORT: "3737"
      OPENDUNGEON_BIND_HOST: "0.0.0.0"
      TZ: "${escape(timezone)}"
    command: sh -lc "npm install -g @montekkundan/opendungeon@${packageVersion} && opendungeon-host --host 0.0.0.0 --port 3737 --mode ${mode} --seed ${seed}"
    restart: unless-stopped
`
}
