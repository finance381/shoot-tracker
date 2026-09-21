-- ============================================================
-- Normalise the legacy 'Editing' status to 'edited'
--
-- The app writes 'edited'; some older rows hold 'Editing'. Anything
-- that is not Planned/Shot/edited/Posted was counted in report totals
-- but never matched a bucket, so the numbers did not add up.
--
-- Optional: the app already normalises on read, so reports are correct
-- without this. Running it cleans the data at source.
-- ============================================================

update public.shoots
set status = 'edited'
where status in ('Editing', 'Edited');

update public.shoots
set type_statuses = (
  select jsonb_object_agg(k, case when v in ('Editing', 'Edited') then 'edited' else v end)
  from jsonb_each_text(type_statuses) as t(k, v)
)
where type_statuses::text ~ '"(Editing|Edited)"';

update public.audit_log set from_status = 'edited' where from_status in ('Editing', 'Edited');
update public.audit_log set to_status   = 'edited' where to_status   in ('Editing', 'Edited');

-- Re-derive each shoot's overall stage from its deliverables (least advanced
-- wins), so the status column cannot drift from type_statuses again.
update public.shoots s
set status = sub.derived
from (
  select s2.id,
         (array['Planned','Shot','edited','Posted'])[
           min(array_position(array['Planned','Shot','edited','Posted'], v))
         ] as derived
  from public.shoots s2, jsonb_each_text(s2.type_statuses) as t(k, v)
  where s2.type_statuses is not null
    and v = any (array['Planned','Shot','edited','Posted'])
  group by s2.id
) sub
where s.id = sub.id
  and s.status is distinct from sub.derived;
