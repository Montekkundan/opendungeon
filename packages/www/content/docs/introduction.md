# opendungeon docs

opendungeon is a terminal roguelike RPG built around seeded dungeon runs, local-first saves, and optional GM-created worlds. The engine owns the rules and state transitions. AI-assisted content belongs to logged-in GM worlds and enters the game as validated data patches, not as free-form runtime behavior.

## Why I built this

I wanted a dungeon game I could play at the same time with coworkers and friends at work. The goal is a terminal RPG where one person can start a run, friends can join from their own terminals, and the group can share the same dungeon, story, fights, and village progress.

## What the game is

- A terminal dungeon crawler rendered with OpenTUI.
- A deterministic RPG loop where the same seed can replay the same floor layout and event placement.
- A local game first, with optional website profile and invite pages.
- A multiplayer direction that starts with CLI-hosted local sessions before browser-hosted realtime play.
- A one-laptop multiplayer flow where multiple guest sessions can run from different terminal tabs or apps.

## Current shape

The terminal client is still the primary game surface. The website gives players install commands, docs, profile login, and shareable lobby pages.

## How to read these docs

Use the section pages for player-facing flows like install, controls, game modes, multiplayer, account, and deployment. Use the game system pages for the RPG rules: core loop, combat, NPCs, monsters, village progression, and GM-created content.
