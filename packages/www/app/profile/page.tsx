import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { Footer, Header } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";

export const metadata = {
  title: "Profile | opendungeon",
};

export const dynamic = "force-dynamic";

interface Profile {
  created_at: string;
  updated_at: string;
  username: string;
}

function defaultUsername(user: User) {
  let metadataName = "";
  if (typeof user.user_metadata.user_name === "string") {
    metadataName = user.user_metadata.user_name;
  } else if (typeof user.user_metadata.preferred_username === "string") {
    metadataName = user.user_metadata.preferred_username;
  }
  const emailName = user.email?.split("@")[0] ?? "";
  const base =
    (metadataName || emailName || "delver")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "delver";

  return `${base}-${user.id.slice(0, 8)}`;
}

async function getOrCreateProfile(user: User) {
  const supabase = await createClient();
  const selected = await supabase
    .from("opendungeon_profiles")
    .select("username, created_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle<Profile>();

  if (selected.data || selected.error) {
    return { profile: selected.data, error: selected.error?.message ?? null };
  }

  const inserted = await supabase
    .from("opendungeon_profiles")
    .insert({ user_id: user.id, username: defaultUsername(user) })
    .select("username, created_at, updated_at")
    .single<Profile>();

  return { profile: inserted.data, error: inserted.error?.message ?? null };
}

export default async function ProfilePage() {
  const configured = supabaseConfigured();
  const userResult = configured
    ? await (await createClient()).auth.getUser()
    : null;
  const user = userResult?.data.user ?? null;
  const profileResult = user ? await getOrCreateProfile(user) : null;
  const profile = profileResult?.profile ?? null;
  const profileError = profileResult?.error ?? null;

  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />
        <article data-component="docs">
          <p data-slot="eyebrow">account</p>
          <h1>Profile</h1>
          {configured ? null : (
            <p data-slot="notice">
              Supabase env vars are not configured yet. The website still
              builds, but login and profile data stay disabled.
            </p>
          )}
          {configured && !user ? (
            <p>
              No active session. <Link href="/login">Log in</Link> to connect a
              profile.
            </p>
          ) : null}
          {profileError ? (
            <p data-slot="notice">Profile sync failed: {profileError}</p>
          ) : null}
          {user ? (
            <section data-component="profile-card">
              <div>
                <span>Username</span>
                <strong>{profile?.username ?? "creating profile"}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{user.email ?? "unknown"}</strong>
              </div>
              <div>
                <span>User ID</span>
                <strong>{user.id}</strong>
              </div>
              <div>
                <span>Provider</span>
                <strong>{user.app_metadata.provider ?? "email"}</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>{profile?.created_at.slice(0, 10) ?? "pending"}</strong>
              </div>
              <form action={logout}>
                <Button type="submit" variant="outline">
                  Log out
                </Button>
              </form>
            </section>
          ) : null}
        </article>
        <Footer />
      </div>
    </main>
  );
}
