import Link from "next/link";
import { redirect } from "next/navigation";
import { Command } from "@/components/command";
import { Footer, Header } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { gameModes } from "@/lib/game-modes";
import { type GmPatchDraft, gmDifficultyLevels } from "@/lib/gm";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { approveGmPatch, createGmWorld, draftGmPatch } from "./actions";

export const metadata = {
  title: "GM Console | opendungeon",
};

export const dynamic = "force-dynamic";

interface WorldRow {
  generation: number;
  id: string;
  seed: number;
  updated_at: string;
}

interface WorldEventRow {
  created_at: string;
  event_id: string | null;
  event_type: string;
  id: number;
  message: string;
  metadata: {
    draft?: GmPatchDraft;
    patchId?: string;
    status?: string;
  } | null;
}

interface GmPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

async function getWorldRows(ownerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opendungeon_worlds")
    .select("id, seed, generation, updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(8)
    .returns<WorldRow[]>();

  return { error: error?.message ?? null, worlds: data ?? [] };
}

async function getWorldEvents(ownerId: string, worldId: string | null) {
  if (!worldId) {
    return { error: null, events: [] as WorldEventRow[] };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opendungeon_world_events")
    .select("id, event_type, event_id, message, metadata, created_at")
    .eq("owner_id", ownerId)
    .eq("world_id", worldId)
    .in("event_type", ["gm-patch-draft", "gm-patch-approved"])
    .order("created_at", { ascending: false })
    .limit(8)
    .returns<WorldEventRow[]>();

  return { error: error?.message ?? null, events: data ?? [] };
}

function singleParam(
  params: Record<string, string | string[] | undefined> | undefined,
  key: string
) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function GmPage({ searchParams }: GmPageProps) {
  if (!supabaseConfigured()) {
    redirect(
      "/login?next=/gm&error=Supabase%20is%20required%20for%20the%20GM%20console"
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    redirect("/login?next=/gm&error=Log%20in%20to%20open%20the%20GM%20console");
  }

  const params = await searchParams;
  const { error, worlds } = await getWorldRows(user.id);
  const selectedWorldId = singleParam(params, "world") ?? worlds[0]?.id ?? null;
  const { error: eventsError, events } = await getWorldEvents(
    user.id,
    selectedWorldId
  );
  const gmMode = gameModes.find((mode) => mode.id === "multiplayer-gm");
  const activeDraft = events.find(
    (event) =>
      event.event_type === "gm-patch-draft" &&
      event.metadata?.draft &&
      event.event_id === (singleParam(params, "patch") ?? event.event_id)
  )?.metadata?.draft;
  const approvedIds = new Set(
    events
      .filter((event) => event.event_type === "gm-patch-approved")
      .map((event) => event.event_id)
      .filter(Boolean)
  );

  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />
        <article data-component="docs">
          <p data-slot="eyebrow">multiplayer with gm</p>
          <h1>GM console</h1>
          <p>
            A logged-in Dungeon Master workbench for steering a multiplayer
            world like a D&amp;D table. The GM chooses how hard the next beat
            should feel, drafts a validated patch, reviews the tool calls, then
            approves it for host delivery.
          </p>

          <section data-component="lobby-summary">
            <div>
              <span>Signed in</span>
              <strong>{user.email ?? user.id}</strong>
            </div>
            <div>
              <span>Mode</span>
              <strong>{gmMode?.name ?? "Multiplayer with GM"}</strong>
            </div>
            <div>
              <span>GM worlds</span>
              <strong>{error ? "sync unavailable" : worlds.length}</strong>
            </div>
          </section>

          {singleParam(params, "error") ? (
            <p data-slot="notice">{singleParam(params, "error")}</p>
          ) : null}
          {error ? <p data-slot="notice">World sync failed: {error}</p> : null}
          {eventsError ? (
            <p data-slot="notice">Patch queue failed: {eventsError}</p>
          ) : null}

          <section data-component="gm-layout">
            <div data-component="gm-chat">
              <div data-slot="gm-toolbar">
                <span>GM agent steering</span>
                <span>validated patch queue</span>
              </div>

              <form action={createGmWorld} data-component="gm-create">
                <label>
                  <span>Seed</span>
                  <input
                    defaultValue="2423368"
                    inputMode="numeric"
                    name="seed"
                  />
                </label>
                <Button type="submit">Create GM world</Button>
              </form>

              <form action={draftGmPatch} data-slot="gm-prompt">
                <input
                  name="worldId"
                  type="hidden"
                  value={selectedWorldId ?? ""}
                />
                <label>
                  <span>Difficulty</span>
                  <select defaultValue="harder" name="difficulty">
                    {gmDifficultyLevels.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>
                        {difficulty}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Floor</span>
                  <input defaultValue="2" inputMode="numeric" name="floor" />
                </label>
                <label>
                  <span>Party size</span>
                  <input
                    defaultValue="2"
                    inputMode="numeric"
                    name="partySize"
                  />
                </label>
                <label data-slot="gm-wide-field">
                  <span>GM prompt</span>
                  <textarea
                    name="prompt"
                    placeholder="Make the next room harder, but give wounded players a clever non-combat option."
                  />
                </label>
                <Button disabled={!selectedWorldId} type="submit">
                  Draft patch
                </Button>
              </form>

              <section data-component="gm-patch-preview">
                <h2>Patch preview</h2>
                {activeDraft ? (
                  <PatchPreview
                    approved={approvedIds.has(activeDraft.id)}
                    draft={activeDraft}
                    worldId={selectedWorldId ?? ""}
                  />
                ) : (
                  <p>
                    Create or select a world, then draft a difficulty patch.
                    Drafts are stored as `gm-patch-draft` events in Supabase so
                    the live host can later consume approved changes.
                  </p>
                )}
              </section>
            </div>

            <aside data-component="gm-side">
              <section>
                <h2>Worlds</h2>
                {worlds.length ? (
                  <ul>
                    {worlds.map((world) => (
                      <li
                        data-active={world.id === selectedWorldId}
                        key={world.id}
                      >
                        <Link href={`/gm?world=${world.id}`}>
                          {world.id} - seed {world.seed} - gen{" "}
                          {world.generation}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No GM worlds yet.</p>
                )}
              </section>

              <section>
                <h2>Patch queue</h2>
                {events.length ? (
                  <ul>
                    {events.map((event) => (
                      <li key={event.id}>
                        <Link
                          href={`/gm?world=${selectedWorldId ?? ""}&patch=${
                            event.event_id ?? ""
                          }`}
                        >
                          {event.event_type.replace("gm-patch-", "")} -{" "}
                          {event.event_id ?? "event"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No patch drafts yet.</p>
                )}
              </section>

              <section>
                <h2>Connected players</h2>
                <ul>
                  <li>Mira - Floor 2 - host bridge pending</li>
                  <li>Sol - inventory sync waits for live host events</li>
                </ul>
              </section>
            </aside>
          </section>

          <section>
            <h2>Host bridge</h2>
            <Command value="opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737" />
            <p>
              The website owns GM world rows and approved patch events. The
              current live game still needs a reachable host process to relay
              those approved changes to connected terminal clients.
            </p>
          </section>

          <section data-component="mode-grid">
            {gameModes.map((mode) => (
              <article data-component="mode-card" key={mode.id}>
                <span>{mode.status}</span>
                <h2>{mode.name}</h2>
                <p>{mode.summary}</p>
              </article>
            ))}
          </section>
        </article>
        <Footer />
      </div>
    </main>
  );
}

function PatchPreview({
  approved,
  draft,
  worldId,
}: {
  approved: boolean;
  draft: GmPatchDraft;
  worldId: string;
}) {
  return (
    <div data-component="gm-patch-card">
      <div>
        <span>{draft.difficulty}</span>
        <h3>{draft.title}</h3>
        <p>{draft.playerBriefing}</p>
      </div>
      <div data-component="gm-operation-grid">
        {draft.operations.map((operation) => (
          <div key={operation.path}>
            <span>{operation.path}</span>
            <strong>{String(operation.value)}</strong>
            <p>{operation.reason}</p>
          </div>
        ))}
      </div>
      <div data-component="gm-tool-list">
        {draft.toolCalls.map((tool) => (
          <div data-status={tool.status} key={tool.name}>
            <strong>{tool.name}</strong>
            <span>{tool.status}</span>
            <p>{tool.summary}</p>
          </div>
        ))}
      </div>
      <ul>
        {draft.approvalChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <form action={approveGmPatch}>
        <input name="worldId" type="hidden" value={worldId} />
        <input name="patchId" type="hidden" value={draft.id} />
        <Button disabled={approved} type="submit">
          {approved ? "Approved" : "Approve for host"}
        </Button>
      </form>
    </div>
  );
}
