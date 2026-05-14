import { Command } from "@/components/command";
import { InstallTabs } from "@/components/install-tabs";
import { Footer, Header } from "@/components/site-chrome";
import { gameModes } from "@/lib/game-modes";

export default function Page() {
  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />

        <div data-component="content">
          <section data-component="hero">
            <div data-slot="hero-copy">
              <h1>A terminal dungeon crawler</h1>
              <p>
                Play solo or co-op from the same seed. Local runs stay
                deterministic; GM worlds can add approved AI-assisted changes.
                <span data-slot="br" />
                Install the CLI, start a descent, or host a lobby for friends.
              </p>
            </div>

            <InstallTabs />
          </section>

          <section
            aria-label="Gameplay video"
            data-component="video-placeholder"
          >
            <div data-slot="video-shell">
              <span aria-hidden="true" data-slot="play-icon" />
              <div>
                <p>Gameplay video</p>
                <span>Placeholder</span>
              </div>
            </div>
          </section>

          <section data-component="what">
            <div data-slot="section-title">
              <h3>What is opendungeon?</h3>
              <p>
                opendungeon is a terminal roguelike built with OpenTUI. The
                engine owns movement, combat, loot, quests, and village
                progression.
              </p>
            </div>
            <ul>
              <li>
                <span>[*]</span>
                <div>
                  <strong>Seeded worlds</strong> Share a seed and replay the
                  same dungeon layout.
                </div>
              </li>
              <li>
                <span>[*]</span>
                <div>
                  <strong>GM worlds</strong> Logged-in GMs can approve
                  world-specific changes without replacing the canonical story.
                </div>
              </li>
              <li>
                <span>[*]</span>
                <div>
                  <strong>Runtime assets</strong> Sprites and terminal variants
                  are stored as opendungeon assets.
                </div>
              </li>
            </ul>
            <a href="/docs">
              <span>Open docs </span>
              <span aria-hidden="true">-&gt;</span>
            </a>
          </section>

          <section data-component="preview-copy">
            <h3>Three ways to play</h3>
            <p>
              Single Player is the canonical authored story. Multiplayer keeps
              that same story and adds shared co-op state. Multiplayer with GM
              is a separate logged-in world where approved GM and AI changes
              live outside the canonical save.
            </p>
            <div data-component="mode-grid">
              {gameModes.map((mode) => (
                <article data-component="mode-card" key={mode.id}>
                  <span>{mode.status}</span>
                  <h2>{mode.name}</h2>
                  <p>{mode.summary}</p>
                </article>
              ))}
            </div>
          </section>

          <section data-component="preview-copy">
            <h3>Local multiplayer on one laptop</h3>
            <p>
              Start one host, then open separate terminal tabs or apps for each
              player. Guest sessions can run side by side with different crawler
              names; signed-in duplicate runs stay guarded by the local
              active-run lock.
            </p>
            <section
              aria-label="Local multiplayer commands"
              data-component="install"
            >
              <Command value="opendungeon-host --host 127.0.0.1 --mode coop --seed 2423368 --port 3737" />
              <Command value="OPENDUNGEON_PLAYER_NAME=Mira opendungeon join http://127.0.0.1:3737" />
              <Command value="OPENDUNGEON_PLAYER_NAME=Sol opendungeon join http://127.0.0.1:3737" />
            </section>
          </section>

          <section data-component="preview-copy">
            <h3>Accounts are optional</h3>
            <p>
              Play locally without logging in. Use an account for profile pages,
              saved lobby metadata, and GM-created worlds.
            </p>
          </section>
        </div>

        <Footer />
      </div>
    </main>
  );
}
