-- ============================================================
-- YouTube videos
-- Sales videos published to YouTube. Entries are added manually
-- from the YouTube tab and optionally linked to a shoot.
-- Run this once in the Supabase SQL editor.
-- ============================================================

create table if not exists public.youtube_videos (
  id          uuid primary key default gen_random_uuid(),
  -- optional link back to the shoot the video came from
  shoot_id    uuid references public.shoots(id) on delete set null,
  title       text not null,
  url         text,
  -- when it went up on YouTube (separate from the shoot date)
  posted_at   timestamptz,
  posted_by   uuid references public.team_members(id) on delete set null,
  status      text not null default 'Live',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists youtube_videos_shoot_id_idx  on public.youtube_videos (shoot_id);

-- One YouTube record per shoot. Plain (not partial) because a partial index
-- cannot back an ON CONFLICT target; Postgres treats NULLs as distinct anyway,
-- so unlinked entries are still unrestricted.
create unique index if not exists youtube_videos_shoot_unique
  on public.youtube_videos (shoot_id);
create index if not exists youtube_videos_posted_at_idx on public.youtube_videos (posted_at desc nulls last);

alter table public.youtube_videos enable row level security;

-- Any signed-in team member can read and manage entries, same as Shoots.
drop policy if exists youtube_videos_select on public.youtube_videos;
create policy youtube_videos_select on public.youtube_videos
  for select to authenticated using (true);

drop policy if exists youtube_videos_insert on public.youtube_videos;
create policy youtube_videos_insert on public.youtube_videos
  for insert to authenticated with check (true);

drop policy if exists youtube_videos_update on public.youtube_videos;
create policy youtube_videos_update on public.youtube_videos
  for update to authenticated using (true) with check (true);

drop policy if exists youtube_videos_delete on public.youtube_videos;
create policy youtube_videos_delete on public.youtube_videos
  for delete to authenticated using (true);
