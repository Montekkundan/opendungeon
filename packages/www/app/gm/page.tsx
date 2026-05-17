import Link from "next/link";
import { redirect } from "next/navigation";
import { Command } from "@/components/command";
import { Footer, Header } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { gameModes } from "@/lib/game-modes";
import {
  fetchGmHostSnapshot,
  type GmHostAuthoritativeState,
  type GmHostBridgeResult,
  type GmHostSnapshot,
  type GmPatchDraft,
  gmDifficultyLevels,
} from "@/lib/gm";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  approveGmPatch,
  archiveHostSnapshot,
  createGmWorld,
  draftGmPatch,
} from "./actions";

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
    counts?: {
      actions?: number;
      commands?: number;
      gmPatches?: number;
      players?: number;
      spectators?: number;
    };
    draft?: GmPatchDraft;
    hostState?: GmHostAuthoritativeState | null;
    hostUrl?: string;
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
    .in("event_type", [
      "gm-patch-draft",
      "gm-patch-approved",
      "gm-host-snapshot-archived",
    ])
    .order("created_at", { ascending: false })
    .limit(12)
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

function activePatchDraft(
  events: WorldEventRow[],
  patchId: string | undefined
) {
  return events.find(
    (event) =>
      event.event_type === "gm-patch-draft" &&
      event.metadata?.draft &&
      event.event_id === (patchId ?? event.event_id)
  )?.metadata?.draft;
}

function approvedPatchIds(events: WorldEventRow[]) {
  return new Set(
    events
      .filter((event) => event.event_type === "gm-patch-approved")
      .map((event) => event.event_id)
      .filter(Boolean)
  );
}

function patchEvents(events: WorldEventRow[]) {
  return events.filter((event) => event.event_type.startsWith("gm-patch-"));
}

function hostArchiveEvents(events: WorldEventRow[]) {
  return events.filter(
    (event) => event.event_type === "gm-host-snapshot-archived"
  );
}

function hostStatusLabel(hostBridge: GmHostBridgeResult) {
  if (hostBridge.snapshot) {
    return `${hostBridge.snapshot.players.length} players`;
  }
  if (hostBridge.url) {
    return "unreachable";
  }
  return "not linked";
}

function approvalButtonLabel(approved: boolean, hostUrl: string) {
  if (approved) {
    return "Approved";
  }
  return hostUrl ? "Approve and deliver" : "Approve for host";
}

export default async function GmPage({ searchParams }: GmPageProps) {
  if (!supabaseConfigured()) {
    redirect(
      "/login?next=/gm&error=Account%20storage%20is%20required%20for%20the%20GM%20console"
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
  const hostBridge = await fetchGmHostSnapshot(
    singleParam(params, "host") ?? ""
  );
  const { error: eventsError, events } = await getWorldEvents(
    user.id,
    selectedWorldId
  );
  const gmMode = gameModes.find((mode) => mode.id === "multiplayer-gm");
  const activeDraft = activePatchDraft(events, singleParam(params, "patch"));
  const approvedIds = approvedPatchIds(events);

  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />
        <article data-component="docs">
          <p data-slot="eyebrow">multiplayer with gm</p>
          <h1>GM console</h1>
          <p>
            A logged-in Dungeon Master workbench for steering a multiplayer
            world. The GM chooses how hard the next beat should feel, drafts a
            validated patch, reviews the tool calls, then approves it for host
            delivery.
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
            <div>
              <span>Live host</span>
              <strong>{hostStatusLabel(hostBridge)}</strong>
            </div>
          </section>

          {singleParam(params, "error") ? (
            <p data-slot="notice">{singleParam(params, "error")}</p>
          ) : null}
          {singleParam(params, "archived") ? (
            <p data-slot="notice">Host snapshot archived.</p>
          ) : null}
          {error ? <p data-slot="notice">World sync failed: {error}</p> : null}
          {eventsError ? (
            <p data-slot="notice">Patch queue failed: {eventsError}</p>
          ) : null}
          {hostBridge.error ? (
            <p data-slot="notice">Host bridge failed: {hostBridge.error}</p>
          ) : null}

          <section data-component="gm-layout">
            <div data-component="gm-chat">
              <div data-slot="gm-toolbar">
                <span>GM agent steering</span>
                <span>validated patch queue</span>
              </div>

              <GmTranscript events={events} hostBridge={hostBridge} />

              <form action={createGmWorld} data-component="gm-create">
                <label>
                  <span>Seed</span>
                  <input
                    defaultValue="2423368"
                    inputMode="numeric"
                    name="seed"
                  />
                </label>
                <input name="hostUrl" type="hidden" value={hostBridge.url} />
                <Button type="submit">Create GM world</Button>
              </form>

              <form action="/gm" data-component="gm-host" method="get">
                <input
                  name="world"
                  type="hidden"
                  value={selectedWorldId ?? ""}
                />
                <input
                  name="patch"
                  type="hidden"
                  value={singleParam(params, "patch") ?? ""}
                />
                <label>
                  <span>Live host URL</span>
                  <input
                    defaultValue={hostBridge.url || "http://127.0.0.1:3737"}
                    name="host"
                    placeholder="http://127.0.0.1:3737"
                    type="url"
                  />
                </label>
                <Button type="submit">Read host state</Button>
              </form>

              <form action={draftGmPatch} data-slot="gm-prompt">
                <input
                  name="worldId"
                  type="hidden"
                  value={selectedWorldId ?? ""}
                />
                <input name="hostUrl" type="hidden" value={hostBridge.url} />
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
                    hostUrl={hostBridge.url}
                    worldId={selectedWorldId ?? ""}
                  />
                ) : (
                  <p>
                    Create or select a world, then draft a difficulty patch.
                    Drafts are stored as `gm-patch-draft` events so the live
                    host can later consume approved changes.
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
                        <Link
                          href={`/gm?world=${world.id}${
                            hostBridge.url
                              ? `&host=${encodeURIComponent(hostBridge.url)}`
                              : ""
                          }`}
                        >
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
                {patchEvents(events).length ? (
                  <ul>
                    {patchEvents(events).map((event) => (
                      <li key={event.id}>
                        <Link
                          href={`/gm?world=${selectedWorldId ?? ""}&patch=${
                            event.event_id ?? ""
                          }${hostBridge.url ? `&host=${encodeURIComponent(hostBridge.url)}` : ""}`}
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
                <HostPlayerList snapshot={hostBridge.snapshot} />
              </section>

              <section>
                <h2>Host authority</h2>
                <HostAuthorityState snapshot={hostBridge.snapshot} />
              </section>

              <section>
                <h2>Archive host state</h2>
                <HostArchiveControl
                  hostBridge={hostBridge}
                  selectedWorldId={selectedWorldId}
                />
              </section>

              <section>
                <h2>Host archive</h2>
                <HostArchiveList events={hostArchiveEvents(events)} />
              </section>

              <section>
                <h2>Action log</h2>
                <HostActionLog snapshot={hostBridge.snapshot} />
              </section>

              <section>
                <h2>Command relay</h2>
                <HostCommandLog snapshot={hostBridge.snapshot} />
              </section>

              <section>
                <h2>Delivered patches</h2>
                <HostPatchList snapshot={hostBridge.snapshot} />
              </section>
            </aside>
          </section>

          <section>
            <h2>Host bridge</h2>
            <Command value="opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737" />
            <p>
              The website owns GM world rows and approved patch events. Link a
              running host URL above to see live players and push approved
              patches into the host queue.
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
  hostUrl,
  worldId,
}: {
  approved: boolean;
  draft: GmPatchDraft;
  hostUrl: string;
  worldId: string;
}) {
  return (
    <div data-component="gm-patch-card">
      <div>
        <span>
          {draft.difficulty} -{" "}
          {draft.source === "ai-gateway" ? "AI Gateway" : "rules fallback"}
        </span>
        <h3>{draft.title}</h3>
        <p>{draft.playerBriefing}</p>
        {draft.aiNote ? <p>{draft.aiNote}</p> : null}
        {draft.model ? <p>Model: {draft.model}</p> : null}
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
            <span>
              {tool.status} - {tool.category}
            </span>
            <p>{tool.summary}</p>
            <p>{tool.description}</p>
            <p>{tool.review}</p>
          </div>
        ))}
      </div>
      <ul>
        {draft.approvalChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <form action={approveGmPatch}>
        <input name="hostUrl" type="hidden" value={hostUrl} />
        <input name="worldId" type="hidden" value={worldId} />
        <input name="patchId" type="hidden" value={draft.id} />
        <Button disabled={approved} type="submit">
          {approvalButtonLabel(approved, hostUrl)}
        </Button>
      </form>
    </div>
  );
}

function GmTranscript({
  events,
  hostBridge,
}: {
  events: WorldEventRow[];
  hostBridge: GmHostBridgeResult;
}) {
  const transcriptEvents = events
    .filter((event) =>
      [
        "gm-patch-draft",
        "gm-patch-approved",
        "gm-host-snapshot-archived",
      ].includes(event.event_type)
    )
    .slice(0, 5)
    .reverse();

  return (
    <section data-component="gm-transcript">
      <h2>GM transcript</h2>
      {hostBridge.snapshot ? (
        <div data-slot="gm-message" data-variant="assistant">
          <strong>Host bridge</strong>
          <p>
            Reading {hostBridge.snapshot.players.length} connected players and{" "}
            {hostBridge.snapshot.commands.length} accepted command results from{" "}
            {hostBridge.url}.
          </p>
        </div>
      ) : (
        <div data-slot="gm-message" data-variant="assistant">
          <strong>Host bridge</strong>
          <p>
            Link a running host to turn the GM prompt into live-player context.
          </p>
        </div>
      )}
      {transcriptEvents.length ? (
        transcriptEvents.map((event) => (
          <div data-slot="gm-message" data-variant="assistant" key={event.id}>
            <strong>
              {event.event_type.replace("gm-", "").replaceAll("-", " ")}
            </strong>
            <p>{event.message}</p>
            {event.metadata?.draft ? (
              <div data-component="gm-transcript-tools">
                {event.metadata.draft.toolCalls.map((tool) => (
                  <span data-status={tool.status} key={tool.name}>
                    {tool.name}
                  </span>
                ))}
              </div>
            ) : null}
            {event.metadata?.counts ? (
              <p>
                {event.metadata.counts.players ?? 0} players,{" "}
                {event.metadata.counts.commands ?? 0} commands,{" "}
                {event.metadata.counts.actions ?? 0} actions archived.
              </p>
            ) : null}
          </div>
        ))
      ) : (
        <div data-slot="gm-message" data-variant="user">
          <strong>GM prompt</strong>
          <p>
            Ask for a harder, easier, or more tactical beat. Drafts appear here
            before they can be approved for the host.
          </p>
        </div>
      )}
    </section>
  );
}

function HostArchiveControl({
  hostBridge,
  selectedWorldId,
}: {
  hostBridge: GmHostBridgeResult;
  selectedWorldId: string | null;
}) {
  if (!selectedWorldId) {
    return <p>Create or select a GM world before archiving host state.</p>;
  }
  if (!hostBridge.url) {
    return <p>Link a running `opendungeon-host` URL first.</p>;
  }
  if (!hostBridge.snapshot) {
    return <p>Read a reachable host before archiving it.</p>;
  }

  return (
    <form action={archiveHostSnapshot} data-component="gm-archive-form">
      <input name="hostUrl" type="hidden" value={hostBridge.url} />
      <input name="worldId" type="hidden" value={selectedWorldId} />
      <p>
        Save players, host-owned command results, action log entries, combat
        state, patches, and sync warnings as an owner-scoped archive event.
      </p>
      <Button type="submit">Archive host state</Button>
    </form>
  );
}

function HostArchiveList({ events }: { events: WorldEventRow[] }) {
  if (!events.length) {
    return <p>No host snapshots have been archived for this world yet.</p>;
  }

  return (
    <div data-component="gm-live-list">
      {events.map((event) => (
        <div key={event.id}>
          <strong>{event.event_id ?? "host archive"}</strong>
          <span>{event.created_at.replace("T", " ").slice(0, 16)}</span>
          <span>{event.message}</span>
          {event.metadata?.counts ? (
            <span>
              {event.metadata.counts.players ?? 0} players -{" "}
              {event.metadata.counts.commands ?? 0} commands -{" "}
              {event.metadata.counts.actions ?? 0} actions
            </span>
          ) : null}
          {event.metadata?.hostState ? (
            <span>
              Host #{event.metadata.hostState.commandSequence} -{" "}
              {event.metadata.hostState.accepted ? "accepted" : "rejected"} -{" "}
              {event.metadata.hostState.name} -{" "}
              {event.metadata.hostState.message}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function HostAuthorityState({ snapshot }: { snapshot: GmHostSnapshot | null }) {
  if (!snapshot) {
    return <p>Enter the `opendungeon-host` URL to see host-owned state.</p>;
  }

  const states =
    snapshot.hostStates?.length ? snapshot.hostStates : snapshot.hostState ? [snapshot.hostState] : [];

  if (!states.length) {
    return <p>The host has not applied a player command yet.</p>;
  }

  return (
    <div data-component="gm-live-list">
      {states.map((state) => (
        <div key={state.playerId}>
          <strong>
            Host #{state.commandSequence}{" "}
            {state.accepted ? "accepted" : "rejected"} {state.name}
          </strong>
          <span>
            Floor {state.floor} · turn {state.turn} · HP {state.hp} · ({state.x},{" "}
            {state.y}) · {state.status}
          </span>
          <span>{state.message}</span>
        </div>
      ))}
    </div>
  );
}

function HostPlayerList({ snapshot }: { snapshot: GmHostSnapshot | null }) {
  if (!snapshot) {
    return (
      <p>
        Enter the `opendungeon-host` URL to read real lobby players, floors,
        health, tutorial readiness, and combat state.
      </p>
    );
  }

  const byId = new Map(
    snapshot.coopStates.map((state) => [state.playerId, state])
  );
  const rows = snapshot.players.map((player) => ({
    player,
    state: byId.get(player.id),
  }));

  return (
    <div data-component="gm-live-list">
      {rows.length ? (
        rows.map(({ player, state }) => (
          <div key={player.id}>
            <strong>{player.name}</strong>
            <span>
              {state
                ? `Floor ${state.floor} - HP ${state.hp} - ${state.classId} - ${state.tutorialStage}${
                    state.tutorialReady ? " ready" : " waiting"
                  }`
                : "connected, waiting for sync"}
            </span>
          </div>
        ))
      ) : (
        <p>No terminal players are connected.</p>
      )}
      {snapshot.syncWarnings.length ? (
        <ul>
          {snapshot.syncWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function HostPatchList({ snapshot }: { snapshot: GmHostSnapshot | null }) {
  if (!snapshot) {
    return <p>Approved patches appear here once a host is linked.</p>;
  }

  return (
    <div data-component="gm-live-list">
      {snapshot.gmPatches.length ? (
        snapshot.gmPatches.map((patch) => (
          <div key={patch.id}>
            <strong>{patch.title}</strong>
            <span>
              {patch.difficulty} - {patch.operationCount} ops - {patch.id}
            </span>
          </div>
        ))
      ) : (
        <p>No approved patches have reached this host yet.</p>
      )}
    </div>
  );
}

function HostActionLog({ snapshot }: { snapshot: GmHostSnapshot | null }) {
  if (!snapshot) {
    return <p>Player actions appear here once a host is linked.</p>;
  }

  return (
    <div data-component="gm-live-list">
      {snapshot.actions?.length ? (
        snapshot.actions.slice(0, 12).map((action) => (
          <div key={action.id}>
            <strong>{action.name}</strong>
            <span>
              {action.type} - F{action.floor} T{action.turn} - {action.label}
            </span>
          </div>
        ))
      ) : (
        <p>No player actions have reached this host yet.</p>
      )}
    </div>
  );
}

function HostCommandLog({ snapshot }: { snapshot: GmHostSnapshot | null }) {
  if (!snapshot) {
    return <p>Accepted host commands appear here once a host is linked.</p>;
  }

  return (
    <div data-component="gm-live-list">
      {snapshot.commands?.length ? (
        snapshot.commands.slice(0, 12).map((command) => (
          <div key={command.id}>
            <strong>
              #{command.sequence} {command.name}
            </strong>
            <span>
              {command.type} - {command.accepted ? "accepted" : "rejected"} -{" "}
              {command.label} - {command.result.message}
            </span>
          </div>
        ))
      ) : (
        <p>No accepted commands have reached this host yet.</p>
      )}
    </div>
  );
}
