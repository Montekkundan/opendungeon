export const packageName = "@montekkundan/opendungeon"
export const updateCommand = "opendungeon update"
export const npmUpgradeCommand = `npm i -g ${packageName}@latest`
export const bunUpgradeCommand = `bun add -g ${packageName}@latest`

type FetchProbe = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type UpdateStatus =
  | { state: "checking"; current: string; command: string }
  | { state: "current"; current: string; latest: string; command: string }
  | { state: "available"; current: string; latest: string; command: string; npmCommand: string; bunCommand: string }
  | { state: "unavailable"; current: string; command: string; reason: string }

export type UpdateCheckOptions = {
  fetchImpl?: FetchProbe
  registryUrl?: string
  timeoutMs?: number
}

export function checkingUpdateStatus(current: string): UpdateStatus {
  return { state: "checking", current, command: updateCommand }
}

export async function checkForUpdate(current: string, options: UpdateCheckOptions = {}): Promise<UpdateStatus> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 1800
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(options.registryUrl ?? npmPackageMetadataUrl(packageName), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
    if (!response.ok) return { state: "unavailable", current, command: updateCommand, reason: `registry returned ${response.status}` }

    const metadata = (await response.json()) as { "dist-tags"?: { latest?: unknown } }
    const latest = typeof metadata["dist-tags"]?.latest === "string" ? metadata["dist-tags"].latest : ""
    if (!latest) return { state: "unavailable", current, command: updateCommand, reason: "registry metadata has no latest dist-tag" }
    if (compareVersions(latest, current) > 0) return { state: "available", current, latest, command: updateCommand, npmCommand: npmUpgradeCommand, bunCommand: bunUpgradeCommand }
    return { state: "current", current, latest, command: updateCommand }
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "registry check timed out" : "registry check failed"
    return { state: "unavailable", current, command: updateCommand, reason }
  } finally {
    clearTimeout(timer)
  }
}

export async function handleUpdateCommand(args: string[], current: string, options: UpdateCheckOptions = {}): Promise<number | null> {
  if (args[0] !== "update") return null
  if (args.includes("--help") || args.includes("-h")) {
    console.log(updateCommandHelp())
    return 0
  }

  const status = await checkForUpdate(current, options)
  console.log(formatUpdateStatus(status))
  return status.state === "unavailable" ? 1 : 0
}

export function titleUpdateNotice(status: UpdateStatus | null | undefined) {
  if (status?.state !== "available") return ""
  return `Update ${status.latest} available. Run ${status.command}.`
}

export function formatUpdateStatus(status: UpdateStatus) {
  if (status.state === "available") {
    return [
      `opendungeon ${status.current}`,
      `latest ${status.latest}`,
      "",
      `New version available. Upgrade with:`,
      `  ${status.npmCommand}`,
      `  ${status.bunCommand}`,
      "",
      `Run ${status.command} anytime to check again.`,
    ].join("\n")
  }
  if (status.state === "current") return [`opendungeon ${status.current}`, `latest ${status.latest}`, "Already up to date."].join("\n")
  if (status.state === "checking") return `opendungeon ${status.current}\nChecking for updates...`
  return [`opendungeon ${status.current}`, "Update check unavailable.", status.reason].join("\n")
}

export function updateCommandHelp() {
  return `opendungeon update

Checks the npm registry for a newer ${packageName} release.

Upgrade commands:
  ${npmUpgradeCommand}
  ${bunUpgradeCommand}`
}

export function compareVersions(a: string, b: string) {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let index = 0; index < 3; index++) {
    const delta = left.core[index] - right.core[index]
    if (delta !== 0) return delta > 0 ? 1 : -1
  }
  if (left.preRelease === right.preRelease) return 0
  if (!left.preRelease) return 1
  if (!right.preRelease) return -1
  return left.preRelease.localeCompare(right.preRelease)
}

function npmPackageMetadataUrl(name: string) {
  return `https://registry.npmjs.org/${name.replace("/", "%2f")}`
}

function parseVersion(value: string) {
  const [corePart = "", preRelease = ""] = value.replace(/^v/i, "").split("-", 2)
  const core = corePart.split(".").map((part) => Number.parseInt(part, 10))
  return {
    core: [core[0] || 0, core[1] || 0, core[2] || 0] as [number, number, number],
    preRelease,
  }
}
