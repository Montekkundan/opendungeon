import { readFileSync } from "node:fs"
import { basename } from "node:path"

const trackedFiles = gitFiles(["ls-files", "-z"])
const untrackedFiles = gitFiles(["ls-files", "-o", "--exclude-standard", "-z"])
const failures: string[] = []

const allowedEnvExamples = new Set([".env.example", "packages/www/.env.example"])
const forbiddenPathPatterns = [
  { pattern: /(^|\/)\.opendungeon(\/|$)/, reason: "local profile directory" },
  { pattern: /(^|\/)\.omx(\/|$)/, reason: "agent checkpoint state" },
  { pattern: /(^|\/)active-run/i, reason: "local run lock" },
  { pattern: /(^|\/).*checkpoint/i, reason: "checkpoint artifact" },
]

for (const file of trackedFiles) {
  if (isEnvFile(file) && !allowedEnvExamples.has(file)) failures.push(`${file}: tracked env file`)
  for (const { pattern, reason } of forbiddenPathPatterns) {
    if (pattern.test(file)) failures.push(`${file}: ${reason}`)
  }
}

for (const file of untrackedFiles) {
  failures.push(`${file}: untracked public repo file; commit intentionally or add an ignore rule`)
}

for (const file of trackedFiles) {
  if (!shouldScanText(file)) continue
  const text = readText(file)
  if (text === undefined) continue
  for (const match of findSecretLikeValues(text)) {
    failures.push(`${file}: possible secret value for ${match}`)
  }
}

if (failures.length > 0) {
  console.error("public hygiene check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("public hygiene check passed")

function gitFiles(args: string[]) {
  const result = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout
    .toString()
    .split("\0")
    .filter(Boolean)
}

function isEnvFile(file: string) {
  const name = basename(file)
  return name === ".env" || name.startsWith(".env.")
}

function shouldScanText(file: string) {
  if (file.includes("bun.lock")) return false
  return !/\.(png|jpg|jpeg|gif|webp|mp3|wav|ogg|tgz|zip|ico)$/i.test(file)
}

function readText(file: string) {
  try {
    const text = readFileSync(file, "utf8")
    if (text.includes("\0")) return undefined
    return text
  } catch {
    return undefined
  }
}

function findSecretLikeValues(text: string) {
  const matches = new Set<string>()
  const assignmentPattern =
    /\b(SUPABASE_SERVICE_ROLE_KEY|OPENDUNGEON_SUPABASE_SERVICE_ROLE_KEY|VERCEL_APP_CLIENT_SECRET)\b\s*[:=]\s*["']?([A-Za-z0-9._-]{12,})/g
  for (const match of text.matchAll(assignmentPattern)) matches.add(match[1])
  for (const pattern of [/\bsb_secret_[A-Za-z0-9_-]+/g, /\bsk_live_[A-Za-z0-9_-]+/g, /\bghp_[A-Za-z0-9_-]+/g]) {
    for (const match of text.matchAll(pattern)) matches.add(match[0].slice(0, 16))
  }
  return matches
}
