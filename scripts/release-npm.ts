import { readFileSync } from "node:fs"

type PackageJson = {
  name?: unknown
  version?: unknown
}

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageJson
const name = stringField(packageJson.name, "name")
const version = stringField(packageJson.version, "version")
const spec = `${name}@${version}`

if (await isPublished(spec)) {
  console.log(`${spec} is already published; skipping npm publish.`)
  process.exit(0)
}

if (process.env.OPENDUNGEON_RELEASE_NPM_DRY_RUN === "1") {
  console.log(`${spec} is not published; dry run skipped npm publish.`)
  process.exit(0)
}

run("npm", ["publish", "--access", "public"])

async function isPublished(packageSpec: string) {
  const result = run("npm", ["view", packageSpec, "version", "--json"], { allowFailure: true })
  if (result.exitCode !== 0) return false
  return result.stdout.trim().replace(/^"|"$/g, "") === version
}

function stringField(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`package.json ${field} must be a non-empty string.`)
  return value
}

function run(command: string, args: string[], options: { allowFailure?: boolean } = {}) {
  const result = Bun.spawnSync([command, ...args], {
    cwd: new URL("..", import.meta.url).pathname,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = result.stdout.toString()
  const stderr = result.stderr.toString()
  if (result.exitCode !== 0 && !options.allowFailure) {
    throw new Error([`Command failed: ${command} ${args.join(" ")}`, stdout, stderr].filter(Boolean).join("\n"))
  }
  if (!options.allowFailure && stdout.trim()) console.log(stdout.trim())
  if (!options.allowFailure && stderr.trim()) console.error(stderr.trim())
  return { exitCode: result.exitCode, stdout, stderr }
}
