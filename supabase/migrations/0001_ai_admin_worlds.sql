create extension if not exists vector with schema extensions;

create table if not exists public.opendungeon_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opendungeon_worlds (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  seed integer not null,
  config jsonb not null,
  generation integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opendungeon_world_events (
  id bigserial primary key,
  world_id text not null references public.opendungeon_worlds(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  event_id text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.opendungeon_lore_memory (
  id bigserial primary key,
  world_id text references public.opendungeon_worlds(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  fts tsvector generated always as (to_tsvector('english', title || ' ' || content)) stored,
  embedding extensions.vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists opendungeon_worlds_owner_idx on public.opendungeon_worlds(owner_id);
create index if not exists opendungeon_world_events_world_idx on public.opendungeon_world_events(world_id, created_at desc);
create index if not exists opendungeon_world_events_owner_idx on public.opendungeon_world_events(owner_id);
create index if not exists opendungeon_lore_world_idx on public.opendungeon_lore_memory(world_id);
create index if not exists opendungeon_lore_owner_idx on public.opendungeon_lore_memory(owner_id);
create index if not exists opendungeon_lore_fts_idx on public.opendungeon_lore_memory using gin(fts);
create index if not exists opendungeon_lore_embedding_idx on public.opendungeon_lore_memory using hnsw (embedding vector_cosine_ops);

alter table public.opendungeon_profiles enable row level security;
alter table public.opendungeon_worlds enable row level security;
alter table public.opendungeon_world_events enable row level security;
alter table public.opendungeon_lore_memory enable row level security;

create policy "profiles are self readable"
  on public.opendungeon_profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles are self insertable"
  on public.opendungeon_profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profiles are self updatable"
  on public.opendungeon_profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "profiles are self deletable"
  on public.opendungeon_profiles for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "worlds are owner readable"
  on public.opendungeon_worlds for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "worlds are owner insertable"
  on public.opendungeon_worlds for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "worlds are owner updatable"
  on public.opendungeon_worlds for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "worlds are owner deletable"
  on public.opendungeon_worlds for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "world events are owner readable"
  on public.opendungeon_world_events for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "world events are owner insertable"
  on public.opendungeon_world_events for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "world events are owner updatable"
  on public.opendungeon_world_events for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "world events are owner deletable"
  on public.opendungeon_world_events for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "lore memory is owner readable"
  on public.opendungeon_lore_memory for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "lore memory is owner insertable"
  on public.opendungeon_lore_memory for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "lore memory is owner updatable"
  on public.opendungeon_lore_memory for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "lore memory is owner deletable"
  on public.opendungeon_lore_memory for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.opendungeon_match_lore(
  query_embedding extensions.vector(1536),
  match_count int,
  filter_world_id text default null
)
returns setof public.opendungeon_lore_memory
language sql
stable
set search_path = public, extensions
as $$
  select *
  from public.opendungeon_lore_memory
  where (filter_world_id is null or world_id = filter_world_id)
    and embedding is not null
  order by embedding <=> query_embedding
  limit least(match_count, 50);
$$;

grant usage on schema public to authenticated;
grant usage on schema extensions to authenticated;

grant select, insert, update, delete on table public.opendungeon_profiles to authenticated;
grant select, insert, update, delete on table public.opendungeon_worlds to authenticated;
grant select, insert, update, delete on table public.opendungeon_world_events to authenticated;
grant select, insert, update, delete on table public.opendungeon_lore_memory to authenticated;

grant usage, select on sequence public.opendungeon_world_events_id_seq to authenticated;
grant usage, select on sequence public.opendungeon_lore_memory_id_seq to authenticated;

grant execute on function public.opendungeon_match_lore(extensions.vector, integer, text) to authenticated;
