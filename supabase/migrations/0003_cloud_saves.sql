create table if not exists public.opendungeon_cloud_saves (
  owner_id uuid not null references auth.users(id) on delete cascade,
  save_id text not null,
  summary jsonb not null,
  encrypted_payload jsonb not null,
  checksum text not null,
  generation integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, save_id)
);

create index if not exists opendungeon_cloud_saves_owner_updated_idx
  on public.opendungeon_cloud_saves(owner_id, updated_at desc);

alter table public.opendungeon_cloud_saves enable row level security;

create policy "cloud saves are owner readable"
  on public.opendungeon_cloud_saves for select
  using (auth.uid() = owner_id);

create policy "cloud saves are owner writable"
  on public.opendungeon_cloud_saves for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
