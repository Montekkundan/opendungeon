import { Command } from "@/components/command";
import { Footer, Header } from "@/components/site-chrome";
import { createLobby } from "@/lib/lobby";
import { buildSandboxHostPlan } from "@/lib/sandbox-host";

export const metadata = {
  title: "Create Lobby | opendungeon",
};

export default function CreatePage() {
  const sandbox = buildSandboxHostPlan({
    lobbyId: "preview-lobby",
    mode: "coop",
    seed: 2_423_368,
  });

  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />
        <article data-component="docs">
          <p data-slot="eyebrow">multiplayer</p>
          <h1>Create</h1>
          <p>
            Create a shareable Multiplayer lobby page. Multiplayer co-op keeps
            the authored story and village loop shared between players; race is
            only a same-seed challenge variant. The current live game still
            needs an opendungeon-host process for WebSocket play. If you are
            logged in, the invite metadata is also saved to your Supabase-owned
            world rows for later GM/cloud linking.
          </p>

          <form action={createLobby} data-component="lobby-form">
            <label>
              <span>Mode</span>
              <select defaultValue="coop" name="mode">
                <option value="coop">Multiplayer co-op</option>
                <option value="race">Multiplayer race challenge</option>
              </select>
            </label>
            <label>
              <span>Seed</span>
              <input defaultValue="2423368" inputMode="numeric" name="seed" />
            </label>
            <button type="submit">Create invite</button>
          </form>

          <section>
            <h2>LAN host command</h2>
            <Command value="opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737" />
            <Command value="opendungeon join http://YOUR_LAN_IP:3737" />
          </section>

          <section>
            <h2>Internet host plan</h2>
            <p>
              For friends outside your network, the supported path today is a
              reachable `opendungeon-host` process on a machine you control. The
              planned website-hosted path is Vercel Sandbox under the host
              player's own Vercel account, with the resulting URL saved on the
              Supabase lobby row.
            </p>
            <Command value={sandbox.commands.install} />
            <Command value={sandbox.commands.launch} />
          </section>

          <section>
            <h2>What this handles</h2>
            <ul>
              <li>Creates a stable URL you can send to friends.</li>
              <li>
                Saves lobby metadata to Supabase for logged-in hosts without
                making the website own the live gameplay process.
              </li>
              <li>
                Gives host and join commands for the current CLI multiplayer
                server.
              </li>
              <li>
                Keeps Multiplayer on the authored story loop. GM-created worlds
                stay in the separate logged-in GM mode.
              </li>
              <li>
                Adds a concrete Vercel Sandbox plan to each saved lobby, while
                actual provisioning stays blocked on account linking, runtime
                limits, cleanup, and billing warnings.
              </li>
            </ul>
          </section>
        </article>
        <Footer />
      </div>
    </main>
  );
}
