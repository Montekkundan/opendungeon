# Deployment

The website is designed for Vercel. It can host the homepage, docs, changelog, account pages, login callback, and lobby invite pages.

## Vercel website

Set the project root or build command so Vercel runs the Next.js app in `packages/www`.

```txt
bun --cwd packages/www build
```

Add the public Supabase URL and anonymous key in Vercel project settings. The profile page needs those values at runtime.

## What deploys cleanly today

- Home page.
- Docs and changelog pages.
- Profile login and callback route.
- Lobby creation and invite instruction pages.
- Static metadata and robots file.

## Create and invite pages

`/create` and `/create/[id]` are website helpers, not the game server. They can create a stable invite page, show the selected Multiplayer lobby variant, print the host command, and print the join command for friends.

Players still need one running `opendungeon-host` process for live WebSocket play. The invite page should make that boundary obvious: Vercel can host the instructions for free, but it does not keep the current CLI lobby process alive.

## What still needs infrastructure

The current multiplayer game host is a CLI WebSocket process. Vercel can describe and link lobbies, but it cannot keep a long-running game process alive as a normal static website page. Internet multiplayer needs a reachable host, a container/service, or a future browser realtime adapter.

## Internet multiplayer path

The supported deployment story is explicit:

- Vercel hosts `packages/www`: docs, account pages, `/create`, `/create/[id]`, `/gm`, changelog, and Supabase-authenticated profile flows.
- One `opendungeon-host` process owns each live game. For internet play, run it on a VPS, Docker host, Fly.io, Render, Railway, or another service that supports long-running TCP/WebSocket processes.
- The host should bind to `0.0.0.0`, expose the selected port, and set `--public-url` to the reachable HTTPS or HTTP URL shown to players.
- Supabase stores profiles, cloud saves, world ownership, GM patch proposals, action-log archives, and approved asset metadata. It should not be treated as the current movement/combat authority.
- The website invite page stores and displays setup commands. It does not keep the live lobby process running.

For a private internet test:

```txt
opendungeon-host --host 0.0.0.0 --public-url http://YOUR_SERVER_IP:3737 --mode coop --seed 2423368 --port 3737
opendungeon join http://YOUR_SERVER_IP:3737
```

The later browser-native path can replace this only when the browser client has an authoritative realtime adapter that preserves validated command-log semantics.

## Release path

Changesets tracks package releases. Website changes can be deployed independently, but package versions still move through the repo release flow and generated changelog.
