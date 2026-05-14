import { Command } from "@/components/command";
import { Footer, Header } from "@/components/site-chrome";
import {
  lobbyCommands,
  lobbyModeLabel,
  lobbyModeSummary,
  normalizeLobbyMode,
  normalizeSeed,
} from "@/lib/lobby";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cloud?: string; mode?: string; seed?: string }>;
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
  const modeLabel = lobbyModeLabel(mode);
  const modeSummary = lobbyModeSummary(mode);
  const cloudStatus = cloudStatusMessage(query.cloud);

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
            YOUR_LAN_IP with the host IP printed by opendungeon-host. GM worlds
            stay separate on the logged-in /gm console.
          </p>

          <section data-component="lobby-summary">
            <div>
              <span>Mode</span>
              <strong>{modeLabel}</strong>
            </div>
            <div>
              <span>Seed</span>
              <strong>{seed}</strong>
            </div>
            <div>
              <span>Host</span>
              <strong>CLI WebSocket</strong>
            </div>
            <div>
              <span>Supabase</span>
              <strong>{cloudStatus.label}</strong>
            </div>
          </section>
          <p>{cloudStatus.copy}</p>
          <p>{modeSummary}</p>

          <section>
            <h2>Host on LAN</h2>
            <Command value={commands.local} />
            <Command value="curl http://YOUR_LAN_IP:3737/health" />
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
            <p>
              Vercel Sandbox hosting is planned as an opt-in path for logged-in
              hosts who connect their own Vercel account; until then, use a
              reachable host process or private LAN.
            </p>
          </section>
        </article>
        <Footer />
      </div>
    </main>
  );
}

function cloudStatusMessage(value: string | undefined) {
  if (value === "saved") {
    return {
      copy: "This invite was saved to your Supabase-owned world rows for later GM/cloud linking.",
      label: "saved",
    };
  }
  if (value === "error") {
    return {
      copy: "The invite page still works, but Supabase metadata could not be saved. Check login and RLS/env settings before relying on cloud lobby history.",
      label: "not saved",
    };
  }
  return {
    copy: "Log in before creating an invite if you want this lobby recorded in your Supabase account.",
    label: "local only",
  };
}
