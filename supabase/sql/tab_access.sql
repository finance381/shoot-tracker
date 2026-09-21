-- ============================================================
-- Per-member tab access
-- Team, YouTube and Reports are hidden by default. An admin grants
-- them per person; admins always see everything.
-- Run this once in the Supabase SQL editor.
-- ============================================================

alter table public.team_members
  add column if not exists tab_access text[] not null default '{}';

-- Existing admins keep seeing everything through the is_admin check,
-- so nothing needs backfilling here.
