import { Command } from "@/components/command";
import { Footer, Header } from "@/components/site-chrome";

export default function Page() {
  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />

        <div data-component="content">
          <section data-component="hero">
            <div data-slot="hero-copy">
              <h1>A terminal dungeon that remembers what you do</h1>
              <p>
                Seeded runs stay deterministic, while validated AI content
                patches add quests, bosses, loot, lore, and sprites.
                <span data-slot="br" />
                Play locally first, then sync worlds through Supabase when you
                are ready.
              </p>
            </div>

            <section aria-label="Install options" data-component="install">
              <Command value="bun add -g @montekkundan/opendungeon" />
              <Command value="opendungeon" />
              <Command value="opendungeon login test" />
              <Command value="opendungeon --login github" />
            </section>
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
                engine owns the rules; the AI admin proposes validated world
                config patches.
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
                  <strong>AI-admin content</strong> Events and quests expand
                  after milestone progress without breaking deterministic
                  gameplay.
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
            <h3>Cloud-backed, local-playable</h3>
            <p>
              Supabase handles auth and world storage. Vercel can host this
              website and account flow. The current live co-op server still
              needs the CLI host or a future Supabase Realtime adapter.
            </p>
          </section>
        </div>

        <Footer />
      </div>
    </main>
  );
}
