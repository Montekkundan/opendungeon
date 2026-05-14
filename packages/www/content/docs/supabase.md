# Supabase

Supabase is used for the website account path and future cloud-backed game state. The website can render without private secrets, but login and profile data require the public Supabase URL and anonymous key.

## Project

The current local setup targets the `opendungeon` Supabase project. Public browser env vars are safe to expose when they are paired with Row Level Security and scoped policies.

```txt
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Auth and profile rows

The profile page uses Supabase auth and creates an `opendungeon_profiles` row for authenticated users. The row belongs to the user id, and RLS should prevent one player from reading or editing another player's profile.

## Database direction

- Profiles store public account-facing player metadata.
- Cloud saves should belong to the authenticated owner.
- Logged-in `/create` submissions save lobby metadata as `opendungeon_worlds` rows with `lobby-created` world events, so future GM/cloud flows can link an invite back to the owner.
- GM world patches should be auditable and validated before they affect a run.
- Invite and lobby metadata should stay separate from authoritative CLI session state until a realtime adapter exists.

## Local setup notes

Keep `.env.local` out of git. Use `.env.example` as the source of expected variable names, then configure the same public env vars in Vercel before deploying the website.
