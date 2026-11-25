-- Keep the physical roll book synchronized with audited database changes.
-- The UI still has a manual refresh path when Realtime is unavailable.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'inventory_active_rolls'
    ) then
      alter publication supabase_realtime add table public.inventory_active_rolls;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'inventory_roll_logs'
    ) then
      alter publication supabase_realtime add table public.inventory_roll_logs;
    end if;
  end if;
end;
$$;
