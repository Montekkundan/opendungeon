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

## What still needs infrastructure

The current multiplayer game host is a CLI WebSocket process. Vercel can describe and link lobbies, but it cannot keep a long-running game process alive as a normal static website page. Internet multiplayer needs a reachable host, a container/service, or a future browser realtime adapter.

## Release path

Changesets tracks package releases. Website changes can be deployed independently, but package versions still move through the repo release flow and generated changelog.
