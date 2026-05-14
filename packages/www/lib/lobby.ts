import { redirect } from "next/navigation";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type LobbyMode = "coop" | "race";

export function normalizeLobbyMode(
  value: FormDataEntryValue | string | null
): LobbyMode {
  return value === "race" ? "race" : "coop";
}

export function lobbyModeLabel(mode: LobbyMode) {
  return mode === "race" ? "Multiplayer race challenge" : "Multiplayer co-op";
}

export function lobbyModeSummary(mode: LobbyMode) {
  return mode === "race"
    ? "A same-seed multiplayer challenge for comparing separate runs and leaderboard results."
    : "The authored opendungeon story loop shared by multiple players through one lobby host.";
}

export function normalizeSeed(value: FormDataEntryValue | string | null) {
  const seed = Number(value);
  return Number.isInteger(seed) && seed > 0 ? seed : 2_423_368;
}

export function createLobbyId(mode: LobbyMode, seed: number) {
  const random = crypto.randomUUID().slice(0, 8);
  return `${mode}-${seed}-${random}`.toLowerCase();
}

export async function createLobby(formData: FormData) {
  "use server";

  const mode = normalizeLobbyMode(formData.get("mode"));
  const seed = normalizeSeed(formData.get("seed"));
  const lobbyId = createLobbyId(mode, seed);
  const cloudStatus = await persistLobbyMetadata(lobbyId, mode, seed);
  redirect(`/create/${lobbyId}?mode=${mode}&seed=${seed}&cloud=${cloudStatus}`);
}

export function lobbyCommands(mode: LobbyMode, seed: number) {
  return {
    local: `opendungeon-host --host 0.0.0.0 --mode ${mode} --seed ${seed} --port 3737`,
    public: `opendungeon-host --host 0.0.0.0 --public-url https://YOUR_DOMAIN_OR_TUNNEL --mode ${mode} --seed ${seed} --port 3737`,
    join: "opendungeon join http://YOUR_LAN_IP:3737",
    docker: `docker run --rm -p 3737:3737 -e OPENDUNGEON_PUBLIC_URL=https://YOUR_DOMAIN_OR_TUNNEL opendungeon-server --mode ${mode} --seed ${seed}`,
  };
}

async function persistLobbyMetadata(
  lobbyId: string,
  mode: LobbyMode,
  seed: number
): Promise<"saved" | "guest" | "error"> {
  if (!supabaseConfigured()) {
    return "guest";
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      return "guest";
    }

    const worldId = `lobby-${lobbyId}`;
    const { error: worldError } = await supabase
      .from("opendungeon_worlds")
      .insert({
        config: {
          gm: { enabled: false },
          host: {
            port: 3737,
            status: "not-started",
            strategy: "cli-host",
          },
          lobby: {
            id: lobbyId,
            mode,
          },
          sandbox: {
            provider: "vercel",
            status: "not-provisioned",
          },
          source: "website-create",
          status: "invite-created",
        },
        id: worldId,
        owner_id: user.id,
        seed,
      });

    if (worldError) {
      return "error";
    }

    const { error: eventError } = await supabase
      .from("opendungeon_world_events")
      .insert({
        event_id: lobbyId,
        event_type: "lobby-created",
        message:
          mode === "race"
            ? "Created a race challenge invite from the website."
            : "Created a co-op multiplayer invite from the website.",
        metadata: {
          commands: lobbyCommands(mode, seed),
          lobbyId,
          mode,
          seed,
        },
        owner_id: user.id,
        world_id: worldId,
      });

    return eventError ? "error" : "saved";
  } catch {
    return "error";
  }
}
