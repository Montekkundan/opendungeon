# Deployment

The website is designed for Vercel. It can host the homepage, docs, changelog, account pages, login callback, and lobby invite pages.

## Vercel website

Set the project root or build command so Vercel runs the Next.js app in `packages/www`.

```txt
bun --cwd packages/www build
```

Connect the website account provider before enabling login and profile pages in production.

## What deploys cleanly today

- Home page.
- Docs and changelog pages.
- Profile login and callback route.
- Lobby creation and invite instruction pages.
- Static metadata and robots file.

## Create and invite pages

`/create` and `/create/[id]` are website helpers, not the game server. They can create a stable invite page, show the selected Multiplayer lobby variant, print the host command, and print the join command for friends. If the host is logged in, `/create` can also save the invite to the host account for later GM/cloud linking.

Players still need one running `opendungeon-host` process for live WebSocket play. The invite page should make that boundary obvious: it prints setup commands, but it is not the live lobby server.

## What still needs infrastructure

The current multiplayer game host is a CLI WebSocket process. Internet multiplayer needs a reachable host, a container/service, or a future browser realtime adapter.

## Internet multiplayer path

The supported deployment story is explicit:

- Vercel hosts `packages/www`: docs, account pages, `/create`, `/create/[id]`, `/gm`, changelog, and profile flows.
- One `opendungeon-host` process owns each live game. For internet play, run it on a VPS, Docker host, Fly.io, Render, Railway, or another service that supports long-running TCP/WebSocket processes.
- The host should bind to `0.0.0.0`, expose the selected port, and set `--public-url` to the reachable HTTPS or HTTP URL shown to players.
- Account-backed storage can keep profiles, cloud saves, world ownership, GM patch proposals, host snapshot archives, and approved asset metadata. It should not be treated as the current movement/combat authority.
- The website invite page stores owner-scoped lobby metadata and displays setup commands. It does not keep the live lobby process running.

For a private internet test:

```txt
opendungeon-host --host 0.0.0.0 --public-url http://YOUR_SERVER_IP:3737 --mode coop --seed 2423368 --port 3737
opendungeon join http://YOUR_SERVER_IP:3737
```

The later browser-native path can replace this only when the browser client has an authoritative realtime adapter that preserves validated command-log semantics.

## GM host archives

The logged-in `/gm` page can read a running `opendungeon-host` URL and save the current host snapshot to the selected GM world. The archive event includes connected players, co-op state, recent command results, action log entries, delivered GM patches, combat state, and sync warnings. These records give future GM tooling a durable action history without making the website the live movement authority.

## Vercel Sandbox experiment

Vercel Sandbox is a plausible future path for player-owned internet hosting, but it should be treated as an experiment before it becomes the default. The flow would be:

- The host player signs in to opendungeon, connects their Vercel account, and chooses a team/project that owns sandbox usage.
- The website creates a sandbox under that host account, starts `opendungeon-host` with `runCommand({ detached: true })`, and exposes the sandbox port as the lobby URL.
- The website stores the lobby id, owner id, sandbox id, host URL, mode, seed, GM world id, and cleanup status.
- Snapshots can warm the sandbox so dependency install and package setup do not happen for every game session.
- The website stops the sandbox when the lobby ends or expires.

The planned sandbox launch command is:

```txt
opendungeon-host --host 0.0.0.0 --public-url "$OPENDUNGEON_PUBLIC_URL" --mode coop --seed 2423368 --port 3737
```

The limits matter for gameplay. Vercel documents a default sandbox timeout of 5 minutes, with configurable/extendable runtime up to 45 minutes on Hobby and 5 hours on Pro/Enterprise. Open ports are limited per sandbox. Installed system packages do not persist unless the prepared sandbox is snapshotted, and snapshot creation stops the sandbox that was captured.

That means the first implementation should stay opt-in:

- Keep LAN/VPS/Docker hosting as the supported path.
- Use Sandbox only for logged-in hosts who explicitly connect Vercel.
- Warn hosts about plan limits and session timeout before creating the sandbox.
- Keep a reconnect path when the sandbox expires.
- Always call cleanup and store cleanup state.

References:

- https://vercel.com/docs/vercel-sandbox
- https://vercel.com/docs/vercel-sandbox/pricing
- https://vercel.com/docs/vercel-sandbox/sdk-reference
- https://vercel.com/kb/guide/how-to-install-system-packages-in-vercel-sandbox
- https://vercel.com/kb/guide/how-to-use-snapshots-for-faster-sandbox-startup

## Release path

Changesets tracks package releases. Website changes can be deployed independently, but package versions still move through the repo release flow and generated changelog.

Run the release checks before merging package-facing work:

```txt
bun run hygiene:public
bun run release:verify
bun run package:check
```

The release verifier keeps the main npm workflow on the expected path: package checks first, Changesets versioning, npm Trusted Publishing permissions, and a safe skip when the package version is already published.
