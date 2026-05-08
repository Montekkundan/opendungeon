export type SetupCheckStatus = "ok" | "warn" | "missing"

export type SetupCheckItem = {
  id: string
  label: string
  status: SetupCheckStatus
  message: string
}

export type ServerSetupReport = {
  ready: boolean
  items: SetupCheckItem[]
}

export function serverSetupReport(env: NodeJS.ProcessEnv = process.env): ServerSetupReport {
  const items: SetupCheckItem[] = [
    envCheck("supabase-url", "Supabase URL", env, ["SUPABASE_URL", "OPENDUNGEON_SUPABASE_URL"]),
    envCheck("supabase-publishable-key", "Supabase publishable key", env, ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "OPENDUNGEON_SUPABASE_PUBLISHABLE_KEY"]),
    envCheck("supabase-service-role", "Supabase service role key", env, ["SUPABASE_SERVICE_ROLE_KEY", "OPENDUNGEON_SUPABASE_SERVICE_ROLE_KEY"]),
    envCheck("ai-gateway-token", "AI Gateway token", env, ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN", "OPENDUNGEON_AI_GATEWAY_TOKEN"]),
    assetBucketCheck(env),
    generatedAssetFallbackCheck(env),
  ]

  return {
    ready: items.every((item) => item.status !== "missing"),
    items,
  }
}

export function formatServerSetupReport(report: ServerSetupReport) {
  return [
    "opendungeon server setup check",
    ...report.items.map((item) => `[${item.status}] ${item.label}: ${item.message}`),
    `ready: ${report.ready ? "yes" : "no"}`,
  ].join("\n")
}

function envCheck(id: string, label: string, env: NodeJS.ProcessEnv, names: string[]): SetupCheckItem {
  const name = names.find((candidate) => present(env[candidate]))
  if (name) return { id, label, status: "ok", message: `${name} is configured.` }
  return { id, label, status: "missing", message: `Set one of ${names.join(", ")}.` }
}

function assetBucketCheck(env: NodeJS.ProcessEnv): SetupCheckItem {
  const bucket = env.OPENDUNGEON_ASSET_BUCKET?.trim() || "opendungeon-assets"
  return {
    id: "asset-bucket",
    label: "Generated asset bucket",
    status: "ok",
    message: `${bucket} will be used for generated sprite assets.`,
  }
}

function generatedAssetFallbackCheck(env: NodeJS.ProcessEnv): SetupCheckItem {
  const directory = env.OPENDUNGEON_GENERATED_ASSET_DIR?.trim()
  if (directory) {
    return {
      id: "generated-asset-fallback",
      label: "Generated asset fallback directory",
      status: "ok",
      message: `${directory} is configured for local fallback writes.`,
    }
  }

  return {
    id: "generated-asset-fallback",
    label: "Generated asset fallback directory",
    status: "warn",
    message: "OPENDUNGEON_GENERATED_ASSET_DIR is not set; default ~/.opendungeon/generated-assets will be used.",
  }
}

function present(value: string | undefined) {
  return Boolean(value?.trim())
}
