-- ============================================================
-- Row Level Security for the main tables
--
-- Context: the team app signs users in via Supabase auth (role =
-- authenticated), the requester app has no auth session and talks to the DB
-- with the anon key (role = anon). Blocking anon outright would break the
-- requester flow, so these policies:
--   • enable RLS on every table
--   • give authenticated full access (team app keeps working as-is)
--   • give anon exactly what the requester app does today, nothing more
--
-- This file reflects the pass that was actually run against the live DB on
-- 2026-11-05. Run one section at a time in the Supabase SQL editor and test
-- the team app and the requester app between each section. Each one is safe
-- to re-run — policies are dropped before they are re-created.
--
-- push_subscriptions, audit_log and requesters are deliberately tighter than a
-- blanket authenticated-ALL: they keep their existing narrower policies (or
-- none at all), and this file only cleans up the over-broad policy if a wrong
-- pass created it.
-- ============================================================


-- =============== shoots ===============
-- Requester calendar reads this to show what is already scheduled. Writes are
-- strictly admin/team work.
alter table public.shoots enable row level security;

drop policy if exists shoots_anon_select on public.shoots;
create policy shoots_anon_select on public.shoots
  for select to anon using (true);

drop policy if exists shoots_auth_all on public.shoots;
create policy shoots_auth_all on public.shoots
  for all to authenticated using (true) with check (true);


-- =============== shoot_requests ===============
-- A requester reads the list filtered client-side to their own requester_id,
-- creates new requests, edits a pending one and can delete it. No safe way to
-- scope this on the DB without putting requester_id in the JWT, so anon gets
-- the same table-level read access they have today — the client already
-- filters by requester_id on every path.
alter table public.shoot_requests enable row level security;

drop policy if exists shoot_requests_anon_select on public.shoot_requests;
create policy shoot_requests_anon_select on public.shoot_requests
  for select to anon using (true);

drop policy if exists shoot_requests_anon_insert on public.shoot_requests;
create policy shoot_requests_anon_insert on public.shoot_requests
  for insert to anon with check (true);

drop policy if exists shoot_requests_anon_update on public.shoot_requests;
create policy shoot_requests_anon_update on public.shoot_requests
  for update to anon using (status = 'pending') with check (status = 'pending');

drop policy if exists shoot_requests_anon_delete on public.shoot_requests;
create policy shoot_requests_anon_delete on public.shoot_requests
  for delete to anon using (status = 'pending');

drop policy if exists shoot_requests_auth_all on public.shoot_requests;
create policy shoot_requests_auth_all on public.shoot_requests
  for all to authenticated using (true) with check (true);


-- =============== team_members ===============
-- The requester app only needs id + name (shown as the assignee on a request).
-- Email, phone, auth_id and tab_access are admin-only columns, so hide them
-- from anon with a column-level grant — the RLS policy on top still has to
-- exist for select to be allowed at all.
alter table public.team_members enable row level security;

drop policy if exists team_members_anon_select on public.team_members;
create policy team_members_anon_select on public.team_members
  for select to anon using (true);

drop policy if exists team_members_auth_all on public.team_members;
create policy team_members_auth_all on public.team_members
  for all to authenticated using (true) with check (true);

-- Column-level narrowing, independent of RLS.
revoke select on public.team_members from anon;
grant select (id, name, role, is_admin) on public.team_members to anon;


-- =============== masters ===============
-- Locations and department list. Read-only from the requester side.
alter table public.masters enable row level security;

drop policy if exists masters_anon_select on public.masters;
create policy masters_anon_select on public.masters
  for select to anon using (true);

drop policy if exists masters_auth_all on public.masters;
create policy masters_auth_all on public.masters
  for all to authenticated using (true) with check (true);


-- =============== requester_push_subs ===============
-- A requester upserts their own push subscription. SELECT is not needed by
-- the client — Edge Functions that send pushes run as service_role and
-- bypass RLS anyway — so anon loses read here, which also hides every other
-- requester's p256dh/auth tokens.

-- Pre-existing policies from an earlier setup that are overly permissive or
-- duplicates of the new ones; drop them before writing the new policies.
drop policy if exists requester_push_full on public.requester_push_subs;
drop policy if exists requester_push_auth on public.requester_push_subs;

alter table public.requester_push_subs enable row level security;

drop policy if exists requester_push_subs_anon_insert on public.requester_push_subs;
create policy requester_push_subs_anon_insert on public.requester_push_subs
  for insert to anon with check (true);

drop policy if exists requester_push_subs_anon_update on public.requester_push_subs;
create policy requester_push_subs_anon_update on public.requester_push_subs
  for update to anon using (true) with check (true);

drop policy if exists requester_push_subs_auth_all on public.requester_push_subs;
create policy requester_push_subs_auth_all on public.requester_push_subs
  for all to authenticated using (true) with check (true);


-- =============== push_subscriptions (team) ===============
-- The table already has two policies that are tighter than a blanket
-- authenticated-ALL, so none is created here:
--   • users_manage_own_subs — team members manage their own push subscription
--     only (scoped to their own member_id)
--   • service_role_all — Edge Functions send notifications
alter table public.push_subscriptions enable row level security;

-- Clean-up in case a wrong pass created the blanket policy.
drop policy if exists push_subscriptions_auth_all on public.push_subscriptions;


-- =============== audit_log ===============
-- The table already has insert_audit (authenticated INSERT) and read_audit
-- (authenticated SELECT). That keeps it append-only on purpose; a blanket ALL
-- would let members tamper with history, so no auth_all policy is created.
alter table public.audit_log enable row level security;

-- Clean-up in case a wrong pass created the blanket policy.
drop policy if exists audit_log_auth_all on public.audit_log;


-- =============== requesters ===============
-- Stays fully locked: RLS on and zero policies. Passwords live here. Only
-- SECURITY DEFINER RPCs (login_requester) touch this table; no app code reads
-- it directly.
alter table public.requesters enable row level security;

-- Clean-up in case a wrong pass created the blanket policy.
drop policy if exists requesters_auth_all on public.requesters;


-- =============== youtube_videos ===============
-- Already covered by supabase/sql/youtube_videos.sql.
-- Left out here on purpose so re-running does not clobber those policies.
