create table if not exists public.admin_deletion_audits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  entity_type text not null check (entity_type in ('sale', 'cash_session', 'cash_register', 'cash_movement', 'test_batch')),
  entity_id uuid not null,
  entity_code text not null default '',
  action text not null default 'permanent_delete',
  reason text not null default '',
  is_test_cleanup boolean not null default false,
  restore_inventory boolean not null default true,
  cascade_sales boolean not null default false,
  affected_session_ids uuid[] not null default '{}',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
