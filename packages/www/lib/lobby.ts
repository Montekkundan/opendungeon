import { redirect } from "next/navigation";

export type LobbyMode = "coop" | "race";

export function normalizeLobbyMode(
  value: FormDataEntryValue | string | null
): LobbyMode {
  return value === "coop" ? "coop" : "race";
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
  await Promise.resolve();
  redirect(`/create/${createLobbyId(mode, seed)}?mode=${mode}&seed=${seed}`);
}

export function lobbyCommands(mode: LobbyMode, seed: number) {
  return {
    local: `opendungeon-host --host 0.0.0.0 --mode ${mode} --seed ${seed} --port 3737`,
    public: `opendungeon-host --host 0.0.0.0 --public-url https://YOUR_DOMAIN_OR_TUNNEL --mode ${mode} --seed ${seed} --port 3737`,
    join: "opendungeon join http://YOUR_LAN_IP:3737",
    docker: `docker run --rm -p 3737:3737 -e OPENDUNGEON_PUBLIC_URL=https://YOUR_DOMAIN_OR_TUNNEL opendungeon-server --mode ${mode} --seed ${seed}`,
  };
}
