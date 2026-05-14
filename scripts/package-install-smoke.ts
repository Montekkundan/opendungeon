import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"

const root = mkdtempSync(join(tmpdir(), "opendungeon-install-smoke-"))
const keep = process.env.OPENDUNGEON_KEEP_INSTALL_SMOKE === "1"

try {
  run("bun", ["pm", "pack", "--destination", root, "--quiet"])
  const tarball = findPackedTarball(root)
  if (!existsSync(tarball)) throw new Error(`Expected package tarball at ${tarball}`)

  smokeNpmInstall(tarball)
  smokeBunInstall(tarball)
  console.log("package install smoke passed for npm and bun global installs")
} finally {
  if (!keep) rmSync(root, { recursive: true, force: true })
  else console.log(`kept install smoke directory: ${root}`)
}

function smokeNpmInstall(tarball: string) {
  const prefix = join(root, "npm-global")
  run("npm", ["install", "-g", "--prefix", prefix, tarball])
  smokeInstalledCommands("npm", npmBin(prefix))
}

function findPackedTarball(directory: string) {
  const tarball = readdirSync(directory).find((file) => file.endsWith(".tgz"))
  if (!tarball) throw new Error(`No package tarball was created in ${directory}`)
  return join(directory, tarball)
}

function smokeBunInstall(tarball: string) {
  const bunHome = join(root, "bun-home")
  run("bun", ["install", "-g", tarball], { env: { ...process.env, BUN_INSTALL: bunHome } })
  smokeInstalledCommands("bun", join(bunHome, "bin"))
}

function smokeInstalledCommands(manager: string, binDir: string) {
  const env = installSmokeEnv(manager, binDir)
  assertHelpOutput(manager, run("opendungeon", ["--help"], { env }))
  assertVersionOutput(manager, run("opendungeon", ["--version"], { env }))
  assertDoctorOutput(manager, run("opendungeon", ["doctor"], { env }))
  assertSmokeOutput(manager, run("opendungeon", ["smoke"], { env }))
  assertHostOutput(manager, run("opendungeon-host", ["--help"], { env }))
}

function installSmokeEnv(manager: string, binDir: string) {
  return withPath(binDir, {
    ...process.env,
    OPENDUNGEON_PROFILE_DIR: join(root, `${manager}-profile`),
    OPENDUNGEON_REQUIRE_BUNDLED_BUN: "1",
    OPENDUNGEON_RUN_LOCK_DIR: join(root, `${manager}-locks`),
    OPENDUNGEON_SAVE_DIR: join(root, `${manager}-saves`),
  })
}

function npmBin(prefix: string) {
  return process.platform === "win32" ? prefix : join(prefix, "bin")
}

function withPath(binDir: string, env = process.env) {
  return { ...env, PATH: `${binDir}${delimiter}${env.PATH ?? ""}` }
}

function assertVersionOutput(manager: string, output: string) {
  if (!output.includes("opendungeon ")) throw new Error(`${manager} global install did not run opendungeon --version. Output:\n${output}`)
}

function assertHelpOutput(manager: string, output: string) {
  if (!output.includes("opendungeon smoke")) throw new Error(`${manager} global install did not run opendungeon --help. Output:\n${output}`)
}

function assertDoctorOutput(manager: string, output: string) {
  if (!output.includes("terminal check")) throw new Error(`${manager} global install did not run opendungeon doctor. Output:\n${output}`)
}

function assertSmokeOutput(manager: string, output: string) {
  if (!output.includes('"type":"smoke"') || !output.includes('"ok":true')) throw new Error(`${manager} global install did not run opendungeon smoke. Output:\n${output}`)
}

function assertHostOutput(manager: string, output: string) {
  if (!output.includes("opendungeon-host")) throw new Error(`${manager} global install did not run opendungeon-host --help. Output:\n${output}`)
}

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  const result = Bun.spawnSync([command, ...args], {
    cwd: process.cwd(),
    env: options.env ?? process.env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = result.stdout.toString()
  const stderr = result.stderr.toString()
  if (result.exitCode !== 0) {
    throw new Error([`Command failed: ${command} ${args.join(" ")}`, stdout, stderr].filter(Boolean).join("\n"))
  }
  return stdout
}
