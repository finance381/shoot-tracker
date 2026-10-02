-- ============================================================
-- Multiple assignees per shoot
-- assignee_id stays as the first/primary person so anything still
-- reading it keeps working; assignee_ids holds the full list.
-- Run this once in the Supabase SQL editor.
-- ============================================================

alter table public.shoots
  add column if not exists assignee_ids uuid[] not null default '{}'::uuid[];

-- Carry every existing shoot's single assignee into the new list.
update public.shoots
   set assignee_ids = array[assignee_id]
 where assignee_id is not null
   and cardinality(assignee_ids) = 0;

-- Membership lookups ("shoots assigned to this person") hit this a lot.
create index if not exists shoots_assignee_ids_idx
  on public.shoots using gin (assignee_ids);
