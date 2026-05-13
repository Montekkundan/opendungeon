# opendungeon docs

opendungeon is a terminal roguelike RPG built around deterministic dungeon runs, local-first saves, and a controlled AI-admin layer. The engine owns the rules and state transitions. Generated content enters the game as validated data patches, not as free-form runtime behavior.

## What the game is

- A terminal dungeon crawler rendered with OpenTUI.
- A deterministic RPG loop where the same seed can replay the same floor layout and event placement.
- A local game first, with Supabase-backed account and profile work on the website.
- A multiplayer direction that starts with CLI-hosted local sessions before browser-hosted realtime play.
- A contributor-friendly local multiplayer flow where multiple guest sessions can run on one laptop from different terminal tabs or apps.

## Current shape

The terminal client is still the primary game surface. The website gives players install commands, docs, profile login, and shareable lobby pages. The same repo also carries release automation, Changesets, Supabase migrations, and headless tests so gameplay can be checked without driving the UI.

## How to read these docs

Use the section pages for product-facing flows like install, controls, multiplayer, Supabase, and deployment. Use the game system pages for the RPG rules: core loop, combat, NPCs, monsters, village progression, and AI-admin content.

Contributors should also read `CONTRIBUTING.md` in the repo root for the file map, one-laptop multiplayer commands, website commands, and release checks.
