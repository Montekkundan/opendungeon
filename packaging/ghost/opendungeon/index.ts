import type { ComposeConfig } from "../compose"
import { resolveSettings } from "../settings"
import { buildOpendungeonCompose, dockerImage } from "./install"
import { opendungeonSettings } from "./settings"

const buildCompose = (config: ComposeConfig, raw: unknown): string => buildOpendungeonCompose(config, resolveSettings(opendungeonSettings, raw))

export const opendungeon = {
  buildCompose,
  description: "opendungeon is a terminal roguelike RPG lobby server for co-op and race runs.",
  dockerImage,
  enabled: true,
  id: "opendungeon",
  image: "/games/opendungeon.jpg",
  name: "opendungeon",
  ports: [{ from: 3737, protocol: "tcp", to: 3737 }],
  requirements: { cpu: 1, disk: 2, memory: 1 },
  settings: opendungeonSettings,
  usesJoinPassword: false,
} as const
