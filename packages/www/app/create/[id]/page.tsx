import { Command } from "@/components/command";
import { Footer, Header } from "@/components/site-chrome";
import { lobbyCommands, normalizeLobbyMode, normalizeSeed } from "@/lib/lobby";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; seed?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: `${id} | opendungeon lobby`,
  };
}

export default async function LobbyPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const mode = normalizeLobbyMode(query.mode ?? id.split("-")[0] ?? "coop");
  const seed = normalizeSeed(query.seed ?? id.split("-")[1] ?? "2423368");
  const commands = lobbyCommands(mode, seed);

  return (
    <main data-page="opendungeon">
      <div data-component="container">
        <Header />
        <article data-component="docs">
          <p data-slot="eyebrow">invite</p>
          <h1>{id}</h1>
          <p>
            This page is the shareable invite card. Run the host command on one
            machine, then send friends the join command after replacing
            YOUR_LAN_IP with the host IP printed by opendungeon-host.
          </p>

          <section data-component="lobby-summary">
            <div>
              <span>Mode</span>
              <strong>{mode}</strong>
            </div>
            <div>
              <span>Seed</span>
              <strong>{seed}</strong>
            </div>
            <div>
              <span>Host</span>
              <strong>CLI WebSocket</strong>
            </div>
          </section>

          <section>
            <h2>Host on LAN</h2>
            <Command value={commands.local} />
          </section>

          <section>
            <h2>Friends join</h2>
            <Command value={commands.join} />
          </section>

          <section>
            <h2>Internet hosting</h2>
            <Command value={commands.public} />
            <p>
              For public internet play, the host still needs a reachable
              WebSocket endpoint. A Vercel-only route cannot keep the current
              CLI lobby socket alive.
            </p>
          </section>
        </article>
        <Footer />
      </div>
    </main>
  );
}
