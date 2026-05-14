import { Command } from "@/components/command";
import { Footer, Header } from "@/components/site-chrome";
import { Button } from "@/components/ui/8bit/button";
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
            Create a shareable lobby page. Co-op keeps the authored story and
            village loop shared between players; race is a same-seed challenge.
            Run one host process, then send friends the invite.
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
            <Button data-slot="create-invite-button" type="submit">
              Create invite
            </Button>
          </form>

          <section>
            <h2>LAN host command</h2>
            <Command value="opendungeon-host --host 0.0.0.0 --mode coop --seed 2423368 --port 3737" />
            <Command value="opendungeon join http://YOUR_LAN_IP:3737" />
          </section>

          <section>
            <h2>Internet host plan</h2>
            <p>
              For friends outside your network, run `opendungeon-host` on a
              reachable machine and set a public URL or tunnel.
            </p>
            <Command value="opendungeon-host --host 0.0.0.0 --public-url https://YOUR_DOMAIN_OR_TUNNEL --mode coop --seed 2423368 --port 3737" />
            <Command value="opendungeon join https://YOUR_DOMAIN_OR_TUNNEL" />
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
            </ul>
          </section>
        </article>
        <Footer />
      </div>
    </main>
  );
}
