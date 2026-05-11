import { readFileSync, writeFileSync } from "node:fs"

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown }
const version = typeof packageJson.version === "string" ? packageJson.version : ""

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid package version: ${String(packageJson.version)}`)
}

writeFileSync(new URL("../src/version.ts", import.meta.url), `export const version = ${JSON.stringify(version)}\n`)
