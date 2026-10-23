-- Keep only the authenticated read path protected by RLS; all writes use RPCs.
revoke all privileges on table public.parked_pos_orders from public, anon, authenticated;
grant select on table public.parked_pos_orders to authenticated;
