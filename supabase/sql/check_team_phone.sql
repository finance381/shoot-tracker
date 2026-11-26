-- check_team_phone(phone) — SECURITY DEFINER lookup used by the Set-up-your-
-- password flow before the user is signed in.
--
-- Context: RLS on team_members leaves anon with column-level access to only
-- (id, name, role, is_admin). The pre-login existence check cannot filter by
-- email or phone directly from the client, since the WHERE clause needs SELECT
-- on those columns. This RPC runs as definer, bypassing column grants, and
-- returns a plain boolean — no PII leaves the DB.
--
-- The function accepts the raw phone input; it matches either the stored
-- phone column (digits-only) or the derived fake-email format the app uses
-- for Supabase Auth (`<digits>@shoottracker.app`).

create or replace function public.check_team_phone(p_phone text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.team_members
    where phone = regexp_replace(p_phone, '\D', '', 'g')
       or email = regexp_replace(p_phone, '\D', '', 'g') || '@shoottracker.app'
  );
$$;

grant execute on function public.check_team_phone(text) to anon, authenticated;
