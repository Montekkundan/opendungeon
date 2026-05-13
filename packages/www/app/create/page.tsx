import { Command } from "@/components/command";
import { Footer, Header } from "@/components/site-chrome";
import { createLobby } from "@/lib/lobby";

export const metadata = {
  title: "Create Lobby | opendungeon",
};

export default function CreatePage() {
  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />
        <article data-component="docs">
          <p data-slot="eyebrow">multiplayer</p>
          <h1>Create</h1>
          <p>
            Create a shareable lobby page for a co-op or race run. The website
            can make the invite card on Vercel for free; the current live game
            still needs an opendungeon-host process for WebSocket play.
          </p>

          <form action={createLobby} data-component="lobby-form">
            <label>
              <span>Mode</span>
              <select defaultValue="coop" name="mode">
                <option value="coop">Co-op</option>
                <option value="race">Race</option>
              </select>
            </label>
            <label>
              <span>Seed</span>
              <input defaultValue="2423368" inputMode="numeric" name="seed" />
            </label>
            <button type="submit">Create invite</button>
          </form>

          <section>
            <h2>Local host command</h2>
            <Command value="opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737" />
          </section>

          <section>
            <h2>What this handles</h2>
            <ul>
              <li>Creates a stable URL you can send to friends.</li>
              <li>
                Gives host and join commands for the current CLI multiplayer
                server.
              </li>
              <li>
                Keeps Multiplayer on the authored story loop. GM-created worlds
                stay in the separate logged-in GM mode.
              </li>
              <li>
                Keeps the website deploy simple on Vercel while we decide
                whether to add Supabase Realtime or a dedicated server later.
              </li>
            </ul>
          </section>
        </article>
        <Footer />
      </div>
    </main>
  );
}
