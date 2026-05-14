"use server";

import { redirect } from "next/navigation";
import {
  buildGmPatchDraftWithAi,
  deliverGmPatchToHost,
  type GmPatchDraft,
  normalizeDifficulty,
  normalizeGmHostUrl,
} from "@/lib/gm";
import { createClient } from "@/lib/supabase/server";

function gmError(message: string, worldId?: string): never {
  const params = new URLSearchParams({ error: message });
  if (worldId) {
    params.set("world", worldId);
  }
  redirect(`/gm?${params.toString()}`);
}

function redirectToGm(params: Record<string, string | undefined>): never {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  redirect(`/gm?${search.toString()}`);
}

function formHostUrl(formData: FormData) {
  return normalizeGmHostUrl(String(formData.get("hostUrl") ?? ""));
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
  redirectToGm({ created: "1", host: formHostUrl(formData), world: id });
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

  const draft = await buildGmPatchDraftWithAi({
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
    metadata: {
      ai: {
        model: draft.model ?? null,
        note: draft.aiNote ?? null,
        source: draft.source ?? "rules-fallback",
      },
      draft,
    },
    owner_id: user.id,
    world_id: worldId,
  });

  if (error) {
    gmError(`Could not save patch draft: ${error.message}`, worldId);
  }
  redirectToGm({
    host: formHostUrl(formData),
    patch: draft.id,
    world: worldId,
  });
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
  const hostUrl = formHostUrl(formData);
  if (!(worldId && patchId)) {
    gmError("A world and patch are required for approval.", worldId);
  }

  const draftResult = await supabase
    .from("opendungeon_world_events")
    .select("metadata")
    .eq("event_type", "gm-patch-draft")
    .eq("event_id", patchId)
    .eq("owner_id", user.id)
    .eq("world_id", worldId)
    .maybeSingle<{ metadata: { draft?: GmPatchDraft } | null }>();

  if (draftResult.error) {
    gmError(
      `Could not load patch draft: ${draftResult.error.message}`,
      worldId
    );
  }
  const draft = draftResult.data?.metadata?.draft;
  if (!draft) {
    gmError("Patch draft was not found for this world.", worldId);
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

  const delivery = hostUrl
    ? await deliverGmPatchToHost(hostUrl, draft)
    : { delivered: false, error: null, url: "" };

  redirectToGm({
    approved: patchId,
    delivered: delivery.delivered ? "1" : undefined,
    error: delivery.error
      ? `Patch approved, but host delivery failed: ${delivery.error}`
      : undefined,
    host: hostUrl,
    world: worldId,
  });
}
