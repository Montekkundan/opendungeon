import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js"

export type SupabaseRuntimeConfig = {
  url: string
  publishableKey: string
  serviceRoleKey?: string
}

export function supabaseConfig(): SupabaseRuntimeConfig | null {
  const url = process.env.SUPABASE_URL || process.env.OPENDUNGEON_SUPABASE_URL
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.OPENDUNGEON_SUPABASE_PUBLISHABLE_KEY
  if (!url || !publishableKey) return null
  return {
    url,
    publishableKey,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.OPENDUNGEON_SUPABASE_SERVICE_ROLE_KEY,
  }
}

export function createSupabaseBrowserlessClient(session?: { accessToken?: string; refreshToken?: string }): SupabaseClient | null {
  const config = supabaseConfig()
  if (!config) return null
  return createClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: session?.accessToken ? { headers: { Authorization: `Bearer ${session.accessToken}` } } : undefined,
  })
}

export function createSupabaseServiceClient(): SupabaseClient | null {
  const config = supabaseConfig()
  if (!config?.serviceRoleKey) return null
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

export function usernameToEmail(username: string) {
  if (username.includes("@")) return username
  const domain = process.env.OPENDUNGEON_AUTH_EMAIL_DOMAIN || "opendungeon.local"
  return `${username}@${domain}`
}

export function sessionFromSupabase(session: Session, username: string) {
  return {
    provider: providerFromSession(session),
    username,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    tokenType: "bearer" as const,
    createdAt: new Date().toISOString(),
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
    userId: session.user.id,
    email: session.user.email ?? undefined,
  }
}

function providerFromSession(session: Session): "password" | "github" {
  const provider = session.user.app_metadata.provider
  return provider === "github" ? "github" : "password"
}
