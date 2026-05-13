import Link from "next/link";
import { redirect } from "next/navigation";
import { Command } from "@/components/command";
import { Footer, Header } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { gameModes } from "@/lib/game-modes";
import { supabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

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

async function getWorldRows(ownerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opendungeon_worlds")
    .select("id, seed, generation, updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(4)
    .returns<WorldRow[]>();

  return { error: error?.message ?? null, worlds: data ?? [] };
}

export default async function GmPage() {
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

  const { error, worlds } = await getWorldRows(user.id);
  const gmMode = gameModes.find((mode) => mode.id === "multiplayer-gm");

  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />
        <article data-component="docs">
          <p data-slot="eyebrow">multiplayer with gm</p>
          <h1>GM console</h1>
          <p>
            A logged-in Dungeon Master workbench for AI-assisted world changes.
            This page starts the website surface; live player state, AI Gateway
            calls, asset generation, and realtime patch delivery still need the
            backend pieces listed below.
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
              <span>World rows</span>
              <strong>{error ? "sync unavailable" : worlds.length}</strong>
            </div>
          </section>

          {error ? <p data-slot="notice">World sync failed: {error}</p> : null}

          <section data-component="mode-grid">
            {gameModes.map((mode) => (
              <article data-component="mode-card" key={mode.id}>
                <span>{mode.status}</span>
                <h2>{mode.name}</h2>
                <p>{mode.summary}</p>
              </article>
            ))}
          </section>

          <section data-component="gm-layout">
            <div data-component="gm-chat">
              <div data-slot="gm-toolbar">
                <span>AI Elements chat surface</span>
                <span>AI Gateway planned</span>
              </div>
              <div data-slot="gm-message" data-variant="user">
                <strong>GM</strong>
                <p>
                  Add a haunted orchard room after Floor 2 and give the party a
                  reason to bring the village cook.
                </p>
              </div>
              <div data-slot="gm-message" data-variant="assistant">
                <strong>AI assistant</strong>
                <p>
                  Drafted a validated world patch, one lore entry, and a sprite
                  prompt. Review before players receive it.
                </p>
                <ul>
                  <li>tool: create_lore_patch</li>
                  <li>tool: create_floor_room_patch</li>
                  <li>tool: generate_sprite_prompt</li>
                </ul>
              </div>
              <form data-slot="gm-prompt">
                <textarea
                  aria-label="GM prompt"
                  disabled
                  placeholder="Connect AI Gateway and world tools to enable live GM prompts."
                />
                <Button disabled type="submit">
                  Send
                </Button>
              </form>
            </div>

            <aside data-component="gm-side">
              <section>
                <h2>Connected players</h2>
                <ul>
                  <li>Mira - Floor 2 - waiting for realtime state</li>
                  <li>Sol - inventory unknown until host sync lands</li>
                </ul>
              </section>
              <section>
                <h2>Worlds</h2>
                {worlds.length ? (
                  <ul>
                    {worlds.map((world) => (
                      <li key={world.id}>
                        {world.id} - seed {world.seed} - gen {world.generation}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No GM worlds yet.</p>
                )}
              </section>
            </aside>
          </section>

          <section>
            <h2>Backend still needed</h2>
            <ul>
              <li>
                Use the AI Elements chatbot template with `ai`, `@ai-sdk/react`,
                and an `/api/gm/chat` route.
              </li>
              <li>
                Route model calls through Vercel AI Gateway, with tool calls for
                world patches and image-generation prompts.
              </li>
              <li>
                Store every GM-created asset, lore entry, level patch, and
                approval event under a Supabase world owned by the GM.
              </li>
              <li>
                Stream only validated and approved patches to connected players
                in that world.
              </li>
            </ul>
          </section>

          <section>
            <h2>Local host bridge</h2>
            <Command value="opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737" />
            <p>
              The GM website can own account/world data on Vercel, but the
              current live game still needs a reachable host until realtime
              browser-backed multiplayer lands.
            </p>
          </section>

          <p>
            Source template:{" "}
            <a href="https://elements.ai-sdk.dev/examples/chatbot">
              AI Elements chatbot
            </a>
            . Account surface: <Link href="/profile">Profile</Link>.
          </p>
        </article>
        <Footer />
      </div>
    </main>
  );
}
