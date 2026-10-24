-- The profile migration attempted to drop this constraint using the full
-- untruncated generated name. PostgreSQL stored the name with its 63-byte
-- identifier limit, so the legacy role constraint remained in production.
alter table public.organization_memberships
  drop constraint if exists organization_memberships_organization_id_user_id_role_branc_key;
