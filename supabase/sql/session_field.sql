-- Add session field to shoots and shoot_requests.
-- Session captures the time-of-day bucket: Morning, Lunch, Sundowner, Night.
-- Shoots: optional. Requests: required at form level (not enforced in DB — we
-- let the app validate so legacy rows don't fail on backfill).

alter table public.shoots add column if not exists session text;
alter table public.shoot_requests add column if not exists session text;
