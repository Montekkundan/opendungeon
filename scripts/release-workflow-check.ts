import { readFileSync } from "node:fs"

const workflow = readFileSync(".github/workflows/npm-publish.yml", "utf8")
const releaseScript = readFileSync("scripts/release-npm.ts", "utf8")
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> }
const releaseDryRun = Bun.spawnSync(["bun", "run", "scripts/release-npm.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, OPENDUNGEON_RELEASE_NPM_DRY_RUN: "1" },
  stdout: "pipe",
  stderr: "pipe",
})
const releaseDryRunOutput = `${releaseDryRun.stdout.toString()}\n${releaseDryRun.stderr.toString()}`

const checks: Array<[string, boolean]> = [
  ["npm workflow runs from main", workflow.includes("branches:\n      - main")],
  ["workflow can write release PRs", workflow.includes("contents: write") && workflow.includes("pull-requests: write")],
  ["workflow enables npm trusted publishing", workflow.includes("id-token: write") && !workflow.includes("NODE_AUTH_TOKEN")],
  ["package gate runs before Changesets", workflow.indexOf("bun run package:check") > -1 && workflow.indexOf("bun run package:check") < workflow.indexOf("changesets/action@v1")],
  ["Changesets versions packages", workflow.includes("version: bun run version-packages")],
  ["Changesets publishes through release script", workflow.includes("publish: bun run release:npm")],
  ["release script skips existing versions", releaseScript.includes('run("npm", ["view"') && releaseScript.includes("already published") && releaseScript.includes("process.exit(0)")],
  [
    "release script dry-run exits without publishing",
    releaseDryRun.exitCode === 0 && (releaseDryRunOutput.includes("already published; skipping npm publish.") || releaseDryRunOutput.includes("dry run skipped npm publish.")),
  ],
  ["release script publishes public package", releaseScript.includes('["publish", "--access", "public"]')],
  ["package script exposes release verifier", packageJson.scripts?.["release:verify"] === "bun run scripts/release-workflow-check.ts"],
]

const failed = checks.filter(([, passed]) => !passed)
if (failed.length > 0) {
  for (const [label] of failed) console.error(`release workflow check failed: ${label}`)
  if (releaseDryRun.exitCode !== 0) console.error(releaseDryRunOutput.trim())
  process.exit(1)
}

console.log("release workflow check passed")
