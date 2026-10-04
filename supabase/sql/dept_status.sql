-- ============================================================
-- Per-department status tracking
-- shoots.type_statuses now stores { typeName: { department: status } }
-- instead of { typeName: status }. No data rewrite needed here — the
-- app treats a legacy flat string value as that status applying to
-- every department on the shoot, and upgrades the shape to nested the
-- first time any department's status is edited.
--
-- This migration only adds the column the audit trail needs to record
-- which department a status change belongs to.
-- Run this once in the Supabase SQL editor.
-- ============================================================

alter table public.audit_log
  add column if not exists department text;

-- Existing rows keep department = null; they predate per-department
-- tracking and applied to every department on the shoot at the time.
