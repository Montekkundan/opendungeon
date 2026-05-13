const DEFAULT_SUPABASE_URL = "https://uablylzrcindbreehbuj.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_o-QLR6jUUh04QCm58di_8w_7bP4MGNt";

export function supabaseConfigured() {
  return Boolean(supabaseUrl() && supabaseKey());
}

export function supabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.OPENDUNGEON_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    DEFAULT_SUPABASE_URL
  );
}

export function supabaseKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.OPENDUNGEON_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    DEFAULT_SUPABASE_PUBLISHABLE_KEY
  );
}

export function requireSupabaseEnv() {
  const url = supabaseUrl();
  const key = supabaseKey();
  if (!(url && key)) {
    throw new Error("Supabase is not configured.");
  }
  return { url, key };
}
