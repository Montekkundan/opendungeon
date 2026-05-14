"use server";

import { redirect } from "next/navigation";
import { buildGmPatchDraft, normalizeDifficulty } from "@/lib/gm";
import { createClient } from "@/lib/supabase/server";

function gmError(message: string, worldId?: string) {
  const params = new URLSearchParams({ error: message });
  if (worldId) {
    params.set("world", worldId);
  }
  redirect(`/gm?${params.toString()}`);
}

export async function createGmWorld(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login?next=/gm&error=Log%20in%20to%20create%20a%20GM%20world");
  }

  const seed =
    Number(formData.get("seed")) || Math.floor(Date.now() % 9_000_000);
  const id = `gm-${user.id.slice(0, 8)}-${Date.now().toString(36)}`;
  const { error } = await supabase.from("opendungeon_worlds").insert({
    config: {
      mode: "multiplayer-gm",
      source: "website-gm-console",
      status: "draft",
    },
    id,
    owner_id: user.id,
    seed,
  });

  if (error) {
    gmError(`Could not create GM world: ${error.message}`);
  }
  redirect(`/gm?world=${id}&created=1`);
}

export async function draftGmPatch(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login?next=/gm&error=Log%20in%20to%20draft%20GM%20patches");
  }

  const worldId = String(formData.get("worldId") ?? "");
  if (!worldId) {
    gmError("Create or select a GM world first.");
  }

  const selected = await supabase
    .from("opendungeon_worlds")
    .select("id")
    .eq("id", worldId)
    .eq("owner_id", user.id)
    .maybeSingle<{ id: string }>();

  if (selected.error) {
    gmError(`Could not load GM world: ${selected.error.message}`, worldId);
  }
  if (!selected.data) {
    gmError("Selected GM world was not found for this account.", worldId);
  }

  const draft = buildGmPatchDraft({
    difficulty: normalizeDifficulty(formData.get("difficulty")),
    floor: Number(formData.get("floor")) || 1,
    partySize: Number(formData.get("partySize")) || 1,
    prompt: String(formData.get("prompt") ?? ""),
    worldId,
  });

  const { error } = await supabase.from("opendungeon_world_events").insert({
    event_id: draft.id,
    event_type: "gm-patch-draft",
    message: draft.playerBriefing,
    metadata: { draft },
    owner_id: user.id,
    world_id: worldId,
  });

  if (error) {
    gmError(`Could not save patch draft: ${error.message}`, worldId);
  }
  redirect(`/gm?world=${worldId}&patch=${draft.id}`);
}

export async function approveGmPatch(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) {
    redirect("/login?next=/gm&error=Log%20in%20to%20approve%20GM%20patches");
  }

  const worldId = String(formData.get("worldId") ?? "");
  const patchId = String(formData.get("patchId") ?? "");
  if (!(worldId && patchId)) {
    gmError("A world and patch are required for approval.", worldId);
  }

  const { error } = await supabase.from("opendungeon_world_events").insert({
    event_id: patchId,
    event_type: "gm-patch-approved",
    message: "GM approved this patch for host delivery.",
    metadata: { patchId, status: "approved" },
    owner_id: user.id,
    world_id: worldId,
  });

  if (error) {
    gmError(`Could not approve patch: ${error.message}`, worldId);
  }
  redirect(`/gm?world=${worldId}&approved=${patchId}`);
}
