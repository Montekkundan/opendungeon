import { defineSettings } from "../settings"
import type { SettingsValues } from "../settings"

export const opendungeonSettings = defineSettings({
  mode: {
    default: "coop",
    label: "Run mode",
    options: [{ value: "coop" }, { value: "race" }],
    type: "select",
  },
  packageVersion: {
    default: "latest",
    help: "npm version tag installed inside the server container.",
    label: "Package version",
    maxLength: 32,
    type: "string",
  },
  seed: {
    default: 2423368,
    help: "Use the same seed when friends should enter the same dungeon.",
    label: "Seed",
    max: 99999999,
    min: 1,
    type: "number",
  },
})

export type OpendungeonSettings = SettingsValues
